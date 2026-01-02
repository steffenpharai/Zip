/**
 * Runtime Configuration - Default Parameters
 * 
 * These are the default runtime parameters for the firmware.
 * They provide sane defaults that work on standard hardware.
 * Values can be adjusted here for different configurations.
 */

#ifndef RUNTIME_CONFIG_H
#define RUNTIME_CONFIG_H

#include "esp_camera.h"

// ============================================================================
// Camera Configuration
// ============================================================================

// External clock frequency for OV2640
// 20 MHz is stable; some boards support up to 24 MHz
#ifndef CONFIG_XCLK_HZ
#define CONFIG_XCLK_HZ              20000000    // 20 MHz
#endif

// Default frame size (QVGA = 320x240, safe for all configurations)
// Can be upgraded to VGA/SVGA if PSRAM is available
#ifndef CONFIG_FRAME_SIZE
#define CONFIG_FRAME_SIZE           FRAMESIZE_QVGA
#endif

// JPEG quality (1-63, lower = better quality, more data)
// 10-12 is good balance of quality and speed
#ifndef CONFIG_JPEG_QUALITY
#define CONFIG_JPEG_QUALITY         12
#endif

// Frame buffer count
// 1 for no PSRAM, 2 for PSRAM (enables double buffering)
#ifndef CONFIG_FB_COUNT_NO_PSRAM
#define CONFIG_FB_COUNT_NO_PSRAM    1
#endif

#ifndef CONFIG_FB_COUNT_PSRAM
#define CONFIG_FB_COUNT_PSRAM       2
#endif

// High quality settings when PSRAM is available
#ifndef CONFIG_FRAME_SIZE_PSRAM
#define CONFIG_FRAME_SIZE_PSRAM     FRAMESIZE_SVGA  // 800x600
#endif

#ifndef CONFIG_JPEG_QUALITY_PSRAM
#define CONFIG_JPEG_QUALITY_PSRAM   10
#endif

// ============================================================================
// UART Configuration
// ============================================================================

// Baud rate for Serial2 (to robot shield/UNO)
// Must match ZIP UNO firmware (115200)
#ifndef CONFIG_UART_BAUD
#define CONFIG_UART_BAUD            115200
#endif

// Debug serial baud rate
#ifndef CONFIG_DEBUG_BAUD
#define CONFIG_DEBUG_BAUD           115200
#endif

// Boot guard window (milliseconds)
// UART RX is disabled during this window after reset to protect GPIO0
#ifndef CONFIG_BOOT_GUARD_MS
#define CONFIG_BOOT_GUARD_MS        1000
#endif

// UART ring buffer size
#ifndef CONFIG_UART_RX_BUFFER_SIZE
#define CONFIG_UART_RX_BUFFER_SIZE  512
#endif

#ifndef CONFIG_UART_TX_BUFFER_SIZE
#define CONFIG_UART_TX_BUFFER_SIZE  512
#endif

// ============================================================================
// WiFi Configuration
// ============================================================================

// WiFi channel (ELEGOO default is 9)
#ifndef CONFIG_WIFI_CHANNEL
#define CONFIG_WIFI_CHANNEL         9
#endif

// WiFi TX power
#ifndef CONFIG_WIFI_TX_POWER
#define CONFIG_WIFI_TX_POWER        WIFI_POWER_19_5dBm
#endif

// SSID prefix (MAC address is appended)
#ifndef CONFIG_WIFI_SSID_PREFIX
#define CONFIG_WIFI_SSID_PREFIX     "ELEGOO-"
#endif

// ============================================================================
// TCP Server Configuration
// ============================================================================

// TCP server port for robot commands
#ifndef CONFIG_TCP_PORT
#define CONFIG_TCP_PORT             100
#endif

// Heartbeat interval (milliseconds)
#ifndef CONFIG_HEARTBEAT_INTERVAL_MS
#define CONFIG_HEARTBEAT_INTERVAL_MS 1000
#endif

// Heartbeat timeout (missed beats before disconnect)
#ifndef CONFIG_HEARTBEAT_TIMEOUT_COUNT
#define CONFIG_HEARTBEAT_TIMEOUT_COUNT 3
#endif

// ============================================================================
// HTTP Server Configuration
// ============================================================================

// Main web server port
#ifndef CONFIG_HTTP_PORT
#define CONFIG_HTTP_PORT            80
#endif

// Stream server port
#ifndef CONFIG_STREAM_PORT
#define CONFIG_STREAM_PORT          81
#endif

// ============================================================================
// Watchdog Configuration
// ============================================================================

// Watchdog timeout during initialization (longer for camera init)
#ifndef CONFIG_WDT_INIT_TIMEOUT_S
#define CONFIG_WDT_INIT_TIMEOUT_S   30
#endif

// Watchdog timeout during runtime
#ifndef CONFIG_WDT_RUNTIME_TIMEOUT_S
#define CONFIG_WDT_RUNTIME_TIMEOUT_S 10
#endif

// ============================================================================
// Timing Configuration
// ============================================================================

// LED blink interval when no client connected (milliseconds)
#ifndef CONFIG_LED_BLINK_INTERVAL_MS
#define CONFIG_LED_BLINK_INTERVAL_MS 100
#endif

// Main loop yield delay (milliseconds)
#ifndef CONFIG_LOOP_DELAY_MS
#define CONFIG_LOOP_DELAY_MS        1
#endif

#endif // RUNTIME_CONFIG_H

