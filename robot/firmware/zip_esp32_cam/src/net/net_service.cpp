/**
 * Network Service - Implementation
 * 
 * WiFi Access Point with ELEGOO MAC-based SSID.
 * Non-blocking initialization with status tracking.
 */

#include "net_service.h"
#include <Arduino.h>
#include <WiFi.h>
#include "esp_task_wdt.h"
#include "config/build_config.h"
#include "config/runtime_config.h"

// ============================================================================
// Module State
// ============================================================================
static NetStatus s_status = NetStatus::DISCONNECTED;
static String s_ssid = "";
static String s_mac_suffix = "";
static unsigned long s_start_time = 0;
static const char* s_error_message = "Not initialized";

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
// Network Initialization
// ============================================================================
bool net_init() {
    LOG_I("NET", "Initializing WiFi Access Point...");
    s_status = NetStatus::INITIALIZING;
    
    // Generate SSID
    generate_ssid();
    LOG_I("NET", "SSID: %s", s_ssid.c_str());
    
    // Set WiFi mode to AP
    LOG_V("NET", "Setting WiFi mode to AP");
    esp_task_wdt_reset();
    WiFi.mode(WIFI_AP);
    
    // Set TX power
    LOG_V("NET", "Setting TX power to %d dBm", CONFIG_WIFI_TX_POWER);
    esp_task_wdt_reset();
    WiFi.setTxPower((wifi_power_t)CONFIG_WIFI_TX_POWER);
    
    // Start Access Point (empty password = open network)
    LOG_V("NET", "Starting softAP on channel %d", CONFIG_WIFI_CHANNEL);
    esp_task_wdt_reset();
    bool result = WiFi.softAP(s_ssid.c_str(), "", CONFIG_WIFI_CHANNEL);
    
    if (!result) {
        s_status = NetStatus::ERROR;
        s_error_message = "softAP failed";
        LOG_E("NET", "Failed to start Access Point");
        return false;
    }
    
    // Wait for AP to be ready
    LOG_V("NET", "Waiting for AP to stabilize...");
    for (int i = 0; i < 10; i++) {
        delay(100);
        esp_task_wdt_reset();
    }
    
    s_status = NetStatus::AP_ACTIVE;
    s_start_time = millis();
    s_error_message = "OK";
    
    LOG_I("NET", "AP IP: %s", WiFi.softAPIP().toString().c_str());
    LOG_I("NET", "WiFi Access Point ready");
    
    // Print connection instructions
    Serial.println(":----------------------------:");
    Serial.printf("wifi_name:%s\n", s_ssid.c_str());
    Serial.println(":----------------------------:");
    Serial.printf("Camera Ready! Use 'http://%s' to connect\n", 
                  WiFi.softAPIP().toString().c_str());
    
    return true;
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

