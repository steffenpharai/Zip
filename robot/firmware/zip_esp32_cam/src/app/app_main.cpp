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
#include "esp_task_wdt.h"

// Board and configuration
#include "board/board_esp32s3_elegoo_cam.h"
#include "config/build_config.h"
#include "config/runtime_config.h"

// Service modules
#include "drivers/camera/camera_service.h"
#include "drivers/uart/uart_bridge.h"
#include "net/net_service.h"
#include "web/web_server.h"

// ============================================================================
// Global State
// ============================================================================
static WiFiServer tcpServer(CONFIG_TCP_PORT);
static String wifiName;
static bool clientConnected = false;
static bool cameraOk = false;

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
// TCP Client Handler (ELEGOO Protocol)
// ============================================================================
static void handleTcpClient() {
    static bool wasConnected = false;
    static String rxBuffer;
    static String txBuffer;
    static unsigned long lastHeartbeat = 0;
    static uint8_t heartbeatMissed = 0;
    static bool heartbeatReceived = false;
    
    WiFiClient client = tcpServer.available();
    
    if (client) {
        clientConnected = true;
        wasConnected = true;
        LOG_I("TCP", "Client connected");
        
        while (client.connected()) {
            // Read from TCP client
            while (client.available()) {
                char c = client.read();
                
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
                            // Forward to UNO via UART bridge
                            uart_tx_string(rxBuffer.c_str());
                        }
                        rxBuffer = "";
                    }
                }
            }
            
            // Read from UNO via UART bridge
            while (uart_rx_available()) {
                int c = uart_rx_read_byte();
                if (c >= 0) {
                    txBuffer += (char)c;
                    
                    if (c == '}') {
                        client.print(txBuffer);
#if DEBUG_UART_FRAMES
                        Serial.print(txBuffer);
#endif
                        txBuffer = "";
                    }
                }
            }
            
            // Heartbeat handling
            if (millis() - lastHeartbeat > CONFIG_HEARTBEAT_INTERVAL_MS) {
                client.print("{Heartbeat}");
                
                if (heartbeatReceived) {
                    heartbeatReceived = false;
                    heartbeatMissed = 0;
                } else {
                    heartbeatMissed++;
                }
                
                if (heartbeatMissed > CONFIG_HEARTBEAT_TIMEOUT_COUNT) {
                    LOG_W("TCP", "Heartbeat timeout");
                    break;
                }
                
                // Check if device disconnected from WiFi
                if (WiFi.softAPgetStationNum() == 0) {
                    LOG_W("TCP", "No WiFi clients");
                    uart_tx_string("{\"N\":100}");  // Stop command
                    break;
                }
                
                lastHeartbeat = millis();
            }
            
            // Process UART bridge
            uart_tick();
            
            delay(CONFIG_LOOP_DELAY_MS);
        }
        
        // Client disconnected
        uart_tx_string("{\"N\":100}");  // Stop command
        client.stop();
        clientConnected = false;
        LOG_I("TCP", "Client disconnected");
    } else {
        if (wasConnected) {
            wasConnected = false;
            uart_tx_string("{\"N\":100}");  // Stop command
        }
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
void setup() {
    // Configure watchdog with longer timeout for initialization
    esp_task_wdt_init(CONFIG_WDT_INIT_TIMEOUT_S, true);
    esp_task_wdt_add(NULL);
    
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
    
    // Initialize debug serial
    Serial.begin(CONFIG_DEBUG_BAUD);
    delay(100);
    
    // Print boot banner
    print_boot_banner();
    
    // Blink: Camera init
    digitalWrite(LED_STATUS_GPIO, HIGH);
    delay(50);
    digitalWrite(LED_STATUS_GPIO, LOW);
    
    // Initialize UART bridge (with boot guard)
#if ENABLE_UART
    LOG_I("INIT", "Initializing UART bridge...");
    uart_init();
#endif
    
    // Initialize camera
#if ENABLE_CAMERA
    LOG_I("INIT", "Initializing camera...");
    cameraOk = camera_init();
    if (cameraOk) {
        LOG_I("INIT", "Camera: OK");
    } else {
        LOG_W("INIT", "Camera: FAILED (%s)", camera_last_error());
        LOG_I("INIT", "Continuing without camera...");
    }
#else
    LOG_I("INIT", "Camera disabled by build config");
#endif
    
    // Blink: WiFi init
    digitalWrite(LED_STATUS_GPIO, HIGH);
    delay(50);
    digitalWrite(LED_STATUS_GPIO, LOW);
    
    // Initialize network
    LOG_I("INIT", "Initializing WiFi...");
    if (!net_init()) {
        LOG_E("INIT", "WiFi initialization failed!");
    }
    wifiName = net_get_mac_suffix();
    
    // Blink: Server init
    digitalWrite(LED_STATUS_GPIO, HIGH);
    delay(50);
    digitalWrite(LED_STATUS_GPIO, LOW);
    
    // Start web servers
    if (cameraOk || ENABLE_HEALTH_ENDPOINT) {
        web_server_init();
    } else {
        LOG_I("INIT", "Web servers skipped (camera not available)");
    }
    
    // Start TCP server for robot commands
    tcpServer.begin();
    LOG_I("INIT", "TCP server started on port %d", CONFIG_TCP_PORT);
    
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
    
    // Print ready message
    Serial.println("==========================================");
    Serial.println("Initialization complete!");
    Serial.printf("  WiFi: %s\n", net_get_ssid().c_str());
    Serial.printf("  IP: %s\n", net_get_ip().toString().c_str());
    if (cameraOk) {
        Serial.printf("  Stream: http://%s:%d/stream\n", 
                      net_get_ip().toString().c_str(), CONFIG_STREAM_PORT);
    }
    Serial.printf("  Health: http://%s/health\n", net_get_ip().toString().c_str());
    Serial.printf("  Camera: %s\n", cameraOk ? "OK" : camera_last_error());
    Serial.printf("  UART: %s\n", uart_is_ok() ? "OK" : "Waiting for boot guard");
    Serial.println("==========================================");
    
    // Reconfigure watchdog for runtime
    esp_task_wdt_init(CONFIG_WDT_RUNTIME_TIMEOUT_S, true);
    esp_task_wdt_add(NULL);
    LOG_V("INIT", "Watchdog reconfigured for runtime (%ds)", CONFIG_WDT_RUNTIME_TIMEOUT_S);
}

// ============================================================================
// Main Loop
// ============================================================================
void loop() {
    // Feed watchdog
    esp_task_wdt_reset();
    
    // Process UART bridge
    uart_tick();
    
    // Handle TCP clients (robot commands)
    handleTcpClient();
    
    // Handle factory test commands
    handleFactoryTest();
    
    // Yield to other tasks
    delay(CONFIG_LOOP_DELAY_MS);
}

