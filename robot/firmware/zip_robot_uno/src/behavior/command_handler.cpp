/*
 * Command Handler Implementation
 */

#include "behavior/command_handler.h"
#include "hal/motor_driver.h"
#include "hal/servo_pan.h"
#include "hal/status_led.h"
#include "hal/ultrasonic.h"
#include "hal/line_sensor.h"
#include "hal/imu_mpu6050.h"
#include "hal/battery_monitor.h"
#include "protocol/protocol_encode.h"
#include <ArduinoJson.h>

// Global instances (will be initialized in main)
extern MotorDriverTB6612 motorDriver;
extern ServoPan servoPan;
extern StatusLED statusLED;
extern UltrasonicHC_SR04 ultrasonic;
extern LineSensorITR20001 lineSensor;
extern IMU_MPU6050 imu;
extern BatteryMonitor batteryMonitor;
extern ProtocolEncoder protocolEncoder;

CommandHandler::CommandHandler()
  : motorDriver(nullptr)
  , servoPan(nullptr)
  , statusLED(nullptr)
  , currentMode(MODE_STANDBY)
  , eStopActive(false)
  , lastCommandTime(0)
{
}

void CommandHandler::init(MotorDriverTB6612* motor, ServoPan* servo, StatusLED* led) {
  motorDriver = motor;
  servoPan = servo;
  statusLED = led;
  currentMode = MODE_STANDBY;
  eStopActive = false;
  lastCommandTime = millis();
}

void CommandHandler::handleMessage(const DecodedMessage& msg) {
  // Reduced debug output to prevent serial buffer overflow
  // Serial.print(F("[CMD] handleMessage called: valid="));
  // Serial.print(msg.valid);
  // Serial.print(F(", type=0x"));
  // Serial.print(msg.type, HEX);
  // Serial.print(F(", seq="));
  // Serial.print(msg.seq);
  // Serial.print(F(", payloadLen="));
  // Serial.println(msg.payloadLen);
  
  if (!msg.valid) {
    // Serial.println(F("[CMD] Message invalid, ignoring"));
    return;
  }
  
  lastCommandTime = millis();
  
  // Debug: log received command (minimal to avoid flooding)
  // Only log non-telemetry commands to reduce serial traffic
  // if (msg.type < 0x80) {  // Only log commands (0x01-0x08), not responses
  //   Serial.print(F("CMD:0x"));
  //   Serial.print(msg.type, HEX);
  //   Serial.print(F(",seq="));
  //   Serial.println(msg.seq);
  // }
  
  // Check for emergency stop
  if (eStopActive && msg.type != MSG_TYPE_E_STOP) {
    return;  // Ignore commands when E-stop active
  }
  
  switch (msg.type) {
    case MSG_TYPE_HELLO:
      handleHello(msg);
      break;
    case MSG_TYPE_SET_MODE:
      handleSetMode(msg);
      break;
    case MSG_TYPE_DRIVE_TWIST:
      handleDriveTwist(msg);
      break;
    case MSG_TYPE_DRIVE_TANK:
      handleDriveTank(msg);
      break;
    case MSG_TYPE_SERVO:
      handleServo(msg);
      break;
    case MSG_TYPE_LED:
      handleLED(msg);
      break;
    case MSG_TYPE_E_STOP:
      handleEStop(msg);
      break;
    case MSG_TYPE_CONFIG_SET:
      handleConfigSet(msg);
      break;
    default:
      sendACK(msg.seq, false, 1);  // Unknown command
      break;
  }
}

void CommandHandler::handleHello(const DecodedMessage& msg) {
  sendINFO();
  sendACK(msg.seq, true);
}

