/**
 * Camera Service - Implementation
 * 
 * Handles camera initialization with proper error tracking,
 * defensive logging, and graceful degradation.
 */

#include "camera_service.h"
#include <Arduino.h>
#include <string.h>
#include "esp_camera.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_task_wdt.h"
#include "board/board_esp32s3_elegoo_cam.h"
#include "config/build_config.h"
#include "config/runtime_config.h"
#include "config/safe_mode.h"

// ============================================================================
// Module State
// ============================================================================
static CameraStatus s_status = CameraStatus::NOT_INITIALIZED;
static esp_err_t s_last_error = ESP_OK;
static const char* s_error_message = "Not initialized";
static CameraStats s_stats = {0, 0, 0, 0, 0};

// Stored camera configuration for resume after stop
static camera_config_t s_stored_config;
static bool s_config_stored = false;
static framesize_t s_stored_framesize = FRAMESIZE_VGA;
static int s_stored_vflip = 0;
static int s_stored_hmirror = 0;

// ============================================================================
// Error Code to String Mapping
// ============================================================================
static const char* esp_err_to_name_safe(esp_err_t err) {
    // Camera-specific error codes (check these first as they may overlap)
    // Camera errors are in range 0x20000 - 0x20FFF
    if (err >= 0x20000 && err <= 0x20FFF) {
        switch (err) {
            case 0x20001: return "ESP_ERR_CAMERA_NOT_DETECTED";
            case 0x20002: return "ESP_ERR_CAMERA_FAILED_TO_SET_FRAME_SIZE";
            case 0x20003: return "ESP_ERR_CAMERA_FAILED_TO_SET_OUT_FORMAT";
            case 0x20004: return "ESP_ERR_CAMERA_NOT_SUPPORTED";
            default:      return "ESP_ERR_CAMERA_UNKNOWN";
        }
    }
    
    // Standard ESP-IDF error codes
    switch (err) {
        case ESP_OK:                    return "ESP_OK";
        case ESP_FAIL:                  return "ESP_FAIL";
        case ESP_ERR_NO_MEM:            return "ESP_ERR_NO_MEM";
        case ESP_ERR_INVALID_ARG:       return "ESP_ERR_INVALID_ARG";
        case ESP_ERR_INVALID_STATE:     return "ESP_ERR_INVALID_STATE";
        case ESP_ERR_NOT_FOUND:         return "ESP_ERR_NOT_FOUND";
        case ESP_ERR_NOT_SUPPORTED:     return "ESP_ERR_NOT_SUPPORTED";
        case ESP_ERR_TIMEOUT:           return "ESP_ERR_TIMEOUT";
        default:                        return "UNKNOWN_ERROR";
    }
}

