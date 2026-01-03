/**
 * ZIP ESP32-S3 Camera Firmware - Application Main
 * 
 * Based on ELEGOO Smart Robot Car V4.0 Camera Module
 * Refactored for ESP32-S3 with modular architecture.
 * 
 * Features:
 * - WiFi Access Point with MAC-based SSID
 * - Camera streaming on port 81
 * - TCP server on port 100 for robot commands
 * - Serial2 bridge to Arduino UNO at 115200 baud
 * - Health/diagnostics endpoint
 * - Boot-safe GPIO0 handling
 */

#include <Arduino.h>
#include <WiFi.h>
#include "esp_system.h"
#include "esp_task_wdt.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/timers.h"

// Board and configuration
#include "board/board_esp32s3_elegoo_cam.h"
#include "config/build_config.h"
#include "config/runtime_config.h"

// Service modules
#include "drivers/camera/camera_service.h"
#include "drivers/uart/uart_bridge.h"
#include "net/net_service.h"
#include "web/web_server.h"
#include "config/safe_mode.h"

// ============================================================================
// Global State
// ============================================================================
static WiFiServer tcpServer(CONFIG_TCP_PORT);
static String wifiName;
static bool clientConnected = false;
static volatile bool cameraOk = false;  // Volatile for FreeRTOS task access
static volatile bool cameraInitDone = false;  // Volatile for FreeRTOS task access
static TaskHandle_t cameraTaskHandle = NULL;
static TaskHandle_t cameraWdtTaskHandle = NULL;  // Task to feed watchdog during camera init
static volatile bool cameraInitInProgress = false;  // Flag to control watchdog feeding task

// ============================================================================
// Boot Banner
// ============================================================================
static void print_boot_banner() {
    Serial.println();
    Serial.println("==========================================");
    Serial.println("  ZIP ESP32-S3 Camera Firmware v2.0");
    Serial.println("  Board: " BOARD_NAME);
    Serial.println("==========================================");
    
    // Chip info
    Serial.printf("Chip: %s rev %d, %d cores @ %lu MHz\n",
                  ESP.getChipModel(),
                  ESP.getChipRevision(),
                  ESP.getChipCores(),
                  (unsigned long)ESP.getCpuFreqMHz());
    
    // Memory info
    Serial.printf("Flash: %lu MB\n", ESP.getFlashChipSize() / (1024 * 1024));
    Serial.printf("Heap: %lu bytes free\n", ESP.getFreeHeap());
    
    // PSRAM info
    if (psramFound()) {
        Serial.printf("PSRAM: %lu bytes (%lu free)\n",
                      (unsigned long)ESP.getPsramSize(),
                      (unsigned long)ESP.getFreePsram());
    } else {
        Serial.println("PSRAM: Not detected");
        LOG_W("BOOT", "PSRAM not found - check board_build.arduino.memory_type = qio_opi");
    }
    
    // Pin configuration
    Serial.printf("Camera: XCLK=%d SIOD=%d SIOC=%d PCLK=%d\n",
                  CAM_XCLK_GPIO, CAM_SIOD_GPIO, CAM_SIOC_GPIO, CAM_PCLK_GPIO);
    Serial.printf("UART: RX=%d TX=%d @ %d baud\n",
                  UART_RX_GPIO, UART_TX_GPIO, CONFIG_UART_BAUD);
    Serial.printf("LED: GPIO%d\n", LED_STATUS_GPIO);
    
    Serial.println("==========================================");
}

// ============================================================================
// Watchdog Feeding Task (feeds TWDT during blocking camera init)
// ============================================================================
static void camera_wdt_task(void* parameter) {
    // Register this task with TWDT
    unsigned long task_start = millis();
    esp_err_t wdt_add_result = esp_task_wdt_add(NULL);
    Serial.printf("[DBG-CAM-WDT] Watchdog feeding task started at %lu ms, add_result=0x%x\n", 
                  task_start, wdt_add_result);
    
    // Feed watchdog IMMEDIATELY after registration
    esp_task_wdt_reset();
    Serial.printf("[DBG-CAM-WDT] Initial watchdog feed at %lu ms\n", millis());
    
    unsigned long last_feed = millis();
    int feed_count = 1;  // Count includes initial feed
    
    // Feed watchdog every 500ms while camera init is in progress (very frequent)
    // This ensures watchdog is fed well before any timeout
    while (cameraInitInProgress) {
        vTaskDelay(pdMS_TO_TICKS(500));  // Wait 500ms (very frequent)
        if (cameraInitInProgress) {
            unsigned long now = millis();
            esp_err_t feed_result = esp_task_wdt_reset();  // Feed watchdog
            feed_count++;
            Serial.printf("[DBG-CAM-WDT] Fed watchdog #%d at %lu ms (elapsed=%lu ms, result=0x%x)\n", 
                          feed_count, now, now - last_feed, feed_result);
            last_feed = now;
        }
    }
    
    Serial.printf("[DBG-CAM-WDT] Watchdog feeding task stopping (fed %d times total)\n", feed_count);
    
    // Unregister before deleting
    esp_err_t wdt_del_result = esp_task_wdt_delete(NULL);
    Serial.printf("[DBG-CAM-WDT] Unregistered from watchdog (result=0x%x)\n", wdt_del_result);
    cameraWdtTaskHandle = NULL;
    vTaskDelete(NULL);
}

