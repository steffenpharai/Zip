/**
 * Network Service - Implementation
 * 
 * WiFi Access Point with ELEGOO MAC-based SSID.
 * Non-blocking initialization with status tracking.
 */

#include "net_service.h"
#include <Arduino.h>
#include <WiFi.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_task_wdt.h"
#include "config/build_config.h"
#include "config/runtime_config.h"
#include "drivers/camera/camera_service.h"

// ============================================================================
// WiFi Initialization State Machine
// ============================================================================
enum class WiFiInitState {
    IDLE,           // Not started
    GENERATE_SSID,  // Generate SSID from MAC
    SET_MODE,       // Set WiFi mode to AP
    SET_TX_POWER,   // Set TX power
    START_AP,       // Start softAP
    WAIT_STABLE,    // Wait for AP to stabilize
    DONE,           // Initialization complete
    ERROR           // Initialization failed
};

// ============================================================================
// Module State
// ============================================================================
static NetStatus s_status = NetStatus::DISCONNECTED;
static WiFiInitState s_init_state = WiFiInitState::IDLE;
static String s_ssid = "";
static String s_mac_suffix = "";
static unsigned long s_start_time = 0;
static unsigned long s_init_start_time = 0;
static unsigned long s_stable_wait_start = 0;
static int s_stable_wait_count = 0;
static const char* s_error_message = "Not initialized";
static const unsigned long BOOT_WIFI_TIMEOUT_MS = 20000;  // 20 second software timeout for boot
static const unsigned long WIFI_SETTLE_DELAY_MS = 2000;  // 2 second settling delay before WiFi init
static bool s_camera_was_running = false;  // Track if camera was running before WiFi init

// ============================================================================
// SSID Generation (ELEGOO Convention)
// ============================================================================
static void generate_ssid() {
    // Generate SSID from MAC address - matches ELEGOO method
    uint64_t chipid = ESP.getEfuseMac();
    
    char mac0[5];
    char mac1[9];
    sprintf(mac0, "%04X", (uint16_t)(chipid >> 32));
    sprintf(mac1, "%08X", (uint32_t)chipid);
    
    s_mac_suffix = String(mac0) + String(mac1);
    s_ssid = String(CONFIG_WIFI_SSID_PREFIX) + s_mac_suffix;
}

// ============================================================================
// Network Initialization (Synchronous - ELEGOO Pattern)
// ============================================================================
// NOTE: This function now only sets flags - actual WiFi init happens in net_tick()
// This prevents TG1WDT starvation by allowing setup() to complete before blocking calls
bool net_init_sync() {
    // Generate SSID from MAC address
    generate_ssid();
    LOG_I("NET", "SSID: %s", s_ssid.c_str());
    
    // DON'T call WiFi.setTxPower() here - it must be called AFTER WiFi.softAP()
    // Calling it before WiFi is initialized causes warnings and instability
    
    // DON'T call WiFi.mode(WIFI_AP) here - it's blocking and causes TG1WDT starvation
    // Instead, start the async state machine which will handle it in net_tick()
    // Camera will be stopped right before WiFi.mode() in the state machine
    LOG_I("NET", "Starting WiFi initialization (will complete in loop)...");
    s_status = NetStatus::INITIALIZING;
    s_init_state = WiFiInitState::SET_MODE;  // Skip GENERATE_SSID since we already did it
    s_init_start_time = millis();
    s_error_message = "Initializing";
    
    // Return true to indicate initialization started
    // Actual completion will happen via net_tick() in loop()
    return true;
}

// ============================================================================
// Network Initialization (Non-Blocking State Machine)
// ============================================================================
bool net_start() {
    if (s_init_state != WiFiInitState::IDLE) {
        // Already started or in progress
        return false;
    }
    
    LOG_I("NET", "Starting WiFi Access Point initialization...");
    s_status = NetStatus::INITIALIZING;
    s_init_state = WiFiInitState::GENERATE_SSID;
    s_init_start_time = millis();
    s_error_message = "Initializing";
    
    return true;
}