// ============================================================================
// Camera Initialization
// ============================================================================
bool camera_init() {
#if !ENABLE_CAMERA
    LOG_I("CAM", "Camera disabled by build config");
    s_status = CameraStatus::NOT_INITIALIZED;
    s_error_message = "Camera disabled";
    return false;
#else
    LOG_I("CAM", "Initializing camera...");
    LOG_I("CAM", "XCLK=%d SIOD=%d SIOC=%d PCLK=%d", 
          CAM_XCLK_GPIO, CAM_SIOD_GPIO, CAM_SIOC_GPIO, CAM_PCLK_GPIO);
    LOG_I("CAM", "Y2-Y9=%d,%d,%d,%d,%d,%d,%d,%d",
          CAM_Y2_GPIO, CAM_Y3_GPIO, CAM_Y4_GPIO, CAM_Y5_GPIO,
          CAM_Y6_GPIO, CAM_Y7_GPIO, CAM_Y8_GPIO, CAM_Y9_GPIO);
    LOG_I("CAM", "VSYNC=%d HREF=%d", CAM_VSYNC_GPIO, CAM_HREF_GPIO);
    
    // Build camera configuration
    camera_config_t config;
    config.ledc_channel = LEDC_CHANNEL_0;
    config.ledc_timer = LEDC_TIMER_0;
    
    // Pin assignments from board header
    config.pin_d0 = CAM_Y2_GPIO;
    config.pin_d1 = CAM_Y3_GPIO;
    config.pin_d2 = CAM_Y4_GPIO;
    config.pin_d3 = CAM_Y5_GPIO;
    config.pin_d4 = CAM_Y6_GPIO;
    config.pin_d5 = CAM_Y7_GPIO;
    config.pin_d6 = CAM_Y8_GPIO;
    config.pin_d7 = CAM_Y9_GPIO;
    config.pin_xclk = CAM_XCLK_GPIO;
    config.pin_pclk = CAM_PCLK_GPIO;
    config.pin_vsync = CAM_VSYNC_GPIO;
    config.pin_href = CAM_HREF_GPIO;
    config.pin_sccb_sda = CAM_SIOD_GPIO;
    config.pin_sccb_scl = CAM_SIOC_GPIO;
    config.pin_pwdn = CAM_PWDN_GPIO;
    config.pin_reset = CAM_RESET_GPIO;
    
    // Clock and format settings
    config.xclk_freq_hz = CONFIG_XCLK_HZ;
    config.pixel_format = PIXFORMAT_JPEG;
    config.grab_mode = CAMERA_GRAB_LATEST;
    
    // Configure based on PSRAM availability
    bool has_psram = psramFound();
    LOG_I("CAM", "PSRAM: %s (%lu bytes)", 
          has_psram ? "detected" : "not found",
          (unsigned long)ESP.getPsramSize());
    
    if (has_psram) {
        // Reduce frame size to VGA to prevent DMA overflow (was SVGA)
        config.frame_size = FRAMESIZE_VGA;  // 640x480 instead of SVGA (800x600)
        config.jpeg_quality = CONFIG_JPEG_QUALITY_PSRAM;
        config.fb_count = 3;  // Increase buffer count to prevent overflow
        config.fb_location = CAMERA_FB_IN_PSRAM;
        LOG_I("CAM", "Using PSRAM config: VGA (640x480), quality=%d, fb_count=%d",
              CONFIG_JPEG_QUALITY_PSRAM, 3);
    } else {
        config.frame_size = CONFIG_FRAME_SIZE;
        config.jpeg_quality = CONFIG_JPEG_QUALITY;
        config.fb_count = CONFIG_FB_COUNT_NO_PSRAM;
        config.fb_location = CAMERA_FB_IN_DRAM;
        LOG_I("CAM", "Using DRAM config: QVGA, quality=%d, fb_count=%d",
              CONFIG_JPEG_QUALITY, CONFIG_FB_COUNT_NO_PSRAM);
    }
    
    // #region agent log - Hypothesis A: Camera init start
    unsigned long before_esp_init = millis();
    size_t heap_before = ESP.getFreeHeap();
    size_t psram_before = ESP.getFreePsram();
    Serial.printf("[DBG-CAM] Starting esp_camera_init() at %lu ms\n", before_esp_init);
    Serial.printf("[DBG-CAM] Heap before init: %lu bytes free\n", heap_before);
    Serial.printf("[DBG-CAM] PSRAM before init: %lu bytes free\n", psram_before);
    // #endregion
    
    // No watchdog manipulation - let system defaults handle it
    // Attempt initialization with timeout guard
    LOG_I("CAM", "Calling esp_camera_init()...");
    Serial.printf("[DBG-CAM] About to call esp_camera_init() - this is a blocking call\n");
    
    unsigned long init_start = millis();
    s_last_error = esp_camera_init(&config);
    unsigned long init_duration = millis() - init_start;
    unsigned long after_esp_init = millis();
    size_t heap_after = ESP.getFreeHeap();
    size_t psram_after = ESP.getFreePsram();
    
    Serial.printf("[DBG-CAM] esp_camera_init() returned 0x%x at %lu ms (duration=%lu ms)\n", 
                  s_last_error, after_esp_init, init_duration);
    Serial.printf("[DBG-CAM] Heap after init: %lu bytes free (delta=%ld bytes)\n", 
                  heap_after, (long)(heap_after - heap_before));
    Serial.printf("[DBG-CAM] PSRAM after init: %lu bytes free (delta=%ld bytes)\n", 
                  psram_after, (long)(psram_after - psram_before));
    
    // #region agent log - Hypothesis A/B: Camera init result
    Serial.printf("[DBG-CAM] esp_camera_init() returned 0x%x after %lu ms\n", s_last_error, init_duration);
    // #endregion
    
    // Check for timeout (init took too long even if it returned)
    const unsigned long CAMERA_INIT_TIMEOUT_MS = 15000;  // 15 second timeout
    if (init_duration > CAMERA_INIT_TIMEOUT_MS) {
        // #region agent log - Hypothesis B: Timeout detected
        Serial.printf("[DBG-CAM] WARNING: Camera init took %lu ms (timeout=%lu ms)\n", 
                      init_duration, CAMERA_INIT_TIMEOUT_MS);
        // #endregion
        if (s_last_error == ESP_OK) {
            // Init returned OK but took too long - treat as failure
            s_last_error = ESP_ERR_TIMEOUT;
        }
    }
    
    if (s_last_error != ESP_OK) {
        s_status = CameraStatus::INIT_FAILED;
        s_error_message = esp_err_to_name_safe(s_last_error);
        LOG_E("CAM", "Init failed: 0x%x (%s) after %lu ms", s_last_error, s_error_message, init_duration);
        
        // #region agent log - Hypothesis C: Record failure for safe mode
        Serial.printf("[DBG-CAM] Recording failure (count=%d)\n", safe_mode_get_fail_count() + 1);
        // #endregion
        safe_mode_record_failure();
        
        return false;
    }
    
    // #region agent log - Hypothesis C: Clear failures on success
    Serial.printf("[DBG-CAM] Camera init succeeded, clearing failure count\n");
    // #endregion
    safe_mode_clear_failures();
    
    // Configure sensor defaults
    sensor_t* sensor = esp_camera_sensor_get();
    if (sensor) {
        // Set to VGA (640x480) to prevent DMA overflow (was SVGA 800x600)
        sensor->set_framesize(sensor, FRAMESIZE_VGA);
        sensor->set_vflip(sensor, 0);
        sensor->set_hmirror(sensor, 0);
        LOG_I("CAM", "Sensor configured: %s (VGA 640x480)", 
              sensor->id.PID == OV2640_PID ? "OV2640" : "Unknown");
        
        // Store sensor settings for resume
        s_stored_framesize = FRAMESIZE_VGA;
        s_stored_vflip = 0;
        s_stored_hmirror = 0;
    } else {
        LOG_W("CAM", "Could not get sensor handle");
    }
    
    // Store camera config for later resume
    memcpy(&s_stored_config, &config, sizeof(camera_config_t));
    s_config_stored = true;
    
    s_status = CameraStatus::OK;
    s_error_message = "OK";
    LOG_I("CAM", "Camera initialized successfully");
    
    return true;
#endif
}