void CommandHandler::handleSetMode(const DecodedMessage& msg) {
  // Parse JSON payload: {"mode": 1}
  StaticJsonDocument<64> doc;
  DeserializationError error = deserializeJson(doc, msg.payload, msg.payloadLen);
  
  if (error) {
    sendACK(msg.seq, false, 5);  // JSON parse error
    return;
  }
  
  uint8_t mode = doc["mode"] | 0;
  // Serial.print(F("[SET_MODE] Setting mode to: "));
  // Serial.print(mode);
  // Serial.print(F(" (current was: "));
  // Serial.print((uint8_t)currentMode);
  // Serial.println(F(")"));
  
  if (mode <= MODE_FOLLOW) {
    RobotMode newMode = (RobotMode)mode;
    currentMode = newMode;
    eStopActive = false;  // Clear E-stop on mode change
    
    // Include mode in ACK for SET_MODE success
    uint8_t buffer[64];
    StaticJsonDocument<64> ackDoc;
    ackDoc["ok"] = true;
    ackDoc["mode"] = (uint8_t)currentMode;  // Include current mode in response
    uint8_t payload[64];
    uint8_t payloadLen = serializeJson(ackDoc, payload, sizeof(payload));
    uint8_t frameLen = protocolEncoder.encode(MSG_TYPE_ACK, msg.seq, payload, payloadLen, buffer, sizeof(buffer));
    if (frameLen > 0) {
      Serial.write(buffer, frameLen);
      Serial.flush();
    }
  } else {
    Serial.print(F("[SET_MODE] Invalid mode: "));
    Serial.println(mode);
    sendACK(msg.seq, false, 3);  // Invalid mode
  }
}

void CommandHandler::handleDriveTwist(const DecodedMessage& msg) {
  if (currentMode != MODE_MANUAL) {
    sendACK(msg.seq, false, 4);  // Wrong mode
    return;
  }
  
  // Parse JSON payload: {"v":100,"omega":50}
  StaticJsonDocument<64> doc;  // Reduced from 128
  DeserializationError error = deserializeJson(doc, msg.payload, msg.payloadLen);
  
  if (error) {
    sendACK(msg.seq, false, 5);  // JSON parse error
    return;
  }
  
  int16_t v = doc["v"] | 0;
  int16_t omega = doc["omega"] | 0;
  
  motorDriver->twistDrive(v, omega);
  sendACK(msg.seq, true);
}

void CommandHandler::handleDriveTank(const DecodedMessage& msg) {
  if (currentMode != MODE_MANUAL) {
    sendACK(msg.seq, false, 4);
    return;
  }
  
  // Parse JSON: {"left":100,"right":100}
  StaticJsonDocument<64> doc;  // Reduced from 128
  DeserializationError error = deserializeJson(doc, msg.payload, msg.payloadLen);
  
  if (error) {
    sendACK(msg.seq, false, 5);
    return;
  }
  
  int16_t left = doc["left"] | 0;
  int16_t right = doc["right"] | 0;
  
  motorDriver->tankDrive(left, right);
  sendACK(msg.seq, true);
}

void CommandHandler::handleServo(const DecodedMessage& msg) {
  // Parse JSON payload: {"angle": 90}
  StaticJsonDocument<64> doc;
  DeserializationError error = deserializeJson(doc, msg.payload, msg.payloadLen);
  
  if (error) {
    sendACK(msg.seq, false, 5);  // JSON parse error
    return;
  }
  
  uint8_t angle = doc["angle"] | 90;  // Default to 90 if not specified
  if (angle > 180) {
    sendACK(msg.seq, false, 2);  // Invalid angle
    return;
  }
  
  servoPan->setAngle(angle);
  sendACK(msg.seq, true);
}

void CommandHandler::handleLED(const DecodedMessage& msg) {
  // Parse JSON: {"r":255,"g":0,"b":0,"brightness":255}
  StaticJsonDocument<64> doc;  // Reduced from 128
  DeserializationError error = deserializeJson(doc, msg.payload, msg.payloadLen);
  
  if (error) {
    sendACK(msg.seq, false, 5);
    return;
  }
  
  uint8_t r = doc["r"] | 0;
  uint8_t g = doc["g"] | 0;
  uint8_t b = doc["b"] | 0;
  uint8_t brightness = doc["brightness"] | LED_BRIGHTNESS_DEFAULT;
  
  statusLED->setColor(r, g, b);
  statusLED->setBrightness(brightness);
  sendACK(msg.seq, true);
}

void CommandHandler::handleEStop(const DecodedMessage& msg) {
  emergencyStop();
  sendACK(msg.seq, true);
}

void CommandHandler::handleConfigSet(const DecodedMessage& msg) {
  // Placeholder for configuration commands
  sendACK(msg.seq, true);
}