// ============================================================================
// Camera Initialization Task (FreeRTOS)
// ============================================================================
/**
 * FreeRTOS task for camera initialization.
 * 
 * This task runs camera initialization asynchronously to avoid blocking
 * setup(). It handles safe mode checks, watchdog management, and error
 * tracking. The task deletes itself when initialization completes.
 * 
 * Requirements:
 * - Do NOT do camera init in blocking setup() path without WDT handling
 * - Use FreeRTOS tasks explicitly
 * - Use a timer to feed TWDT during blocking esp_camera_init() call
 * - Never allow infinite blocking without timeout
 */
static void camera_init_task(void* parameter) {
    // Register this task with TWDT - we'll feed it via timer during blocking init
    unsigned long task_start = millis();
    esp_err_t wdt_add_result = esp_task_wdt_add(NULL);
    Serial.printf("[DBG-CAM-TASK] Camera init task started at %lu ms, wdt_add_result=0x%x\n", 
                  task_start, wdt_add_result);
    
    // Feed watchdog immediately after registration
    esp_task_wdt_reset();
    Serial.printf("[DBG-CAM-TASK] Initial watchdog feed at %lu ms\n", millis());
    
#if ENABLE_CAMERA
    // Check safe mode - skip camera if too many failures
    if (safe_mode_is_enabled()) {
        LOG_W("CAM-TASK", "Safe mode enabled - skipping camera init");
        LOG_W("CAM-TASK", "Camera failed %d times, booting without camera", safe_mode_get_fail_count());
        cameraOk = false;
        
        // #region agent log - Hypothesis C: Safe mode active
        Serial.printf("[DBG-CAM-TASK] Safe mode active, camera disabled\n");
        // #endregion
    } else {
        // #region agent log - Hypothesis A: Camera init start
        Serial.printf("[DBG-CAM-TASK] Starting camera init at %lu ms\n", millis());
        // #endregion
        
        LOG_I("CAM-TASK", "Initializing camera...");
        
        // Create a watchdog feeding task on core 0 to feed TWDT during blocking camera init
        // CRITICAL: Must be on core 0 (different from camera task on core 1) so it can run
        // while esp_camera_init() blocks core 1
        unsigned long before_wdt_task = millis();
        cameraInitInProgress = true;
        Serial.printf("[DBG-CAM-TASK] Creating watchdog feeding task on CORE 0 at %lu ms\n", before_wdt_task);
        
        BaseType_t wdtTaskResult = xTaskCreatePinnedToCore(
            camera_wdt_task,              // Task function
            "cam_wdt",                     // Task name
            2048,                          // Stack size
            NULL,                          // Parameters
            2,                             // Priority (higher than camera task)
            &cameraWdtTaskHandle,          // Task handle
            0                              // Core ID: 0 (DIFFERENT from camera task on core 1)
        );
        
        unsigned long after_wdt_task = millis();
        if (wdtTaskResult == pdPASS) {
            Serial.printf("[DBG-CAM-TASK] Watchdog feeding task created successfully on CORE 0 at %lu ms (took %lu ms)\n", 
                          after_wdt_task, after_wdt_task - before_wdt_task);
            Serial.printf("[DBG-CAM-TASK] Watchdog task will run on core 0 while camera task blocks core 1\n");
        } else {
            Serial.printf("[DBG-CAM-TASK] FAILED to create watchdog feeding task (result=%d)\n", wdtTaskResult);
            LOG_W("CAM-TASK", "Failed to create watchdog feeding task");
        }
        
        // Feed watchdog before blocking camera init
        esp_task_wdt_reset();
        Serial.printf("[DBG-CAM-TASK] Fed watchdog before camera_init() at %lu ms\n", millis());
        
        // Camera init (blocking call - can take several seconds)
        // Watchdog feeding task will feed TWDT periodically during this call
        unsigned long before_camera_init = millis();
        Serial.printf("[DBG-CAM-TASK] About to call camera_init() at %lu ms\n", before_camera_init);
        bool result = camera_init();
        unsigned long after_camera_init = millis();
        Serial.printf("[DBG-CAM-TASK] camera_init() returned %s at %lu ms (took %lu ms)\n", 
                      result ? "SUCCESS" : "FAILED", after_camera_init, after_camera_init - before_camera_init);
        
        // Stop the watchdog feeding task
        cameraInitInProgress = false;
        // Give it a moment to exit cleanly
        vTaskDelay(pdMS_TO_TICKS(100));
        Serial.printf("[DBG-CAM] Stopped watchdog feeding task after camera init\n");
        
        cameraOk = result;
        
        if (result) {
            LOG_I("CAM-TASK", "Camera: OK");
            
            // #region agent log - Hypothesis A: Camera init success
            Serial.printf("[DBG-CAM-TASK] Camera init succeeded at %lu ms\n", millis());
            // #endregion
        } else {
            LOG_W("CAM-TASK", "Camera: FAILED (%s)", camera_last_error());
            LOG_W("CAM-TASK", "Failure count: %d/%d", safe_mode_get_fail_count(), SAFE_MODE_MAX_FAILURES);
            
            if (safe_mode_is_enabled()) {
                LOG_E("CAM-TASK", "Safe mode activated - camera disabled");
            }
            LOG_I("CAM-TASK", "Continuing without camera...");
            
            // #region agent log - Hypothesis B: Camera init failure
            Serial.printf("[DBG-CAM-TASK] Camera init failed: %s\n", camera_last_error());
            // #endregion
        }
    }
#else
    LOG_I("CAM-TASK", "Camera disabled by build config");
    cameraOk = false;
#endif
    
    // Feed watchdog before unregistering
    esp_task_wdt_reset();
    Serial.printf("[DBG-CAM-TASK] Fed watchdog before unregistering at %lu ms\n", millis());
    
    // Unregister from TWDT before deleting task
    esp_err_t wdt_del_result = esp_task_wdt_delete(NULL);
    Serial.printf("[DBG-CAM-TASK] Unregistered from watchdog (result=0x%x) at %lu ms\n", 
                  wdt_del_result, millis());
    
    // Mark camera initialization as complete
    cameraInitDone = true;
    unsigned long task_end = millis();
    Serial.printf("[DBG-CAM-TASK] CAMERA INIT DONE at %lu ms (total task duration: %lu ms)\n", 
                  task_end, task_end - task_start);
    
    // Task complete - delete self
    cameraTaskHandle = NULL;
    vTaskDelete(NULL);
}