// ============================================================================
// Status Functions
// ============================================================================
bool camera_is_ok() {
    return s_status == CameraStatus::OK;
}

CameraStatus camera_status() {
    return s_status;
}

const char* camera_last_error() {
    return s_error_message;
}

int camera_last_error_code() {
    return (int)s_last_error;
}

CameraStats camera_get_stats() {
    return s_stats;
}

// ============================================================================
// Capture Functions
// ============================================================================
camera_fb_t* camera_capture() {
    // Do NOT manually feed Task Watchdog - let system defaults handle it
    
    if (s_status != CameraStatus::OK) {
        s_stats.failures++;
        return NULL;
    }
    
    unsigned long start = millis();
    camera_fb_t* fb = esp_camera_fb_get();
    unsigned long duration = millis() - start;
    
    if (fb) {
        s_stats.captures++;
        s_stats.last_capture_ms = duration;
        s_stats.last_frame_bytes = fb->len;
        s_stats.last_capture_time = millis();
        
#if DEBUG_CAMERA_TIMING
        LOG_V("CAM", "Capture: %lu bytes in %lu ms", fb->len, duration);
#endif
    } else {
        s_stats.failures++;
        s_status = CameraStatus::CAPTURE_FAILED;
        s_error_message = "Capture failed";
        LOG_W("CAM", "Frame capture failed");
    }
    
    return fb;
}

void camera_return_frame(camera_fb_t* fb) {
    if (fb) {
        esp_camera_fb_return(fb);
    }
}

// ============================================================================
// Configuration Functions
// ============================================================================
bool camera_set_framesize(framesize_t framesize) {
    sensor_t* sensor = esp_camera_sensor_get();
    if (!sensor) {
        return false;
    }
    return sensor->set_framesize(sensor, framesize) == 0;
}

bool camera_set_quality(int quality) {
    sensor_t* sensor = esp_camera_sensor_get();
    if (!sensor) {
        return false;
    }
    return sensor->set_quality(sensor, quality) == 0;
}

sensor_t* camera_get_sensor() {
    if (s_status != CameraStatus::OK) {
        return NULL;
    }
    return esp_camera_sensor_get();
}