void CommandHandler::emergencyStop() {
  eStopActive = true;
  motorDriver->brake();
  statusLED->setStateError();
}

void CommandHandler::update() {
  // Check for communication timeout
  // DISABLED FOR TESTING - Don't stop motors on timeout
  // unsigned long now = millis();
  // if (now - lastCommandTime > COMMS_TIMEOUT_MS) {
  //   if (currentMode == MODE_MANUAL) {
  //     motorDriver->stop();  // Stop motors if no command received
  //   }
  // }
  
  // Mode-specific behaviors
  switch (currentMode) {
    case MODE_MANUAL:
      updateManualMode();
      break;
    case MODE_LINE_FOLLOW:
      updateLineFollowMode();
      break;
    case MODE_OBSTACLE_AVOID:
      updateObstacleAvoidMode();
      break;
    case MODE_FOLLOW:
      updateFollowMode();
      break;
    default:
      break;
  }
  
  // Check low battery (but don't override LED if it's a false positive)
  // TODO: Fix battery voltage calibration to prevent false low battery warnings
  // if (batteryMonitor.isCriticalBattery()) {
  //   emergencyStop();
  //   sendFAULT(1, "Low battery");
  // }
}

void CommandHandler::updateManualMode() {
  // DISABLED - motor control handled by main.cpp
}

void CommandHandler::updateLineFollowMode() {
  // DISABLED - legacy mode not implemented
}

void CommandHandler::updateObstacleAvoidMode() {
  // DISABLED - legacy mode not implemented
}

void CommandHandler::updateFollowMode() {
  // DISABLED - legacy mode not implemented
}

void CommandHandler::sendACK(uint8_t seq, bool ok, uint8_t errorCode) {
  uint8_t buffer[64];
  StaticJsonDocument<64> doc;
  doc["ok"] = ok;
  if (!ok) {
    doc["err"] = errorCode;
    // Include current mode in error responses for debugging
    doc["current_mode"] = (uint8_t)currentMode;
  }
  
  uint8_t payload[64];
  uint8_t payloadLen = serializeJson(doc, payload, sizeof(payload));
  
  uint8_t frameLen = protocolEncoder.encode(MSG_TYPE_ACK, seq, payload, payloadLen, buffer, sizeof(buffer));
  if (frameLen > 0) {
    Serial.write(buffer, frameLen);
    Serial.flush();  // Ensure ACK is sent immediately
  }
}

void CommandHandler::sendINFO() {
  uint8_t buffer[64];  // Reduced from 128
  StaticJsonDocument<64> doc;  // Reduced from 128
  doc["fw_version"] = FW_VERSION_STRING;
  doc["caps"] = DEFAULT_CAPABILITIES;
  doc["pinmap_hash"] = 0x12345678;  // Hash of pin configuration
  
  uint8_t payload[64];  // Reduced from 128
  uint8_t payloadLen = serializeJson(doc, payload, sizeof(payload));
  
  uint8_t seq = protocolEncoder.getNextSeq();
  uint8_t frameLen = protocolEncoder.encode(MSG_TYPE_INFO, seq, payload, payloadLen, buffer, sizeof(buffer));
  if (frameLen > 0) {
    Serial.write(buffer, frameLen);
    Serial.flush();
  }
}

void CommandHandler::sendTELEMETRY() {
  // DISABLED - telemetry consumes too much RAM
  // Only enable when needed for debugging
}

void CommandHandler::sendFAULT(uint8_t faultCode, const char* detail) {
  uint8_t buffer[64];  // Reduced from 128
  StaticJsonDocument<64> doc;  // Reduced from 128
  doc["fault_code"] = faultCode;
  doc["detail"] = detail;
  
  uint8_t payload[64];  // Reduced from 128
  uint8_t payloadLen = serializeJson(doc, payload, sizeof(payload));
  
  uint8_t seq = protocolEncoder.getNextSeq();
  uint8_t frameLen = protocolEncoder.encode(MSG_TYPE_FAULT, seq, payload, payloadLen, buffer, sizeof(buffer));
  if (frameLen > 0) {
    Serial.write(buffer, frameLen);
    Serial.flush();
  }
}

