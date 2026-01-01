/*
 * Battery Monitor Implementation
 */

#include "hal/battery_monitor.h"

const float BatteryMonitor::LOW_THRESHOLD = BATTERY_VOLTAGE_LOW;
const float BatteryMonitor::LOW_THRESHOLD_HYST = BATTERY_VOLTAGE_LOW + LOW_BATTERY_HYSTERESIS_V;
const float BatteryMonitor::CRITICAL_THRESHOLD = BATTERY_VOLTAGE_MIN;

BatteryMonitor::BatteryMonitor()
  : voltage_mv(7400)  // Changed from 7.4 to 7400 (millivolts)
  , lowBattery(false)
  , criticalBattery(false)
{
}

void BatteryMonitor::init() {
  pinMode(PIN_VOLTAGE, INPUT);
  update();
}

float BatteryMonitor::readVoltage() {
  return voltage_mv / 1000.0;  // Convert from millivolts to volts
}

void BatteryMonitor::update() {
  // Read ADC
  uint16_t adc = analogRead(PIN_VOLTAGE);
  
  // Convert to voltage (in millivolts)
  float voltage = adcToVoltage(adc);
  voltage_mv = (uint16_t)(voltage * 1000.0);
  
  // Check thresholds with hysteresis (convert to millivolts for comparison)
  uint16_t critical_mv = (uint16_t)(CRITICAL_THRESHOLD * 1000);
  uint16_t low_mv = (uint16_t)(LOW_THRESHOLD * 1000);
  uint16_t low_hyst_mv = (uint16_t)(LOW_THRESHOLD_HYST * 1000);
  
  if (voltage_mv < critical_mv) {
    criticalBattery = true;
    lowBattery = true;
  } else if (voltage_mv > critical_mv + (uint16_t)(LOW_BATTERY_HYSTERESIS_V * 1000)) {
    criticalBattery = false;
  }
  
  if (voltage_mv < low_mv) {
    lowBattery = true;
  } else if (voltage_mv > low_hyst_mv) {
    lowBattery = false;
  }
}

float BatteryMonitor::adcToVoltage(uint16_t adc) {
  // ADC reading (0-1023) to voltage
  // Assuming voltage divider if present, otherwise direct reading
  float adcVoltage = adc * BATTERY_ADC_SCALE;
  
  // Apply divider ratio if used
  return adcVoltage * BATTERY_DIVIDER_RATIO;
}