bool net_tick() {
    // #region agent log - Hypothesis A: net_tick() is being called (throttled to avoid log flood)
    static unsigned long last_net_tick_log = 0;
    if (millis() - last_net_tick_log > 500) {  // Log every 500ms to avoid spam
        Serial.printf("[DBG-NET-TICK] net_tick() called at %lu ms, state=%d\n", millis(), (int)s_init_state);
        last_net_tick_log = millis();
    }
    // #endregion
    
    // Check for software timeout (robust boot timeout)
    if (s_init_state != WiFiInitState::IDLE && 
        s_init_state != WiFiInitState::DONE && 
        s_init_state != WiFiInitState::ERROR) {
        unsigned long elapsed = millis() - s_init_start_time;
        if (elapsed > BOOT_WIFI_TIMEOUT_MS) {
            s_init_state = WiFiInitState::ERROR;
            s_status = NetStatus::TIMEOUT;
            s_error_message = "Boot WiFi initialization timeout";
            LOG_E("NET", "WiFi initialization timeout after %lu ms (limit: %lu ms)", 
                  elapsed, BOOT_WIFI_TIMEOUT_MS);
            LOG_W("NET", "Continuing boot WITHOUT WiFi (safe mode)");
            Serial.println("[BOOT] WiFi init FAILED - continuing without WiFi");
            return false;
        }
    }
    
    // Advance state machine
    switch (s_init_state) {
        case WiFiInitState::IDLE:
            // Not started yet
            return false;
            
        case WiFiInitState::GENERATE_SSID: {
            // Generate SSID from MAC address
            generate_ssid();
            LOG_I("NET", "SSID: %s", s_ssid.c_str());
            s_init_state = WiFiInitState::SET_MODE;
            return true;  // Continue to next state
        }
        
        case WiFiInitState::SET_MODE: {
            // #region agent log - Hypothesis B: SET_MODE state is reached (log only once)
            static bool set_mode_logged = false;
            if (!set_mode_logged) {
                Serial.printf("[DBG-NET-TICK] SET_MODE state entered at %lu ms\n", millis());
                set_mode_logged = true;
            }
            // #endregion
            
            // Check software timeout before blocking call
            unsigned long elapsed = millis() - s_init_start_time;
            if (elapsed > BOOT_WIFI_TIMEOUT_MS) {
                s_init_state = WiFiInitState::ERROR;
                s_status = NetStatus::TIMEOUT;
                s_error_message = "Timeout before SET_MODE";
                LOG_E("NET", "WiFi init timeout before SET_MODE");
                LOG_W("NET", "Continuing boot WITHOUT WiFi (safe mode)");
                return false;
            }
            
            // CRITICAL: Stop camera FIRST, before settle delay
            // Camera HAL generates VSYNC/EOF interrupts that compete with WiFi during init
            // This prevents EV-VSYNC-OVF and EV-EOF-OVF errors that trigger TG1WDT
            // We stop it immediately when entering this state, not after settle delay
            static bool camera_stopped_flag = false;
#if ENABLE_CAMERA
            if (!camera_stopped_flag && camera_is_ok()) {
                // #region agent log - Hypothesis C: Camera stop is executing
                Serial.printf("[DBG-NET-TICK] About to stop camera at %lu ms\n", millis());
                // #endregion
                
                LOG_I("NET", "Stopping camera hardware (deinit) to prevent resource conflict");
                Serial.printf("[NET] Stopping camera hardware (deinit) for WiFi init...\n");
                s_camera_was_running = true;  // Remember that camera was running
                
                // #region agent log - Hypothesis D: Camera stop call timing
                unsigned long camera_stop_start = millis();
                // #endregion
                
                bool camera_stopped = camera_stop();  // Calls esp_camera_deinit() - stops all interrupts
                
                // #region agent log - Hypothesis D: Camera stop result
                unsigned long camera_stop_end = millis();
                Serial.printf("[DBG-NET-TICK] camera_stop() returned %d at %lu ms (duration=%lu ms)\n", 
                              camera_stopped, camera_stop_end, camera_stop_end - camera_stop_start);
                // #endregion
                
                if (!camera_stopped) {
                    LOG_W("NET", "Failed to stop camera, continuing with WiFi init");
                    s_camera_was_running = false;  // Reset flag if stop failed
                } else {
                    Serial.printf("[NET] Camera hardware stopped successfully (interrupts disabled)\n");
                }
                camera_stopped_flag = true;  // Only stop once
            }
#endif
            
            // CRITICAL: Wait for system to settle before hitting WiFi radio
            // TG1WDT (Timer Group 1 Watchdog) is very sensitive to power spikes
            // during WiFi initialization. A 2-second delay allows FreeRTOS tasks
            // to stabilize and prevents the hardware watchdog from triggering.
            // Camera is already stopped, so no interrupts during this period
            // #region agent log - Hypothesis E: Settle delay check (throttled to avoid log flood)
            static unsigned long s_boot_time_ms = 0;
            static unsigned long last_settle_log = 0;
            if (s_boot_time_ms == 0) {
                s_boot_time_ms = millis();
                Serial.printf("[DBG-NET-TICK] Boot time recorded: %lu ms, waiting %lu ms for settle delay\n", 
                              s_boot_time_ms, WIFI_SETTLE_DELAY_MS);
            }
            unsigned long current_time = millis();
            unsigned long time_since_boot = current_time - s_boot_time_ms;
            
            // Log settle delay progress only every 500ms to avoid flooding
            if (millis() - last_settle_log > 500) {
                unsigned long remaining = WIFI_SETTLE_DELAY_MS - time_since_boot;
                if (remaining > 0) {
                    Serial.printf("[DBG-NET-TICK] Waiting for settle delay: %lu ms remaining\n", remaining);
                }
                last_settle_log = millis();
            }
            // #endregion
            
            if (time_since_boot < WIFI_SETTLE_DELAY_MS) {
                // Still waiting for settle delay - return and try again next tick
                // Camera is already stopped, so no resource conflict during wait
                return true;
            }
            
            // System has settled and camera is stopped - proceed with WiFi initialization
            unsigned long current_time_final = millis();
            Serial.printf("[NET] System settled at %lu ms. Initializing WiFi...\n", current_time_final);
            LOG_I("NET", "System settled, starting WiFi mode transition");
            
            // FINAL VERIFICATION: Ensure camera is stopped before blocking WiFi call
            // This is a safety check - camera should already be stopped in setup() or above
#if ENABLE_CAMERA
            if (camera_is_ok()) {
                // #region agent log - Hypothesis G: Camera still running before WiFi.mode()
                Serial.printf("[DBG-NET-TICK] WARNING: Camera still running before WiFi.mode()! Stopping now...\n");
                // #endregion
                LOG_W("NET", "Camera still running before WiFi.mode() - stopping now");
                camera_stop();
                s_camera_was_running = true;
            } else {
                // #region agent log - Hypothesis G: Camera confirmed stopped before WiFi.mode()
                Serial.printf("[DBG-NET-TICK] Camera confirmed stopped before WiFi.mode() at %lu ms\n", millis());
                // #endregion
            }
#endif
            
            // CRITICAL: Feed watchdog BEFORE blocking WiFi call
            // DO NOT delete task from watchdog - this causes TG1WDT reset when IDLE task can't run
            // The 60-second watchdog timeout (set at boot) is sufficient for WiFi.mode() (~2-5s)
            // #region agent log - Feed watchdog before WiFi.mode()
            Serial.printf("[DBG-NET-TICK] Feeding watchdog before WiFi.mode() at %lu ms\n", millis());
            Serial.flush();  // Ensure message is printed before blocking call
            // #endregion
            esp_task_wdt_reset();  // Feed watchdog (60s timeout >> 2-5s WiFi.mode call)
            Serial.printf("[DBG-NET-TICK] Watchdog fed at %lu ms\n", millis());
            Serial.flush();
            
            // Set WiFi mode to AP with diagnostic logging
            unsigned long before_mode = millis();
            size_t heap_before = ESP.getFreeHeap();
            size_t psram_before = ESP.getFreePsram();
            
            LOG_I("NET", "Setting WiFi mode to AP (this may take a few seconds)...");
            Serial.printf("[DBG-WIFI] Starting WiFi.mode(WIFI_AP) at %lu ms\n", before_mode);
            Serial.printf("[NET-DIAG] Before WiFi.mode(): heap=%lu, psram=%lu, time=%lu ms\n",
                          heap_before, psram_before, before_mode);
            
            // #region agent log - Hypothesis G: About to call WiFi.mode() with camera stopped
            Serial.printf("[DBG-NET-TICK] About to call WiFi.mode(WIFI_AP) - camera_is_ok()=%d\n", camera_is_ok());
            Serial.printf("[DBG-NET-TICK] Watchdog deleted, about to enter blocking WiFi.mode() call\n");
            // #endregion
            
            // CRITICAL: Yield to IDLE task before blocking call to prevent TG1WDT starvation
            // The TG1WDT monitors the IDLE task - if it can't run, the watchdog triggers
            // Yielding here ensures the IDLE task has a chance to run and feed the watchdog
            // #region agent log - Hypothesis I: Yield to IDLE task before blocking call
            Serial.printf("[DBG-NET-TICK] Yielding to IDLE task before WiFi.mode() at %lu ms\n", millis());
            // #endregion
            vTaskDelay(pdMS_TO_TICKS(10));  // Yield 10ms to allow IDLE task to run
            Serial.printf("[DBG-NET-TICK] Yield complete, about to call WiFi.mode() at %lu ms\n", millis());
            
            // #region agent log - Hypothesis H: Entering blocking WiFi.mode() call
            unsigned long wifi_mode_start = millis();
            Serial.printf("[DBG-WIFI] Entering WiFi.mode(WIFI_AP) blocking call at %lu ms\n", wifi_mode_start);
            // #endregion
            
            WiFi.mode(WIFI_AP);  // Blocking call (2-5 seconds typical)
            
            // #region agent log - Hypothesis H: WiFi.mode() call completed
            unsigned long wifi_mode_end = millis();
            Serial.printf("[DBG-WIFI] WiFi.mode(WIFI_AP) call completed at %lu ms (duration=%lu ms)\n", 
                          wifi_mode_end, wifi_mode_end - wifi_mode_start);
            // #endregion
            
            // Re-register with Task Watchdog after blocking call completes
            esp_task_wdt_add(NULL);
            esp_task_wdt_reset();
            
            unsigned long after_mode = millis();
            size_t heap_after = ESP.getFreeHeap();
            size_t psram_after = ESP.getFreePsram();
            unsigned long mode_duration = after_mode - before_mode;
            
            Serial.printf("[DBG-WIFI] WiFi.mode(WIFI_AP) returned at %lu ms (duration=%lu ms)\n", 
                          after_mode, mode_duration);
            Serial.printf("[NET-DIAG] After WiFi.mode(): heap=%lu, psram=%lu, duration=%lu ms\n",
                          heap_after, psram_after, mode_duration);
            LOG_I("NET", "WiFi mode set to AP (took %lu ms)", mode_duration);
            
            s_init_state = WiFiInitState::START_AP;  // Skip SET_TX_POWER - do it after softAP
            return true;  // Continue to next state
        }
        
        case WiFiInitState::START_AP: {
            // Check software timeout before blocking call
            unsigned long elapsed = millis() - s_init_start_time;
            if (elapsed > BOOT_WIFI_TIMEOUT_MS) {
                s_init_state = WiFiInitState::ERROR;
                s_status = NetStatus::TIMEOUT;
                s_error_message = "Timeout before START_AP";
                LOG_E("NET", "WiFi init timeout before START_AP");
                LOG_W("NET", "Continuing boot WITHOUT WiFi (safe mode)");
                return false;
            }
            
            // Feed watchdog BEFORE blocking WiFi.softAP() call
            // DO NOT delete task from watchdog - keep it registered
            esp_task_wdt_reset();
            Serial.flush();  // Ensure logs are printed before blocking call

            // Start Access Point with diagnostic logging
            unsigned long before_softap = millis();
            size_t heap_before = ESP.getFreeHeap();
            size_t psram_before = ESP.getFreePsram();

            LOG_I("NET", "Starting softAP '%s' on channel %d (this may take a few seconds)...",
                  s_ssid.c_str(), CONFIG_WIFI_CHANNEL);
            Serial.printf("[DBG-WIFI] Starting WiFi.softAP() at %lu ms\n", before_softap);
            Serial.printf("[NET-DIAG] Before WiFi.softAP(): heap=%lu, psram=%lu, time=%lu ms\n",
                          heap_before, psram_before, before_softap);

            // CRITICAL: Yield to IDLE task before blocking call to prevent TG1WDT starvation
            // The TG1WDT monitors the IDLE task - if it can't run, the watchdog triggers
            // Yielding here ensures the IDLE task has a chance to run and feed the watchdog
            Serial.printf("[DBG-NET-TICK] Yielding to IDLE task before WiFi.softAP() at %lu ms\n", millis());
            vTaskDelay(pdMS_TO_TICKS(10));  // Yield 10ms to allow IDLE task to run
            Serial.printf("[DBG-NET-TICK] Yield complete, about to call WiFi.softAP() at %lu ms\n", millis());

            bool result = WiFi.softAP(s_ssid.c_str(), "", CONFIG_WIFI_CHANNEL);  // Blocking call (2-5s typical)

            // Feed watchdog after blocking call completes
            esp_task_wdt_reset();
            esp_task_wdt_reset();
            
            unsigned long after_softap = millis();
            size_t heap_after = ESP.getFreeHeap();
            size_t psram_after = ESP.getFreePsram();
            unsigned long softap_duration = after_softap - before_softap;
            
            Serial.printf("[DBG-WIFI] WiFi.softAP() returned at %lu ms\n", after_softap);
            
            Serial.printf("[NET-DIAG] After WiFi.softAP(): heap=%lu, psram=%lu, duration=%lu ms, result=%s\n",
                          heap_after, psram_after, softap_duration, result ? "OK" : "FAILED");
            
            if (!result) {
                s_init_state = WiFiInitState::ERROR;
                s_status = NetStatus::ERROR;
                s_error_message = "softAP failed";
                LOG_E("NET", "Failed to start Access Point");
                LOG_W("NET", "Continuing boot WITHOUT WiFi (safe mode)");
                Serial.println("[BOOT] WiFi softAP FAILED - continuing without WiFi");
                return false;
            }
            
            LOG_I("NET", "softAP started successfully (took %lu ms)", softap_duration);
            
            // NOW set TX power - must be called AFTER WiFi.softAP() is initialized
            // Calling it before causes "Neither AP or STA has been started" warning
            // and can contribute to instability during radio power-on phase
            LOG_V("NET", "Setting TX power (enum: 0x%x)", (int)CONFIG_WIFI_TX_POWER);
            WiFi.setTxPower((wifi_power_t)CONFIG_WIFI_TX_POWER);
            
            s_init_state = WiFiInitState::WAIT_STABLE;
            s_stable_wait_start = millis();
            s_stable_wait_count = 0;
            return true;  // Continue to next state
        }
        
        case WiFiInitState::WAIT_STABLE: {
            // Wait for AP to stabilize (non-blocking, check every tick)
            unsigned long wait_elapsed = millis() - s_stable_wait_start;
            
            if (wait_elapsed >= 1000) {  // Wait 1 second total
                s_init_state = WiFiInitState::DONE;
                s_status = NetStatus::AP_ACTIVE;
                s_start_time = millis();
                s_error_message = "OK";
                
                LOG_I("NET", "AP IP: %s", WiFi.softAPIP().toString().c_str());
                LOG_I("NET", "WiFi Access Point ready");
                
                // Resume camera after WiFi init completes successfully
                // Use s_camera_was_running flag since camera_is_ok() will be false after stop
#if ENABLE_CAMERA
                if (s_camera_was_running) {
                    LOG_I("NET", "Resuming camera hardware (reinit) after WiFi init");
                    Serial.printf("[NET] Resuming camera hardware (reinit) after WiFi init\n");
                    bool resume_result = camera_resume();  // Calls esp_camera_init() with stored config
                    if (resume_result) {
                        LOG_I("NET", "Camera resumed successfully");
                        Serial.printf("[NET] Camera hardware resumed successfully\n");
                    } else {
                        LOG_W("NET", "Camera resume failed, continuing without camera");
                        Serial.printf("[NET] Camera resume failed, continuing without camera\n");
                    }
                    s_camera_was_running = false;  // Reset flag
                }
#endif
                
                // Print connection instructions
                Serial.println(":----------------------------:");
                Serial.printf("wifi_name:%s\n", s_ssid.c_str());
                Serial.println(":----------------------------:");
                Serial.printf("Camera Ready! Use 'http://%s' to connect\n", 
                              WiFi.softAPIP().toString().c_str());
                
                // Send READY marker to bridge (signals WiFi is ready and ESP32 can handle commands)
                Serial.println("READY");
                Serial.flush();
                
                return false;  // Done
            }
            
            return true;  // Still waiting
        }
        
        case WiFiInitState::DONE:
            // Initialization complete
            return false;
    }
    
    return false;
}

