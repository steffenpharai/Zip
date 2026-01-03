/**
 * UART Bridge Service - Interface
 * 
 * Provides UART communication with the robot shield (Arduino UNO).
 * Uses WROVER-compatible UART0 pinout for shield compatibility.
 * 
 * Hardware: ELEGOO SmartRobot-Shield (designed for ESP32-WROVER)
 *   TX = GPIO1 (ESP32 → Arduino RX)
 *   RX = GPIO3 (Arduino TX → ESP32)
 * 
 * Note: The shield P8 header labels "0(RX)" and "1(TX)" refer to
 * Arduino D0/D1, not ESP32 GPIO numbers. The physical routing
 * matches ESP32-WROVER UART0: GPIO1 (TX) and GPIO3 (RX).
 */

#ifndef UART_BRIDGE_H
#define UART_BRIDGE_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

// ============================================================================
// UART Statistics
// ============================================================================
struct UartStats {
    uint32_t rx_bytes;          // Total bytes received
    uint32_t tx_bytes;          // Total bytes transmitted
    uint32_t rx_frames;         // Complete JSON frames received
    uint32_t tx_frames;         // Complete JSON frames transmitted
    uint32_t framing_errors;    // Invalid frame errors
    uint32_t buffer_overflows;  // Ring buffer overflow events
    unsigned long last_rx_ts;   // Last receive timestamp (millis)
    unsigned long last_tx_ts;   // Last transmit timestamp (millis)
};

// ============================================================================
// UART Bridge Interface
// ============================================================================

/**
 * Initialize the UART bridge.
 * Configures Serial2 with WROVER-compatible pins (GPIO1/GPIO3).
 * 
 * @return true if initialization succeeded
 */
bool uart_init();

/**
 * Check if UART is operational.
 * 
 * @return true if UART is initialized and ready
 */
bool uart_is_ok();

/**
 * Check if boot guard window has expired.
 * Legacy function - always returns true with GPIO3 (non-strapping pin).
 * Retained for API compatibility.
 * 
 * @return true (always, since GPIO3 doesn't need boot protection)
 */
bool uart_boot_guard_expired();

/**
 * Process UART data (call from main loop).
 * Handles RX/TX buffering and frame parsing.
 */
void uart_tick();

/**
 * Transmit raw data.
 * 
 * @param data Data buffer to send
 * @param len Length of data
 * @return Number of bytes actually sent
 */
size_t uart_tx(const uint8_t* data, size_t len);

/**
 * Transmit a null-terminated string.
 * 
 * @param str String to send
 * @return Number of bytes sent
 */
size_t uart_tx_string(const char* str);

/**
 * Check if RX data is available.
 * 
 * @return Number of bytes available in RX buffer
 */
size_t uart_rx_available();

/**
 * Read data from RX buffer.
 * 
 * @param buffer Destination buffer
 * @param max_len Maximum bytes to read
 * @return Number of bytes actually read
 */
size_t uart_rx_read(uint8_t* buffer, size_t max_len);

/**
 * Read a single byte from RX buffer.
 * 
 * @return Byte value (0-255) or -1 if buffer empty
 */
int uart_rx_read_byte();

/**
 * Peek at next byte without removing from buffer.
 * 
 * @return Byte value (0-255) or -1 if buffer empty
 */
int uart_rx_peek();

/**
 * Get UART statistics.
 * 
 * @return UartStats structure
 */
UartStats uart_get_stats();

/**
 * Get the RX pin number.
 * 
 * @return GPIO number for RX
 */
int uart_get_rx_pin();

/**
 * Get the TX pin number.
 * 
 * @return GPIO number for TX
 */
int uart_get_tx_pin();

/**
 * Check if a complete JSON frame is available.
 * A frame is delimited by { and }.
 * 
 * @return true if at least one complete frame is buffered
 */
bool uart_frame_available();

/**
 * Read a complete JSON frame.
 * Reads characters until } is found.
 * 
 * @param buffer Destination buffer
 * @param max_len Maximum bytes to read
 * @return Length of frame, or 0 if no complete frame
 */
size_t uart_read_frame(char* buffer, size_t max_len);

#endif // UART_BRIDGE_H

