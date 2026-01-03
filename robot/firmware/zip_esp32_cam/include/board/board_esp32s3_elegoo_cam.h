/**
 * Board Configuration - ESP32S3-Camera-v1.0 (ELEGOO Smart Robot Car V4.0)
 * 
 * Single source of truth for all pin assignments and board capabilities.
 * This header defines the correct ESP32-S3 GPIO mappings for the OV3660 camera
 * and UART bridge to the robot shield.
 * 
 * Hardware: ESP32-S3-WROOM-1 + OV3660 camera module
 * Shield: ELEGOO SmartRobot-Shield (TB6612)
 */

#ifndef BOARD_ESP32S3_ELEGOO_CAM_H
#define BOARD_ESP32S3_ELEGOO_CAM_H

#include <stdint.h>
#include <stdbool.h>

// ============================================================================
// Board Identification
// ============================================================================
#define BOARD_NAME                  "ESP32S3-Camera-v1.0"
#define BOARD_VENDOR                "ELEGOO"
#define BOARD_MCU                   "ESP32-S3-WROOM-1"
#define BOARD_CAMERA_SENSOR         "OV3660"

// ============================================================================
// Camera Pin Definitions (ESP32-S3 Valid GPIOs)
// ============================================================================
// These pins are the correct ESP32-S3 mapping for the ELEGOO OV3660 camera module.
// Unlike ESP32-WROVER, ESP32-S3 does not have GPIO 34, 35, 36, 39.
// 
// NOTE: GPIO 45 (XCLK) is a strapping pin - requires 100ms delay before camera init.

#define CAM_PWDN_GPIO               (-1)    // Power down not connected
#define CAM_RESET_GPIO              (-1)    // Reset not connected
#define CAM_XCLK_GPIO               45      // External clock (strapping pin - must delay before init)
#define CAM_SIOD_GPIO               1       // I2C SDA (SCCB data) - was GPIO 4
#define CAM_SIOC_GPIO               2       // I2C SCL (SCCB clock) - was GPIO 5

// Parallel data pins (D0-D7 mapped to Y2-Y9)
#define CAM_Y2_GPIO                 47      // D0 (shared with Flash LED)
#define CAM_Y3_GPIO                 18      // D1 - was GPIO 9
#define CAM_Y4_GPIO                 17      // D2 - was GPIO 8
#define CAM_Y5_GPIO                 16      // D3 - was GPIO 10
#define CAM_Y6_GPIO                 15      // D4 - was GPIO 12
#define CAM_Y7_GPIO                 14      // D5 - was GPIO 18
#define CAM_Y8_GPIO                 48      // D6 - was GPIO 17 (resolves PCLK conflict)
#define CAM_Y9_GPIO                 12      // D7 - was GPIO 16

// Sync signals
#define CAM_VSYNC_GPIO              6       // Vertical sync
#define CAM_HREF_GPIO               7       // Horizontal reference
#define CAM_PCLK_GPIO               13      // Pixel clock

// ============================================================================
// UART Pin Definitions (OV3660 Configuration)
// ============================================================================
// UART pins updated for OV3660 camera module:
//   RX = GPIO44  (hardware UART0, safe input)
//   TX = GPIO43  (hardware UART0, safe output)
//
// Previous pins (GPIO33/GPIO1) are now used by camera:
//   - GPIO1 is now camera SIOD (I2C SDA) - must not be used for UART
//   - GPIO33 is available but GPIO44/43 are preferred for hardware UART0
//
// The shield P8 header labels "0(RX)" and "1(TX)" refer to Arduino D0/D1,
// NOT ESP32 GPIO numbers. The physical routing maps to GPIO43/GPIO44.

#define UART_RX_GPIO                44      // Hardware UART0 RX
#define UART_TX_GPIO                43      // Hardware UART0 TX

// ============================================================================
// LED Pin Definition
// ============================================================================
// Status LED moved to GPIO3 for OV3660 configuration.
// GPIO14 is now used by camera D5 data pin.

#define LED_STATUS_GPIO             3       // Status LED (was GPIO 14)

// ============================================================================
// Optional Camera LED / Flash LED
// ============================================================================
// Define if the board has a camera flash LED. Set to -1 if not present.
// For OV3660, flash LED shares GPIO 47 with camera D0 data pin.
#ifdef BOARD_HAS_CAMERA_LED
#define CAM_LED_GPIO                47      // Flash LED (shared with D0)
#else
#define CAM_LED_GPIO                (-1)    // Not present
#endif

// ============================================================================
// Compile-Time Pin Conflict Validation
// ============================================================================
// These static_asserts ensure no pin is used by multiple peripherals.
// Build will fail if any conflict is detected.

// Helper macro for pin conflict checking
#define PIN_IN_USE(pin) ((pin) >= 0)

// Ensure UART pins don't conflict with camera
static_assert(UART_RX_GPIO != CAM_SIOD_GPIO, "UART RX conflicts with camera SIOD");
static_assert(UART_RX_GPIO != CAM_SIOC_GPIO, "UART RX conflicts with camera SIOC");
static_assert(UART_RX_GPIO != CAM_PCLK_GPIO, "UART RX conflicts with camera PCLK");
static_assert(UART_TX_GPIO != CAM_SIOD_GPIO, "UART TX conflicts with camera SIOD");
static_assert(UART_TX_GPIO != CAM_SIOC_GPIO, "UART TX conflicts with camera SIOC");
static_assert(UART_TX_GPIO != CAM_PCLK_GPIO, "UART TX conflicts with camera PCLK");

