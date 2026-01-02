/**
 * Network Service - Interface
 * 
 * Provides WiFi Access Point functionality for the robot camera.
 * Uses ELEGOO MAC-based SSID naming convention.
 */

#ifndef NET_SERVICE_H
#define NET_SERVICE_H

#include <stdint.h>
#include <stdbool.h>
#include <IPAddress.h>
#include <WString.h>

// ============================================================================
// Network Status Enumeration
// ============================================================================
enum class NetStatus {
    DISCONNECTED,       // WiFi not started
    INITIALIZING,       // WiFi starting up
    AP_ACTIVE,          // Access Point is running
    ERROR               // Initialization failed
};

// ============================================================================
// Network Statistics
// ============================================================================
struct NetStats {
    uint8_t connected_stations;     // Number of clients connected
    int8_t tx_power;                // Current TX power
    unsigned long uptime_ms;        // Time since AP started
    unsigned long last_client_ts;   // Last client connect/disconnect time
};

// ============================================================================
// Network Service Interface
// ============================================================================

/**
 * Initialize WiFi Access Point.
 * Creates AP with ELEGOO MAC-based SSID.
 * 
 * @return true if initialization succeeded
 */
bool net_init();

/**
 * Get current network status.
 * 
 * @return NetStatus enum value
 */
NetStatus net_status();

/**
 * Check if network is operational.
 * 
 * @return true if AP is active
 */
bool net_is_ok();

/**
 * Get the AP IP address.
 * 
 * @return IP address (typically 192.168.4.1)
 */
IPAddress net_get_ip();

/**
 * Get the WiFi SSID.
 * 
 * @return SSID string (e.g., "ELEGOO-1234ABCD")
 */
String net_get_ssid();

/**
 * Get the short MAC portion used in SSID.
 * 
 * @return MAC string (e.g., "1234ABCD")
 */
String net_get_mac_suffix();

/**
 * Get RSSI (signal strength).
 * Note: In AP mode, this returns TX power, not RSSI.
 * 
 * @return Signal strength in dBm
 */
int8_t net_get_rssi();

/**
 * Get number of connected stations.
 * 
 * @return Number of WiFi clients
 */
uint8_t net_get_station_count();

/**
 * Get network statistics.
 * 
 * @return NetStats structure
 */
NetStats net_get_stats();

/**
 * Get last error message.
 * 
 * @return Error message or "OK"
 */
const char* net_last_error();

#endif // NET_SERVICE_H

