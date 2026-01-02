/**
 * UART Bridge Service - Implementation
 * 
 * Boot-safe UART communication with GPIO0 protection.
 * GPIO0 is a boot strapping pin - if held low during reset,
 * ESP32-S3 enters download mode. This driver implements a
 * boot guard window to prevent external devices from causing issues.
 */

#include "uart_bridge.h"
#include <Arduino.h>
#include "driver/gpio.h"
#include "board/board_esp32s3_elegoo_cam.h"
#include "config/build_config.h"
#include "config/runtime_config.h"

// ============================================================================
// Module State
// ============================================================================
static bool s_initialized = false;
static bool s_boot_guard_expired = false;
static unsigned long s_boot_start_time = 0;
static UartStats s_stats = {0, 0, 0, 0, 0, 0, 0, 0};

// Ring buffer for RX data
static uint8_t s_rx_buffer[CONFIG_UART_RX_BUFFER_SIZE];
static volatile size_t s_rx_head = 0;
static volatile size_t s_rx_tail = 0;

// Frame parsing state
static bool s_in_frame = false;
static size_t s_frame_start = 0;

// ============================================================================
// Ring Buffer Helpers
// ============================================================================
static inline size_t ring_buffer_count() {
    if (s_rx_head >= s_rx_tail) {
        return s_rx_head - s_rx_tail;
    }
    return CONFIG_UART_RX_BUFFER_SIZE - s_rx_tail + s_rx_head;
}

static inline bool ring_buffer_full() {
    return ring_buffer_count() >= (CONFIG_UART_RX_BUFFER_SIZE - 1);
}

static inline void ring_buffer_push(uint8_t byte) {
    size_t next = (s_rx_head + 1) % CONFIG_UART_RX_BUFFER_SIZE;
    if (next != s_rx_tail) {
        s_rx_buffer[s_rx_head] = byte;
        s_rx_head = next;
    } else {
        s_stats.buffer_overflows++;
    }
}

static inline int ring_buffer_pop() {
    if (s_rx_head == s_rx_tail) {
        return -1;
    }
    uint8_t byte = s_rx_buffer[s_rx_tail];
    s_rx_tail = (s_rx_tail + 1) % CONFIG_UART_RX_BUFFER_SIZE;
    return byte;
}

static inline int ring_buffer_peek() {
    if (s_rx_head == s_rx_tail) {
        return -1;
    }
    return s_rx_buffer[s_rx_tail];
}

// ============================================================================
// UART Initialization
// ============================================================================
bool uart_init() {
#if !ENABLE_UART
    LOG_I("UART", "UART disabled by build config");
    return false;
#else
    s_boot_start_time = millis();
    
    LOG_I("UART", "Initializing UART bridge...");
    LOG_I("UART", "RX=GPIO%d TX=GPIO%d @ %d baud",
          UART_RX_GPIO, UART_TX_GPIO, CONFIG_UART_BAUD);
    
    // Check GPIO0 state before initializing
    // GPIO0 should be high for normal boot
    gpio_config_t io_conf = {};
    io_conf.pin_bit_mask = (1ULL << UART_RX_GPIO);
    io_conf.mode = GPIO_MODE_INPUT;
    io_conf.pull_up_en = GPIO_PULLUP_ENABLE;
    io_conf.pull_down_en = GPIO_PULLDOWN_DISABLE;
    io_conf.intr_type = GPIO_INTR_DISABLE;
    gpio_config(&io_conf);
    
    // Small delay for GPIO to settle
    delay(10);
    
    int gpio0_level = gpio_get_level((gpio_num_t)UART_RX_GPIO);
    if (gpio0_level == 0) {
        LOG_W("UART", "WARNING: GPIO0 is LOW at boot - external device may interfere!");
        LOG_W("UART", "Boot guard window: %d ms", CONFIG_BOOT_GUARD_MS);
    } else {
        LOG_I("UART", "GPIO0 is HIGH - normal boot");
    }
    
    // Don't initialize Serial2 yet - wait for boot guard to expire
    // This prevents issues with external devices driving GPIO0
    LOG_I("UART", "Boot guard active for %d ms", CONFIG_BOOT_GUARD_MS);
    
    s_initialized = true;
    return true;
#endif
}

// ============================================================================
// Boot Guard Management
// ============================================================================
bool uart_boot_guard_expired() {
    return s_boot_guard_expired;
}

static void complete_uart_init() {
    if (s_boot_guard_expired) {
        return;
    }
    
    // Initialize Serial2 with configured pins and baud rate
    Serial2.begin(CONFIG_UART_BAUD, SERIAL_8N1, UART_RX_GPIO, UART_TX_GPIO);
    
    s_boot_guard_expired = true;
    LOG_I("UART", "Boot guard expired - Serial2 active");
    
#if ENABLE_UART_LOOPBACK
    LOG_I("UART", "Loopback test mode enabled");
#endif
}