// Ensure LED doesn't conflict with camera
static_assert(LED_STATUS_GPIO != CAM_SIOD_GPIO, "LED conflicts with camera SIOD");
static_assert(LED_STATUS_GPIO != CAM_SIOC_GPIO, "LED conflicts with camera SIOC");
static_assert(LED_STATUS_GPIO != CAM_PCLK_GPIO, "LED conflicts with camera PCLK");
static_assert(LED_STATUS_GPIO != CAM_XCLK_GPIO, "LED conflicts with camera XCLK");
static_assert(LED_STATUS_GPIO != CAM_VSYNC_GPIO, "LED conflicts with camera VSYNC");
static_assert(LED_STATUS_GPIO != CAM_HREF_GPIO, "LED conflicts with camera HREF");

// Ensure LED doesn't conflict with UART
static_assert(LED_STATUS_GPIO != UART_RX_GPIO, "LED conflicts with UART RX");
static_assert(LED_STATUS_GPIO != UART_TX_GPIO, "LED conflicts with UART TX");

// Ensure camera data pins are unique
static_assert(CAM_Y2_GPIO != CAM_Y3_GPIO, "Camera Y2 conflicts with Y3");
static_assert(CAM_Y2_GPIO != CAM_Y4_GPIO, "Camera Y2 conflicts with Y4");
static_assert(CAM_Y2_GPIO != CAM_Y5_GPIO, "Camera Y2 conflicts with Y5");
static_assert(CAM_Y2_GPIO != CAM_Y6_GPIO, "Camera Y2 conflicts with Y6");
static_assert(CAM_Y2_GPIO != CAM_Y7_GPIO, "Camera Y2 conflicts with Y7");
static_assert(CAM_Y2_GPIO != CAM_Y8_GPIO, "Camera Y2 conflicts with Y8");
static_assert(CAM_Y2_GPIO != CAM_Y9_GPIO, "Camera Y2 conflicts with Y9");

// PRODUCTION FIX: Ensure PCLK (GPIO 13) does not conflict with D6 data line (GPIO 48)
// PCLK is a dedicated hardware signal and must never be shared with data lines
// If these overlap, the CPU will trigger watchdog reset as it enters "Live-lock"
// trying to process constant stream of false clock interrupts
static_assert(CAM_PCLK_GPIO != CAM_Y8_GPIO, "PCLK (GPIO 13) must not conflict with D6 data line (GPIO 48)");

// ============================================================================
// Board Capabilities Structure
// ============================================================================
struct BoardConfig {
    const char* name;
    const char* mcu;
    const char* camera_sensor;
    bool has_psram;
    uint32_t psram_bytes;
    uint32_t flash_bytes;
    uint32_t uart_baud;
    uint32_t xclk_hz;
    
    // Runtime state (set during initialization)
    bool camera_init_ok;
    int camera_last_error;
    bool uart_init_ok;
    bool wifi_init_ok;
};

// ============================================================================
// Default Board Configuration
// ============================================================================
// These defaults are applied at startup. Runtime values are updated
// during initialization based on actual hardware detection.

#define BOARD_DEFAULT_UART_BAUD     115200
#define BOARD_DEFAULT_XCLK_HZ       20000000    // 20 MHz (stable for OV3660, can test 24 MHz)
#define BOARD_DEFAULT_PSRAM_BYTES   8388608     // 8 MB (typical for S3)
#define BOARD_DEFAULT_FLASH_BYTES   8388608     // 8 MB (typical for S3)

// ============================================================================
// GPIO Validation Helpers
// ============================================================================
// ESP32-S3 valid GPIO range: 0-48 (with some reserved)

#define IS_VALID_GPIO(pin) ((pin) >= 0 && (pin) <= 48)
#define IS_STRAPPING_PIN(pin) ((pin) == 0 || (pin) == 3 || (pin) == 45 || (pin) == 46)

// ============================================================================
// Backward Compatibility Aliases
// ============================================================================
// These aliases match the naming convention used in esp_camera driver

#define PWDN_GPIO_NUM               CAM_PWDN_GPIO
#define RESET_GPIO_NUM              CAM_RESET_GPIO
#define XCLK_GPIO_NUM               CAM_XCLK_GPIO
#define SIOD_GPIO_NUM               CAM_SIOD_GPIO
#define SIOC_GPIO_NUM               CAM_SIOC_GPIO
#define Y2_GPIO_NUM                 CAM_Y2_GPIO
#define Y3_GPIO_NUM                 CAM_Y3_GPIO
#define Y4_GPIO_NUM                 CAM_Y4_GPIO
#define Y5_GPIO_NUM                 CAM_Y5_GPIO
#define Y6_GPIO_NUM                 CAM_Y6_GPIO
#define Y7_GPIO_NUM                 CAM_Y7_GPIO
#define Y8_GPIO_NUM                 CAM_Y8_GPIO
#define Y9_GPIO_NUM                 CAM_Y9_GPIO
#define VSYNC_GPIO_NUM              CAM_VSYNC_GPIO
#define HREF_GPIO_NUM               CAM_HREF_GPIO
#define PCLK_GPIO_NUM               CAM_PCLK_GPIO

#define SERIAL2_RX_PIN              UART_RX_GPIO
#define SERIAL2_TX_PIN              UART_TX_GPIO
#define LED_STATUS_PIN              LED_STATUS_GPIO

#endif // BOARD_ESP32S3_ELEGOO_CAM_H