// ============================================================================
// Status Functions
// ============================================================================
NetStatus net_status() {
    return s_status;
}

bool net_is_ok() {
    return s_status == NetStatus::AP_ACTIVE;
}

IPAddress net_get_ip() {
    if (s_status != NetStatus::AP_ACTIVE) {
        return IPAddress(0, 0, 0, 0);
    }
    return WiFi.softAPIP();
}

String net_get_ssid() {
    return s_ssid;
}

String net_get_mac_suffix() {
    return s_mac_suffix;
}

int8_t net_get_rssi() {
    // In AP mode, we don't have RSSI, return TX power instead
    return (int8_t)WiFi.getTxPower();
}

uint8_t net_get_station_count() {
    if (s_status != NetStatus::AP_ACTIVE) {
        return 0;
    }
    return WiFi.softAPgetStationNum();
}

NetStats net_get_stats() {
    NetStats stats;
    stats.connected_stations = net_get_station_count();
    stats.tx_power = net_get_rssi();
    stats.uptime_ms = (s_status == NetStatus::AP_ACTIVE) ? (millis() - s_start_time) : 0;
    stats.last_client_ts = 0;  // Not tracked yet
    return stats;
}

const char* net_last_error() {
    return s_error_message;
}

void net_mark_camera_stopped() {
    s_camera_was_running = true;
}