// ============================================================================
// UART Tick (Main Loop Processing)
// ============================================================================
void uart_tick() {
    if (!s_initialized) {
        return;
    }
    
    // Check if boot guard window has expired
    if (!s_boot_guard_expired) {
        if ((millis() - s_boot_start_time) >= CONFIG_BOOT_GUARD_MS) {
            complete_uart_init();
        }
        return;
    }
    
    // Read available data into ring buffer
    while (Serial2.available() && !ring_buffer_full()) {
        int byte = Serial2.read();
        if (byte >= 0) {
            ring_buffer_push((uint8_t)byte);
            s_stats.rx_bytes++;
            s_stats.last_rx_ts = millis();
            
#if DEBUG_UART_FRAMES
            Serial.print((char)byte);
#endif
            
            // Track frame boundaries
            if (byte == '{') {
                s_in_frame = true;
                s_frame_start = ring_buffer_count();
            } else if (byte == '}' && s_in_frame) {
                s_stats.rx_frames++;
                s_in_frame = false;
            }
        }
    }
    
#if ENABLE_UART_LOOPBACK
    // Echo received data back for testing
    while (uart_rx_available() > 0) {
        int byte = ring_buffer_pop();
        if (byte >= 0) {
            Serial2.write((uint8_t)byte);
            s_stats.tx_bytes++;
        }
    }
#endif
}

// ============================================================================
// Transmit Functions
// ============================================================================
size_t uart_tx(const uint8_t* data, size_t len) {
    if (!s_initialized || !s_boot_guard_expired || !data || len == 0) {
        return 0;
    }
    
    size_t written = Serial2.write(data, len);
    s_stats.tx_bytes += written;
    s_stats.last_tx_ts = millis();
    
    return written;
}

size_t uart_tx_string(const char* str) {
    if (!str) {
        return 0;
    }
    
    size_t len = strlen(str);
    size_t written = uart_tx((const uint8_t*)str, len);
    
    // Count as frame if it ends with }
    if (len > 0 && str[len - 1] == '}') {
        s_stats.tx_frames++;
    }
    
    return written;
}

// ============================================================================
// Receive Functions
// ============================================================================
size_t uart_rx_available() {
    return ring_buffer_count();
}

size_t uart_rx_read(uint8_t* buffer, size_t max_len) {
    if (!buffer || max_len == 0) {
        return 0;
    }
    
    size_t count = 0;
    while (count < max_len && uart_rx_available() > 0) {
        int byte = ring_buffer_pop();
        if (byte >= 0) {
            buffer[count++] = (uint8_t)byte;
        }
    }
    
    return count;
}

int uart_rx_read_byte() {
    return ring_buffer_pop();
}

int uart_rx_peek() {
    return ring_buffer_peek();
}

// ============================================================================
// Frame Functions
// ============================================================================
bool uart_frame_available() {
    // Scan buffer for complete frame (ends with })
    size_t count = ring_buffer_count();
    if (count == 0) {
        return false;
    }
    
    // Look for closing brace in buffer
    for (size_t i = 0; i < count; i++) {
        size_t idx = (s_rx_tail + i) % CONFIG_UART_RX_BUFFER_SIZE;
        if (s_rx_buffer[idx] == '}') {
            return true;
        }
    }
    
    return false;
}

size_t uart_read_frame(char* buffer, size_t max_len) {
    if (!buffer || max_len == 0) {
        return 0;
    }
    
    size_t count = 0;
    bool in_frame = false;
    
    while (count < (max_len - 1) && uart_rx_available() > 0) {
        int byte = ring_buffer_peek();
        if (byte < 0) {
            break;
        }
        
        if (byte == '{') {
            in_frame = true;
            count = 0;  // Reset on new frame start
        }
        
        if (in_frame) {
            ring_buffer_pop();
            buffer[count++] = (char)byte;
            
            if (byte == '}') {
                buffer[count] = '\0';
                return count;
            }
        } else {
            // Discard bytes outside of frame
            ring_buffer_pop();
            s_stats.framing_errors++;
        }
    }
    
    // Incomplete frame
    buffer[count] = '\0';
    return 0;
}

// ============================================================================
// Status Functions
// ============================================================================
bool uart_is_ok() {
    return s_initialized && s_boot_guard_expired;
}

UartStats uart_get_stats() {
    return s_stats;
}

int uart_get_rx_pin() {
    return UART_RX_GPIO;
}

int uart_get_tx_pin() {
    return UART_TX_GPIO;
}