// ============================================================================
// Reset Reason Logging
// ============================================================================
static void log_reset_reason() {
    esp_reset_reason_t reason = esp_reset_reason();
    const char* reason_str = "UNKNOWN";
    
    switch (reason) {
        case ESP_RST_POWERON:   reason_str = "POWERON"; break;
        case ESP_RST_EXT:       reason_str = "EXTERNAL"; break;
        case ESP_RST_SW:        reason_str = "SOFTWARE"; break;
        case ESP_RST_PANIC:     reason_str = "PANIC"; break;
        case ESP_RST_INT_WDT:   reason_str = "INT_WDT"; break;
        case ESP_RST_TASK_WDT:  reason_str = "TASK_WDT"; break;
        case ESP_RST_WDT:       reason_str = "WDT"; break;
        case ESP_RST_DEEPSLEEP: reason_str = "DEEPSLEEP"; break;
        case ESP_RST_BROWNOUT:  reason_str = "BROWNOUT"; break;
        case ESP_RST_SDIO:      reason_str = "SDIO"; break;
        default:                reason_str = "UNKNOWN"; break;
    }
    
    Serial.printf("[BOOT] Reset reason: %s (0x%x)\n", reason_str, (int)reason);
    
    // Log WiFi mode at boot (before any WiFi operations)
    wifi_mode_t wifi_mode = WiFi.getMode();
    const char* mode_str = "UNKNOWN";
    switch (wifi_mode) {
        case WIFI_OFF:     mode_str = "OFF"; break;
        case WIFI_STA:     mode_str = "STA"; break;
        case WIFI_AP:      mode_str = "AP"; break;
        case WIFI_AP_STA:  mode_str = "AP_STA"; break;
        default:           mode_str = "UNKNOWN"; break;
    }
    Serial.printf("[BOOT] WiFi mode: %s (0x%x)\n", mode_str, (int)wifi_mode);
}

