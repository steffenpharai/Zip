/**
 * Camera Service - Implementation
 * 
 * Handles camera initialization with proper error tracking,
 * defensive logging, and graceful degradation.
 */

#include "camera_service.h"
#include <Arduino.h>
#include "esp_camera.h"
#include "esp_task_wdt.h"
#include "board/board_esp32s3_elegoo_cam.h"
#include "config/build_config.h"
#include "config/runtime_config.h"

// ============================================================================
// Module State
// ============================================================================
static CameraStatus s_status = CameraStatus::NOT_INITIALIZED;
static esp_err_t s_last_error = ESP_OK;
static const char* s_error_message = "Not initialized";
static CameraStats s_stats = {0, 0, 0, 0, 0};

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
        config.frame_size = CONFIG_FRAME_SIZE_PSRAM;
        config.jpeg_quality = CONFIG_JPEG_QUALITY_PSRAM;
        config.fb_count = CONFIG_FB_COUNT_PSRAM;
        config.fb_location = CAMERA_FB_IN_PSRAM;
        LOG_I("CAM", "Using PSRAM config: SVGA, quality=%d, fb_count=%d",
              CONFIG_JPEG_QUALITY_PSRAM, CONFIG_FB_COUNT_PSRAM);
    } else {
        config.frame_size = CONFIG_FRAME_SIZE;
        config.jpeg_quality = CONFIG_JPEG_QUALITY;
        config.fb_count = CONFIG_FB_COUNT_NO_PSRAM;
        config.fb_location = CAMERA_FB_IN_DRAM;
        LOG_I("CAM", "Using DRAM config: QVGA, quality=%d, fb_count=%d",
              CONFIG_JPEG_QUALITY, CONFIG_FB_COUNT_NO_PSRAM);
    }
    
    // Feed watchdog before potentially long operation
    esp_task_wdt_reset();
    
    // Attempt initialization
    LOG_I("CAM", "Calling esp_camera_init()...");
    s_last_error = esp_camera_init(&config);
    
    // Feed watchdog after operation
    esp_task_wdt_reset();
    
    if (s_last_error != ESP_OK) {
        s_status = CameraStatus::INIT_FAILED;
        s_error_message = esp_err_to_name_safe(s_last_error);
        LOG_E("CAM", "Init failed: 0x%x (%s)", s_last_error, s_error_message);
        return false;
    }
    
    // Configure sensor defaults
    sensor_t* sensor = esp_camera_sensor_get();
    if (sensor) {
        // Set to SVGA (800x600) for streaming - matches ELEGOO default
        sensor->set_framesize(sensor, FRAMESIZE_SVGA);
        sensor->set_vflip(sensor, 0);
        sensor->set_hmirror(sensor, 0);
        LOG_I("CAM", "Sensor configured: %s", 
              sensor->id.PID == OV2640_PID ? "OV2640" : "Unknown");
    } else {
        LOG_W("CAM", "Could not get sensor handle");
    }
    
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