// ============================================================================
// Camera Stop/Resume Functions
// ============================================================================
bool camera_stop() {
#if !ENABLE_CAMERA
    return false;
#else
    if (s_status != CameraStatus::OK) {
        LOG_W("CAM", "Camera not initialized, cannot stop");
        return false;
    }
    
    unsigned long stop_start = millis();
    LOG_I("CAM", "Stopping camera (deinit) before WiFi init...");
    Serial.printf("[CAM] Camera stop started at %lu ms\n", stop_start);
    
    // Sensor settings are already stored in s_stored_framesize, s_stored_vflip, s_stored_hmirror
    // from camera_init(), so we don't need to read them back here
    
    // CRITICAL: Delete task from watchdog before blocking esp_camera_deinit() call
    // esp_camera_deinit() is blocking and can take time, during which camera interrupts
    // may still fire. This prevents TG1WDT from triggering during deinit.
    // #region agent log - Hypothesis J: Watchdog management during camera_stop()
    Serial.printf("[DBG-CAM] Deleting task from watchdog before esp_camera_deinit() at %lu ms\n", millis());
    // #endregion
    esp_task_wdt_delete(NULL);
    
    // Yield to IDLE task before blocking deinit to prevent TG1WDT starvation
    // #region agent log - Hypothesis J: Yield before camera deinit
    Serial.printf("[DBG-CAM] Yielding to IDLE task before esp_camera_deinit() at %lu ms\n", millis());
    // #endregion
    vTaskDelay(pdMS_TO_TICKS(10));  // Yield 10ms to allow IDLE task to run
    
    // Deinitialize camera - stops HAL, disables interrupts, frees buffers
    // This is a blocking call that can take time
    // #region agent log - Hypothesis J: Entering blocking esp_camera_deinit()
    Serial.printf("[DBG-CAM] Entering esp_camera_deinit() blocking call at %lu ms\n", millis());
    // #endregion
    esp_err_t deinit_result = esp_camera_deinit();
    
    // #region agent log - Hypothesis J: esp_camera_deinit() completed
    unsigned long deinit_end = millis();
    Serial.printf("[DBG-CAM] esp_camera_deinit() completed at %lu ms (result=0x%x)\n", deinit_end, deinit_result);
    // #endregion
    
    // Re-add task to watchdog after deinit completes
    // #region agent log - Hypothesis J: Re-adding task to watchdog after camera deinit
    Serial.printf("[DBG-CAM] Re-adding task to watchdog after esp_camera_deinit() at %lu ms\n", millis());
    // #endregion
    esp_task_wdt_add(NULL);
    esp_task_wdt_reset();
    
    unsigned long stop_duration = millis() - stop_start;
    
    if (deinit_result != ESP_OK) {
        LOG_E("CAM", "Camera deinit failed: 0x%x", deinit_result);
        s_error_message = "Deinit failed";
        return false;
    }
    
    // Update status
    s_status = CameraStatus::NOT_INITIALIZED;
    s_error_message = "Stopped";
    
    LOG_I("CAM", "Camera stopped (deinit) successfully (took %lu ms)", stop_duration);
    Serial.printf("[CAM] Camera stopped at %lu ms (duration=%lu ms)\n", 
                  millis(), stop_duration);
    
    return true;
#endif
}

bool camera_resume() {
#if !ENABLE_CAMERA
    return false;
#else
    if (!s_config_stored) {
        LOG_E("CAM", "No stored camera config, cannot resume");
        s_error_message = "No stored config";
        return false;
    }
    
    if (s_status == CameraStatus::OK) {
        LOG_W("CAM", "Camera already initialized, no need to resume");
        return true;
    }
    
    unsigned long resume_start = millis();
    LOG_I("CAM", "Resuming camera (reinit) after WiFi init...");
    Serial.printf("[CAM] Camera resume started at %lu ms\n", resume_start);
    
    // Re-initialize camera with stored config
    unsigned long init_start = millis();
    s_last_error = esp_camera_init(&s_stored_config);
    unsigned long init_duration = millis() - init_start;
    
    if (s_last_error != ESP_OK) {
        s_status = CameraStatus::INIT_FAILED;
        s_error_message = esp_err_to_name_safe(s_last_error);
        LOG_E("CAM", "Camera resume (reinit) failed: 0x%x (%s) after %lu ms", 
              s_last_error, s_error_message, init_duration);
        Serial.printf("[CAM] Camera resume failed: 0x%x (took %lu ms)\n", 
                      s_last_error, init_duration);
        return false;
    }
    
    // Restore sensor settings
    sensor_t* sensor = esp_camera_sensor_get();
    if (sensor) {
        sensor->set_framesize(sensor, s_stored_framesize);
        sensor->set_vflip(sensor, s_stored_vflip);
        sensor->set_hmirror(sensor, s_stored_hmirror);
        LOG_I("CAM", "Sensor settings restored: framesize=%d, vflip=%d, hmirror=%d",
              s_stored_framesize, s_stored_vflip, s_stored_hmirror);
    } else {
        LOG_W("CAM", "Could not get sensor handle after resume");
    }
    
    // Update status
    s_status = CameraStatus::OK;
    s_error_message = "OK";
    
    unsigned long resume_duration = millis() - resume_start;
    LOG_I("CAM", "Camera resumed (reinit) successfully (took %lu ms)", resume_duration);
    Serial.printf("[CAM] Camera resumed at %lu ms (duration=%lu ms, init=%lu ms)\n", 
                  millis(), resume_duration, init_duration);
    
    return true;
#endif
}