// ============================================================================
// Self-Test Mode
// ============================================================================
#if ENABLE_SELF_TEST
static void run_self_test() {
    LOG_I("TEST", "Running self-test...");
    
    // Test 1: Camera capture
    if (camera_is_ok()) {
        camera_fb_t* fb = camera_capture();
        if (fb) {
            LOG_I("TEST", "Camera: PASS (%lu bytes)", fb->len);
            camera_return_frame(fb);
        } else {
            LOG_E("TEST", "Camera: FAIL (capture failed)");
        }
    } else {
        LOG_W("TEST", "Camera: SKIP (not initialized)");
    }
    
    // Test 2: UART ping
    if (uart_is_ok()) {
        uart_tx_string("{\"N\":0,\"H\":\"ping\"}");
        LOG_I("TEST", "UART: PASS (ping sent)");
    } else {
        LOG_W("TEST", "UART: SKIP (not ready)");
    }
    
    // Test 3: WiFi
    if (net_is_ok()) {
        LOG_I("TEST", "WiFi: PASS (IP: %s)", net_get_ip().toString().c_str());
    } else {
        LOG_E("TEST", "WiFi: FAIL");
    }
    
    LOG_I("TEST", "Self-test complete");
}
#endif

// ============================================================================
// TCP Client Handler (ELEGOO Protocol) - Non-Blocking
// ============================================================================
// Non-blocking TCP handler to prevent loop() from being held hostage
// Never uses while(client.connected()) - processes bounded work per iteration
static WiFiClient s_client;
static String rxBuffer;
static String txBuffer;
static unsigned long lastHeartbeat = 0;
static uint8_t heartbeatMissed = 0;
static bool heartbeatReceived = false;
static bool wasConnected = false;

static void handleTcpClientNonBlocking() {
    // Accept new client if none connected
    if (!s_client || !s_client.connected()) {
        WiFiClient newClient = tcpServer.available();
        if (newClient) {
            s_client = newClient;
            clientConnected = true;
            wasConnected = true;
            LOG_I("TCP", "Client connected");
            rxBuffer = "";
            txBuffer = "";
            lastHeartbeat = millis();
            heartbeatMissed = 0;
            heartbeatReceived = false;
        } else {
            if (wasConnected) {
                wasConnected = false;
                uart_tx_string("{\"N\":100}");  // Stop command
            }
            clientConnected = false;
            return;
        }
    }
    
    // Bound work per loop: read up to N bytes from TCP
    const int MAX_READ_BYTES = 256;
    int readCount = 0;
    
    while (s_client.available() && readCount < MAX_READ_BYTES) {
        char c = (char)s_client.read();
        readCount++;
        
#if DEBUG_UART_FRAMES
        Serial.print(c);
#endif
        
        if (c == '{') {
            rxBuffer = "{";
        } else if (rxBuffer.length() > 0) {
            if (c != ' ') rxBuffer += c;  // Skip spaces
            
            if (c == '}') {
                // Complete message received
                if (rxBuffer == "{Heartbeat}") {
                    heartbeatReceived = true;
                } else {
                    // #region agent log - Hypothesis A/B: Log command forwarding
                    Serial.printf("[DBG-TX] Forwarding to UNO: %s\n", rxBuffer.c_str());
                    // #endregion
                    // Forward to UNO via UART bridge
                    size_t sent = uart_tx_string(rxBuffer.c_str());
                    // #region agent log - Hypothesis B: Confirm bytes sent
                    Serial.printf("[DBG-TX] Sent %d bytes via GPIO%d\n", sent, uart_get_tx_pin());
                    // #endregion
                }
                rxBuffer = "";
            }
        }
    }
    
    // Pump UART->TCP, bounded
    const int MAX_UART_BYTES = 256;
    int uartCount = 0;
    // #region agent log - Hypothesis C/D: Check UART RX
    size_t rxAvail = uart_rx_available();
    if (rxAvail > 0) {
        Serial.printf("[DBG-RX] uart_rx_available()=%d on GPIO%d\n", rxAvail, uart_get_rx_pin());
    }
    // #endregion
    while (uart_rx_available() && uartCount < MAX_UART_BYTES) {
        int c = uart_rx_read_byte();
        if (c < 0) break;
        uartCount++;
        // #region agent log - Hypothesis D: Log each received byte
        Serial.printf("[DBG-RX] Byte: 0x%02X '%c'\n", c, (c >= 32 && c < 127) ? c : '.');
        // #endregion
        txBuffer += (char)c;
        
        if (c == '}') {
            s_client.print(txBuffer);
#if DEBUG_UART_FRAMES
            Serial.print(txBuffer);
#endif
            txBuffer = "";
        }
    }
    
    // Heartbeat tick (non-blocking check)
    if (millis() - lastHeartbeat > CONFIG_HEARTBEAT_INTERVAL_MS) {
        s_client.print("{Heartbeat}");
        
        if (heartbeatReceived) {
            heartbeatReceived = false;
            heartbeatMissed = 0;
        } else {
            heartbeatMissed++;
        }
        
        if (heartbeatMissed > CONFIG_HEARTBEAT_TIMEOUT_COUNT) {
            LOG_W("TCP", "Heartbeat timeout");
            uart_tx_string("{\"N\":100}");  // Stop command
            s_client.stop();
            clientConnected = false;
            return;
        }
        
        // Check if device disconnected from WiFi
        if (WiFi.softAPgetStationNum() == 0) {
            LOG_W("TCP", "No WiFi clients");
            uart_tx_string("{\"N\":100}");  // Stop command
            s_client.stop();
            clientConnected = false;
            return;
        }
        
        lastHeartbeat = millis();
    }
    
    // Process UART bridge (non-blocking)
    uart_tick();
}

// ============================================================================
// Bridge Command Handler (Serial JSON commands from ZIP Robot Bridge)
// ============================================================================
static void handleBridgeCommand(const String& json) {
    // Simple JSON parser for bridge commands: {"N":0,"H":"tag"}
    // Extract N (command number) and H (tag) fields
    
    int cmdN = -1;
    String tag = "";
    
    // Find "N":<number> pattern
    int nPos = json.indexOf("\"N\":");
    if (nPos >= 0) {
        int nStart = nPos + 4;
        // Skip whitespace
        while (nStart < json.length() && (json[nStart] == ' ' || json[nStart] == ':')) {
            nStart++;
        }
        // Parse number
        int nEnd = nStart;
        while (nEnd < json.length() && json[nEnd] >= '0' && json[nEnd] <= '9') {
            nEnd++;
        }
        if (nEnd > nStart) {
            cmdN = json.substring(nStart, nEnd).toInt();
        }
    }
    
    // Find "H":"<tag>" pattern
    int hPos = json.indexOf("\"H\":");
    if (hPos >= 0) {
        int hStart = hPos + 4;
        // Skip whitespace and colon
        while (hStart < json.length() && (json[hStart] == ' ' || json[hStart] == ':')) {
            hStart++;
        }
        // Find opening quote
        if (hStart < json.length() && json[hStart] == '"') {
            hStart++;
            int hEnd = hStart;
            // Find closing quote
            while (hEnd < json.length() && json[hEnd] != '"') {
                hEnd++;
            }
            if (hEnd > hStart) {
                tag = json.substring(hStart, hEnd);
            }
        }
    }
    
    // Handle N=0 (Hello) command
    if (cmdN == 0) {
        // Respond with {tag_ok} format
        String response = "{" + tag + "_ok}";
        Serial.println(response);
        Serial.flush();
        LOG_V("BRIDGE", "Hello command: tag=%s, response=%s", tag.c_str(), response.c_str());
    } else if (cmdN >= 0) {
        // Other commands - respond with ok for now
        String response = "{" + tag + "_ok}";
        Serial.println(response);
        Serial.flush();
        LOG_V("BRIDGE", "Command N=%d, tag=%s, response=%s", cmdN, tag.c_str(), response.c_str());
    }
}

// ============================================================================
// Factory Test Handler (ELEGOO Protocol)
// ============================================================================
static void handleFactoryTest() {
    // Check for factory test commands from UNO
    if (uart_frame_available()) {
        char frame[64];
        size_t len = uart_read_frame(frame, sizeof(frame));
        
        if (len > 0) {
            if (strcmp(frame, "{BT_detection}") == 0) {
                uart_tx_string("{BT_OK}");
                LOG_V("TEST", "BT detection response sent");
            } else if (strcmp(frame, "{WA_detection}") == 0) {
                String response = "{" + net_get_mac_suffix() + "}";
                uart_tx_string(response.c_str());
                LOG_V("TEST", "WiFi detection response sent");
            }
        }
    }
    
    // LED indicator
    static unsigned long lastBlink = 0;
    static bool ledState = false;
    
    if (WiFi.softAPgetStationNum() > 0) {
        // Client connected - LED solid
        digitalWrite(LED_STATUS_GPIO, LOW);
        if (clientConnected) {
            uart_tx_string("{WA_OK}");
        }
    } else {
        // No client - blink LED
        if (millis() - lastBlink > CONFIG_LED_BLINK_INTERVAL_MS) {
            ledState = !ledState;
            digitalWrite(LED_STATUS_GPIO, ledState ? LOW : HIGH);
            lastBlink = millis();
        }
    }
}

// ============================================================================
// Setup
// ============================================================================
// Static flag to track if web/TCP servers have been started
static bool s_servers_started = false;

void setup() {
    unsigned long setup_start = millis();
    
    // CRITICAL: Initialize Serial with large RX buffer FIRST to receive bridge commands
    // This must be done before any Serial.printf() calls
    Serial.setRxBufferSize(1024);  // Large buffer for JSON commands
    Serial.begin(CONFIG_DEBUG_BAUD);
    Serial.flush();  // Ensure Serial is ready
    
    // Send early boot marker to "hook" the bridge (prevents timeout during long init)
    Serial.print("R\n");
    Serial.flush();
    
    Serial.printf("[DBG-SETUP] setup() started at %lu ms\n", setup_start);
    
    // CRITICAL: Initialize watchdog with long timeout BEFORE any blocking operations
    // Arduino-ESP32 auto-initializes with 5-second timeout, which is too short
    // We need 120 seconds for camera init + WiFi init (both can take several seconds)
    // Note: This must be done BEFORE registering tasks to avoid deinit/reset
    esp_err_t wdt_init_result = esp_task_wdt_init(120, true);
    Serial.printf("[DBG-SETUP] Initialized watchdog with %d second timeout (result=0x%x) at %lu ms\n", 
                  CONFIG_WDT_INIT_TIMEOUT_S, wdt_init_result, millis());
    
    // Register main task with watchdog to ensure it's monitored
    esp_err_t wdt_add_result = esp_task_wdt_add(NULL);
    Serial.printf("[DBG-SETUP] Registered main task with watchdog (result=0x%x) at %lu ms\n", 
                  wdt_add_result, millis());
    
    // Feed watchdog immediately
    esp_task_wdt_reset();
    Serial.printf("[DBG-SETUP] Initial watchdog feed at %lu ms\n", millis());
    
    // Initialize LED for visual feedback
    pinMode(LED_STATUS_GPIO, OUTPUT);
    digitalWrite(LED_STATUS_GPIO, LOW);  // LED ON = booting
    
    // Boot indicator: 3 blinks
    for (int i = 0; i < 3; i++) {
        digitalWrite(LED_STATUS_GPIO, LOW);
        delay(100);
        digitalWrite(LED_STATUS_GPIO, HIGH);
        delay(100);
    }
    digitalWrite(LED_STATUS_GPIO, LOW);  // Keep ON during init
    
    // Initialize safe mode tracking (must be first)
    safe_mode_init();
    
    // #region agent log - Hypothesis C: Check safe mode status
    Serial.printf("[DBG-BOOT] Safe mode: enabled=%d, fail_count=%d\n", 
                  safe_mode_is_enabled(), safe_mode_get_fail_count());
    // #endregion
    
    // Print boot banner
    print_boot_banner();
    
    // Initialize camera synchronously in setup() (like ELEGOO pattern)
    // This eliminates watchdog complexity - main task does everything sequentially
#if ENABLE_CAMERA
    // Feed watchdog before camera init
    esp_task_wdt_reset();
    Serial.printf("[DBG-SETUP] Fed watchdog before camera init at %lu ms\n", millis());
    
    LOG_I("INIT", "Initializing camera (synchronous)...");
    unsigned long camera_init_start = millis();
    
    // Initialize camera synchronously (blocking call in main task)
    // ELEGOO does this - no separate task needed
    cameraOk = camera_init();
    unsigned long camera_init_end = millis();
    
    Serial.printf("[DBG-SETUP] Camera init %s at %lu ms (took %lu ms)\n", 
                  cameraOk ? "succeeded" : "failed", camera_init_end, camera_init_end - camera_init_start);
    
    // Feed watchdog after camera init
    esp_task_wdt_reset();
    Serial.printf("[DBG-SETUP] Fed watchdog after camera init at %lu ms\n", millis());
    
    if (cameraOk) {
        LOG_I("INIT", "Camera: OK");
    } else {
        LOG_W("INIT", "Camera: FAILED (%s)", camera_last_error());
        LOG_W("INIT", "Continuing without camera...");
    }
    
    // Mark camera initialization as complete
    cameraInitDone = true;
#else
    LOG_I("INIT", "Camera disabled by build config");
    cameraOk = false;
    cameraInitDone = true;
#endif
    
    // Initialize UART bridge AFTER camera (ensures no pin conflicts)
#if ENABLE_UART
    // Feed watchdog before UART init
    esp_task_wdt_reset();
    Serial.printf("[DBG-SETUP] Fed watchdog before UART init at %lu ms\n", millis());
    
    // Blink: UART init
    digitalWrite(LED_STATUS_GPIO, HIGH);
    delay(50);
    digitalWrite(LED_STATUS_GPIO, LOW);
    
    // #region agent log - Hypothesis D: UART init after camera
    Serial.printf("[DBG-BOOT] Starting UART init at %lu ms (after camera)\n", millis());
    // #endregion
    
    LOG_I("INIT", "Initializing UART bridge...");
    uart_init();
    
    // Feed watchdog after UART init
    esp_task_wdt_reset();
    Serial.printf("[DBG-SETUP] Fed watchdog after UART init at %lu ms\n", millis());
#endif
    
    // Initialize WiFi synchronously (like ELEGOO pattern)
    // This happens in setup() after camera init completes, avoiding watchdog race conditions
    unsigned long wifi_init_start = millis();
    Serial.printf("[DBG-SETUP] About to initialize WiFi at %lu ms\n", wifi_init_start);
    
    // Feed watchdog before WiFi init
    esp_task_wdt_reset();
    Serial.printf("[DBG-SETUP] Fed watchdog before WiFi init at %lu ms\n", millis());
    
    // #region agent log - Hypothesis F: Stop camera in setup() before WiFi init
    Serial.printf("[DBG-SETUP] About to stop camera before WiFi init at %lu ms\n", millis());
    Serial.printf("[DBG-SETUP] camera_is_ok()=%d, cameraOk=%d\n", camera_is_ok(), cameraOk);
    // #endregion
    
    // CRITICAL: Stop camera IMMEDIATELY in setup() before WiFi init
    // Don't wait for net_tick() - camera must be stopped before any WiFi operations
#if ENABLE_CAMERA
    if (cameraOk && camera_is_ok()) {
        // #region agent log - Hypothesis F: Camera stop in setup()
        Serial.printf("[DBG-SETUP] Stopping camera in setup() at %lu ms\n", millis());
        unsigned long setup_camera_stop_start = millis();
        // #endregion
        
        LOG_I("INIT", "Stopping camera before WiFi initialization...");
        bool camera_stopped = camera_stop();
        
        // #region agent log - Hypothesis F: Camera stop result in setup()
        unsigned long setup_camera_stop_end = millis();
        Serial.printf("[DBG-SETUP] camera_stop() in setup() returned %d at %lu ms (duration=%lu ms)\n",
                      camera_stopped, setup_camera_stop_end, setup_camera_stop_end - setup_camera_stop_start);
        // #endregion
        
        if (camera_stopped) {
            Serial.printf("[DBG-SETUP] Camera stopped successfully in setup() at %lu ms\n", millis());
            // Mark camera as stopped so it can be resumed after WiFi init
            net_mark_camera_stopped();
        } else {
            LOG_W("INIT", "Failed to stop camera in setup(), continuing anyway");
        }
    } else {
        // #region agent log - Hypothesis F: Camera not running, skip stop
        Serial.printf("[DBG-SETUP] Camera not running (cameraOk=%d, camera_is_ok()=%d), skipping stop\n",
                      cameraOk, camera_is_ok());
        // #endregion
    }
#endif
    
    LOG_I("INIT", "Starting WiFi Access Point initialization (async)...");
    if (net_init_sync()) {
        // net_init_sync() now only sets flags - actual WiFi init happens in net_tick()
        // This prevents TG1WDT starvation by allowing setup() to complete
        Serial.printf("[DBG-SETUP] WiFi init started (will complete in loop) at %lu ms\n", millis());
        LOG_I("INIT", "WiFi initialization started - will complete in loop()");
    } else {
        LOG_E("INIT", "WiFi init start failed: %s", net_last_error());
        LOG_W("INIT", "Continuing without WiFi (safe mode)");
    }
    
    // Get WiFi name for status display
    wifiName = net_get_mac_suffix();
    
    // Send factory init to UNO (after boot guard)
    // This will be buffered and sent when UART is ready
#if ENABLE_UART
    uart_tx_string("{Factory}");
#endif
    
    // LED OFF = ready
    digitalWrite(LED_STATUS_GPIO, HIGH);
    
    // Run self-test if enabled
#if ENABLE_SELF_TEST
    run_self_test();
#endif
    
    // #region agent log - Log GPIO config at boot
    Serial.println("==========================================");
    Serial.println("[DBG] UART GPIO Configuration:");
    Serial.printf("[DBG]   RX = GPIO%d\n", uart_get_rx_pin());
    Serial.printf("[DBG]   TX = GPIO%d\n", uart_get_tx_pin());
    Serial.println("[DBG] If RX is wrong, try GPIO33 (ELEGOO original)");
    Serial.println("==========================================");
    // #endregion
    
    // Feed watchdog before finishing setup
    esp_task_wdt_reset();
    unsigned long setup_end = millis();
    Serial.printf("[DBG-SETUP] setup() completed at %lu ms (total duration: %lu ms)\n", 
                  setup_end, setup_end - setup_start);
    Serial.printf("[DBG-SETUP] Fed watchdog at end of setup()\n");
    
    // Print ready message
    Serial.println("==========================================");
    Serial.println("Initialization complete!");
    if (net_is_ok()) {
        Serial.printf("  WiFi: %s\n", net_get_ssid().c_str());
        Serial.printf("  IP: %s\n", net_get_ip().toString().c_str());
        if (cameraOk) {
            Serial.printf("  Stream: http://%s:%d/stream\n", 
                          net_get_ip().toString().c_str(), CONFIG_STREAM_PORT);
        }
        Serial.printf("  Health: http://%s/health\n", net_get_ip().toString().c_str());
    }
    Serial.printf("  Camera: %s\n", cameraOk ? "OK" : (cameraTaskHandle && !cameraInitDone ? "Initializing..." : camera_last_error()));
    Serial.printf("  WiFi: %s\n", net_is_ok() ? "OK" : net_last_error());
    Serial.printf("  UART: %s\n", uart_is_ok() ? "OK" : "Waiting for boot guard");
    Serial.println("==========================================");
}

// ============================================================================
// Main Loop
// ============================================================================
void loop() {
    // Feed watchdog every loop iteration to prevent TG1WDT starvation
    esp_task_wdt_reset();
    
    // Advance WiFi initialization state machine (handles blocking WiFi.mode() calls)
    // This must be called every loop iteration until WiFi is ready
    if (!net_is_ok() && net_status() != NetStatus::ERROR && net_status() != NetStatus::TIMEOUT) {
        // #region agent log - Hypothesis A: net_tick() call in loop
        static unsigned long last_net_tick_log = 0;
        if (millis() - last_net_tick_log > 100) {  // Log every 100ms to avoid spam
            Serial.printf("[DBG-LOOP] Calling net_tick() at %lu ms\n", millis());
            last_net_tick_log = millis();
        }
        // #endregion
        net_tick();
        
        // When WiFi becomes ready, start servers
        if (net_is_ok() && !s_servers_started) {
            LOG_I("INIT", "WiFi ready - starting web and TCP servers...");
            
            // Start web servers (TCP/IP stack is now ready)
            if (ENABLE_HEALTH_ENDPOINT) {
                if (web_server_init()) {
                    LOG_I("INIT", "Web servers started");
                } else {
                    LOG_E("INIT", "Web server init failed: %s", web_server_last_error());
                }
            }
            
            // Start TCP server for robot commands
            tcpServer.begin();
            LOG_I("INIT", "TCP server started on port %d", CONFIG_TCP_PORT);
            
            s_servers_started = true;
            LOG_I("INIT", "All servers started");
        }
    }
    
    // Handle Serial commands from bridge (non-blocking, bounded)
    static String serialBuffer = "";
    const int MAX_SERIAL_BYTES = 64;  // Bounded work per loop iteration
    int serialCount = 0;
    
    while (Serial.available() && serialCount < MAX_SERIAL_BYTES) {
        char c = Serial.read();
        serialCount++;
        
        if (c == '{') {
            serialBuffer = "{";
        } else if (serialBuffer.length() > 0) {
            serialBuffer += c;
            
            if (c == '}') {
                // Complete JSON command received
                handleBridgeCommand(serialBuffer);
                serialBuffer = "";
            }
        }
    }
    
    // Process UART bridge (lightweight)
    uart_tick();
    
    // Handle TCP clients (robot commands) - non-blocking
    // Only process if servers are started and WiFi is ready
    if (s_servers_started && net_is_ok()) {
        handleTcpClientNonBlocking();
    }
    
    // Handle factory test commands
    handleFactoryTest();
    
    // Yield to FreeRTOS scheduler - use vTaskDelay for proper yielding
    vTaskDelay(pdMS_TO_TICKS(1));
}

