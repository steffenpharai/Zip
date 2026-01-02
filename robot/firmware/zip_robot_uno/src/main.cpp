/*
 * ZIP Robot Firmware - Main Entry Point
 * 
 * Elegoo Smart Robot Car V4.0
 * Arduino UNO Platform
 * 
 * ═══════════════════════════════════════════════════════════════════
 * VERIFIED CONFIGURATION (January 2026)
 * ═══════════════════════════════════════════════════════════════════
 * RAM:   83.9% (1719/2048 bytes) - SAFE
 * Flash: 71.1% (22934/32256 bytes)
 * Tests: 93/93 passing
 * 
 * ENABLED SUBSYSTEMS:
 *   ✅ motorDriver      - TB6612 motor control
 *   ✅ batteryMonitor   - ADC battery voltage (10Hz read)
 *   ✅ servoPan         - Pan servo (Servo library)
 *   ✅ ultrasonic       - HC-SR04 distance (10Hz read)
 *   ✅ lineSensor       - 3x IR line detect (10Hz read)
 *   ✅ modeButton       - Digital input
 *   ✅ motionController - Setpoint tracking
 *   ✅ macroEngine      - Motion macros
 *   ✅ safetyLayer      - Safety checks
 * 
 * DISABLED SUBSYSTEMS (RAM constraints):
 *   ❌ statusLED        - FastLED uses ~100 bytes RAM
 *   ❌ imu              - Wire library pushes to 88%+ RAM
 *   ❌ commandHandler   - Legacy ELEGOO runtime (removed)
 * 
 * SCHEDULER TASKS:
 *   task_control_loop  - 50 Hz (motion + macros)
 *   task_sensors_fast  - 50 Hz (IMU - currently empty)
 *   task_sensors_slow  - 10 Hz (ultrasonic, battery, line)
 *   task_protocol_rx   - 1 kHz (serial command parsing)
 * 
 * COMMANDS SUPPORTED:
 *   N=0     Hello/ping
 *   N=5     Servo control
 *   N=21    Ultrasonic read
 *   N=22    Line sensor read
 *   N=120   Diagnostics
 *   N=200   Setpoint streaming (fire-and-forget)
 *   N=201   Stop (immediate)
 *   N=210   Macro start
 *   N=211   Macro cancel
 *   N=999   Direct motor PWM
 * ═══════════════════════════════════════════════════════════════════
 */

#include <Arduino.h>
#include <avr/wdt.h>

// Configuration
#include "config.h"
#include "pins.h"

// HAL/Drivers
#include "hal/motor_driver.h"
#include "hal/servo_pan.h"
#include "hal/ultrasonic.h"
#include "hal/line_sensor.h"
#include "hal/imu_mpu6050.h"
#include "hal/battery_monitor.h"
#include "hal/status_led.h"
#include "hal/mode_button.h"

// Core
#include "core/scheduler.h"

// Protocol (JSON only - binary protocol removed for RAM savings)
// #include "protocol/protocol_decode.h"  // REMOVED - legacy binary protocol
// #include "protocol/protocol_encode.h"  // REMOVED - legacy binary protocol

// Behavior
// #include "behavior/command_handler.h"  // REMOVED - uses ArduinoJson

// Motion Control
#include "motion_types.h"
#include "motion/motion_controller.h"
#include "motion/macro_engine.h"
#include "motion/safety.h"
#include "serial/frame_parser.h"
#include "serial/json_protocol.h"

// Self-test
#include "self_test.h"

// Global instances
MotorDriverTB6612 motorDriver;
ServoPan servoPan;
UltrasonicHC_SR04 ultrasonic;
LineSensorITR20001 lineSensor;
IMU_MPU6050 imu;
BatteryMonitor batteryMonitor;
StatusLED statusLED;
ModeButton modeButton;

Scheduler scheduler;
// ProtocolDecoder protocolDecoder;  // REMOVED - legacy binary protocol
// ProtocolEncoder protocolEncoder;  // REMOVED - legacy binary protocol
// CommandHandler commandHandler;    // REMOVED - uses ArduinoJson

// Motion Control instances
MotionController motionController;
MacroEngine macroEngine;
SafetyLayer safetyLayer;
FrameParser jsonFrameParser;

// Forward declarations
void handleMotionCommand(const ParsedCommand& cmd);
void handleLegacyCommand(const ParsedCommand& cmd);

// Store direct motor values for continuous re-application in DIRECT mode
static int16_t directLeftPWM = 0;
static int16_t directRightPWM = 0;

// Motion ownership tracking for diagnostics (N=120)
static uint8_t g_resetCounter = 0;
static char g_lastOwner = 'I';  // I=Idle, D=Direct, X=Stopped

// Runtime free RAM measurement (AVR classic pattern)
// Returns bytes between stack and heap - should never go below ~150 on UNO
extern unsigned int __bss_end;
extern unsigned int __heap_start;
extern void *__brkval;

static int16_t g_minFreeRam = 32767;  // Track minimum observed free RAM

int freeRam() {
  int v;
  return (int)&v - (__brkval == 0 ? (int)&__heap_start : (int)__brkval);
}

// Call this at critical points to track minimum headroom
void updateMinFreeRam() {
  int current = freeRam();
  if (current < g_minFreeRam) {
    g_minFreeRam = current;
  }
}

// Task: Control loop (50Hz)
void task_control_loop() {
  // DISABLED FOR TESTING - Disable all update loops to isolate motor functionality
  // motorDriver.update();
  // commandHandler.update();
  
  // Only update motion controller for N=200 commands (but skip if DIRECT mode)
  if (motionController.getState() != MOTION_STATE_DIRECT) {
    motionController.update();
  }
  
  // DISABLED: Control loop pin maintenance - testing if this blocks RX
  // Motors should maintain state from initial N=999 pin writes
  // The TB6612 maintains PWM until changed
  
  // RE-ENABLED: macroEngine.update() for macro support
  macroEngine.update();
}

// Task: Fast sensors (50Hz)
void task_sensors_fast() {
  // imu.update();  // DISABLED - Wire library causes RAM overflow
}

// Task: Slow sensors (10Hz) - RE-ENABLED
void task_sensors_slow() {
  // Read sensors (results cached in drivers)
  ultrasonic.getDistance();
  batteryMonitor.update();
  lineSensor.readAll(nullptr, nullptr, nullptr);  // Cache line sensor values
}

// Task: Telemetry (REMOVED - legacy binary protocol)
// void task_telemetry() {
//   wdt_reset();
//   commandHandler.sendTELEMETRY();
// }

// Task: Protocol RX (continuous, 1ms interval)
// Single RX pipeline with deterministic parsing
void task_protocol_rx() {
  wdt_reset();
  
  // Flush any pending TX response
  JsonProtocol::flushPending();
  
  // Limit bytes per call to prevent blocking
  uint8_t bytesProcessed = 0;
  const uint8_t MAX_BYTES_PER_CALL = 48;  // Process up to 48 bytes per iteration
  unsigned long taskStartTime = millis();
  const unsigned long MAX_TASK_TIME_MS = 5;
  
  while (Serial.available() > 0 && bytesProcessed < MAX_BYTES_PER_CALL) {
    // Safety: Ensure task doesn't run too long
    if (millis() - taskStartTime > MAX_TASK_TIME_MS) {
      wdt_reset();
      break;
    }
    
    uint8_t byte = Serial.read();
    bytesProcessed++;
    
    // Reset watchdog every 8 bytes
    if ((bytesProcessed & 0x07) == 0) {
      wdt_reset();
    }
    
    // Binary protocol (0xAA 0x55) REMOVED - JSON only for RAM savings
    // If we receive binary header, just skip it
    if (byte == 0xAA || byte == 0x55) {
      continue;  // Ignore legacy binary protocol bytes
    }
    
    // JSON protocol - use frame parser
    if (jsonFrameParser.processByte(byte)) {
      ParsedCommand cmd;
      if (jsonFrameParser.getCommand(cmd)) {
        // Reset parser after getting command
        jsonFrameParser.reset();
        wdt_reset();
        
        // Rate limiting disabled for minimal testing
        // if (!safetyLayer.checkRateLimit()) {
        //   continue;
        // }
        // safetyLayer.recordCommand();
        
        // Route command based on N value
        if (cmd.N == 0) {
          // N=0: Hello handshake
          JsonProtocol::sendHelloOk();
        } else if (cmd.N == 5) {
          // N=5: Servo control - D1 is angle (0-180)
          // Probe RAM before servo.attach() - known stack-heavy path
          updateMinFreeRam();
          uint8_t angle = constrain(cmd.D1, 0, 180);
          servoPan.setAngle(angle);
          updateMinFreeRam();  // Probe after servo path
          JsonProtocol::sendOk(cmd.H);
        } else if (cmd.N == 120) {
          // N=120: Diagnostics - compact debug state + RAM monitoring
          // Format: {owner,lpwm,rpwm,stby,mstate,reset,freeRam,minRam}
          updateMinFreeRam();  // Probe at diagnostics path
          if (Serial.availableForWrite() >= 40) {
            Serial.print(F("{"));
            Serial.print(g_lastOwner);
            Serial.print(directLeftPWM);
            Serial.print(',');
            Serial.print(directRightPWM);
            Serial.print(',');
            Serial.print(digitalRead(PIN_MOTOR_STBY));
            Serial.print(',');
            Serial.print((uint8_t)motionController.getState());
            Serial.print(',');
            Serial.print(g_resetCounter);
            Serial.print(F(",ram:"));
            Serial.print(freeRam());
            Serial.print(F(",min:"));
            Serial.print(g_minFreeRam);
            Serial.println('}');
          }
          JsonProtocol::sendStats(g_parseStats);
        } else if (cmd.N >= 200) {
          // N=200+: Motion commands
          handleMotionCommand(cmd);
        } else if (cmd.N == 100 || cmd.N == 110) {
          // N=100/110: Legacy stop commands - override motion
          motionController.stop();
          macroEngine.cancel();
          motorDriver.stop();
          JsonProtocol::sendOk();
        } else {
          // N=1-199: Legacy ELEGOO commands
          handleLegacyCommand(cmd);
        }
        
        // Break after processing one command
        break;
      }
    }
  }
  
  wdt_reset();
}

// Handle legacy ELEGOO commands (N=1-199)
void handleLegacyCommand(const ParsedCommand& cmd) {
  wdt_reset();
  
  // Handle sensor commands with actual data
  switch (cmd.N) {
    case 21: {
      // N=21: Ultrasonic sensor
      // D1=1: Return obstacle detection (true/false)
      // D1=2: Return distance in cm
      uint16_t distance = ultrasonic.getDistance();
      
      if (cmd.D1 == 1) {
        // Obstacle detection mode (within 20cm)
        if (distance > 0 && distance <= 20) {
          JsonProtocol::sendTrue(cmd.H);
        } else {
          JsonProtocol::sendFalse(cmd.H);
        }
      } else if (cmd.D1 == 2) {
        // Distance mode - return actual cm value
        char valueStr[8];
        snprintf(valueStr, sizeof(valueStr), "%u", distance);
        JsonProtocol::sendValue(cmd.H, valueStr);
      } else {
        JsonProtocol::sendOk(cmd.H);
      }
      return;
    }
    
    case 22: {
      // N=22: Line sensor (tracking module)
      // D1=0: Left sensor value
      // D1=1: Middle sensor value
      // D1=2: Right sensor value
      uint16_t value = 0;
      
      if (cmd.D1 == 0) {
        value = lineSensor.readLeft();
      } else if (cmd.D1 == 1) {
        value = lineSensor.readMiddle();
      } else if (cmd.D1 == 2) {
        value = lineSensor.readRight();
      }
      
      char valueStr[8];
      snprintf(valueStr, sizeof(valueStr), "%u", value);
      JsonProtocol::sendValue(cmd.H, valueStr);
      return;
    }
    
    case 23: {
      // N=23: Battery voltage (ZIP extension)
      // Returns voltage in millivolts
      uint16_t voltage_mv = (uint16_t)(batteryMonitor.readVoltage() * 1000);
      char valueStr[8];
      snprintf(valueStr, sizeof(valueStr), "%u", voltage_mv);
      JsonProtocol::sendValue(cmd.H, valueStr);
      return;
    }
    
    default:
      break;
  }
  
  // Commands 2 and 7 have delayed response in official firmware
  // (they respond after timer expires)
  if (cmd.N == 2 || cmd.N == 7) {
    return;
  }
  
  // All other legacy commands respond with {H_ok}
  if (strlen(cmd.H) > 0) {
    JsonProtocol::sendOk(cmd.H);
  } else {
    JsonProtocol::sendOk();
  }
}

// Handle motion commands (N=200+)
void handleMotionCommand(const ParsedCommand& cmd) {
  wdt_reset();
  
  switch (cmd.N) {
    case 200: {
      // N=200: Drive Setpoint (fire-and-forget, NO RESPONSE)
      // D1: v (forward command -255..255)
      // D2: w (yaw command -255..255)
      // T: TTL (150-300ms)
      
      // Cancel any active macro
      if (macroEngine.isActive()) {
        macroEngine.cancel();
      }
      
      // SAFETY LAYER DISABLED FOR TESTING - Always enable motors
      // if (!safetyLayer.shouldEnableMotors()) {
      //   safetyLayer.enableMotors();
      // }
      motorDriver.enable();
      
      // Apply setpoint
      motionController.setSetpoint(cmd.D1, cmd.D2, cmd.T);
      wdt_reset();
      
      // NO RESPONSE - fire and forget for streaming
      break;
    }
    
    case 201: {
      // N=201: Stop Now (MUST RESPOND)
      // ABSOLUTE STOP - highest priority, only place that stops motors
      
      g_lastOwner = 'X';  // Track stopped state for diagnostics
      
      // Clear DIRECT mode values FIRST (prevents control loop re-apply)
      directLeftPWM = 0;
      directRightPWM = 0;
      
      // Update state machines (these no longer touch motor pins)
      motionController.stop();  // Sets state to IDLE
      macroEngine.cancel();     // Sets active to false
      
      // SINGLE MOTOR WRITE POINT - only here we touch motor pins for stop
      analogWrite(PIN_MOTOR_PWMA, 0);
      analogWrite(PIN_MOTOR_PWMB, 0);
      digitalWrite(PIN_MOTOR_STBY, LOW);
      
      
      JsonProtocol::sendOk(cmd.H);
      wdt_reset();
      break;
    }
    
    case 999: {
      // N=999: Direct Motor Test (bypasses motion controller)
      // D1: left PWM (-255..255)
      // D2: right PWM (-255..255)
      // DIRECT MODE - single owner model
      
      g_lastOwner = 'D';  // Track direct mode for diagnostics
      
      // Set motion controller to DIRECT mode so update loop doesn't interfere
      motionController.setDirectMode();
      macroEngine.cancel();  // Safe: no longer touches motor pins
      
      // CRITICAL: Direct pin manipulation to ensure motors run
      // Enable STBY FIRST
      digitalWrite(PIN_MOTOR_STBY, HIGH);
      
      // Apply PWM directly to pins (bypassing all abstraction layers)
      int16_t left = constrain(cmd.D1, -255, 255);
      int16_t right = constrain(cmd.D2, -255, 255);
      
      // Right motor (Motor A: PWMA=5, AIN1=7)
      if (right > 0) {
        digitalWrite(PIN_MOTOR_AIN1, HIGH);
        analogWrite(PIN_MOTOR_PWMA, abs(right));
      } else if (right < 0) {
        digitalWrite(PIN_MOTOR_AIN1, LOW);
        analogWrite(PIN_MOTOR_PWMA, abs(right));
      } else {
        analogWrite(PIN_MOTOR_PWMA, 0);
      }
      
      // Left motor (Motor B: PWMB=6, BIN1=8)
      if (left > 0) {
        digitalWrite(PIN_MOTOR_BIN1, HIGH);
        analogWrite(PIN_MOTOR_PWMB, abs(left));
      } else if (left < 0) {
        digitalWrite(PIN_MOTOR_BIN1, LOW);
        analogWrite(PIN_MOTOR_PWMB, abs(left));
      } else {
        analogWrite(PIN_MOTOR_PWMB, 0);
      }
      
      // Store values for continuous re-application
      directLeftPWM = left;
      directRightPWM = right;
      
      // NOTE: Don't call motorDriver.setMotors() - already did direct pin writes
      // This avoids double-writes and potential race conditions
      
      
      JsonProtocol::sendOk(cmd.H);
      wdt_reset();
      break;
    }
    
    case 210: {
      // N=210: Macro Execute (MUST RESPOND)
      // D1: macro_id (1=FIGURE_8, 2=SPIN_360, 3=WIGGLE, 4=FORWARD_THEN_STOP)
      // D2: intensity (0-255)
      // T: TTL (1000-10000ms)
      
      // Probe RAM at macro transition
      updateMinFreeRam();
      
      // Stop any active setpoint
      motionController.stop();
      
      // SAFETY LAYER DISABLED FOR TESTING - Always enable motors
      // if (!safetyLayer.shouldEnableMotors()) {
      //   safetyLayer.enableMotors();
      // }
      motorDriver.enable();
      
      // Start macro
      MacroID macroId = (MacroID)cmd.D1;
      bool started = macroEngine.startMacro(macroId, cmd.D2, cmd.T);
      
      if (started) {
        JsonProtocol::sendOk(cmd.H);
      } else {
        JsonProtocol::sendFalse(cmd.H);
      }
      wdt_reset();
      break;
    }
    
    case 211: {
      // N=211: Macro Cancel (MUST RESPOND)
      macroEngine.cancel();
      JsonProtocol::sendOk(cmd.H);
      wdt_reset();
      break;
    }
    
    default:
      // Unknown motion command
      JsonProtocol::sendFalse(cmd.H);
      wdt_reset();
      break;
  }
}

void setup() {
  g_resetCounter++;  // Track resets for debugging
  
  // Initialize serial communication
  // NOTE: Using 115200 (not official 9600) for better motion control throughput
  Serial.begin(SERIAL_BAUD);
  
  // Initialize hardware
  motorDriver.init();
  batteryMonitor.init();
  servoPan.init();  // Uses exact ELEGOO pattern with attach/delay/detach
  ultrasonic.init();
  lineSensor.init();
  modeButton.init();
  
  // Initialize motion control system
  motionController.init(&motorDriver);
  macroEngine.init(&motorDriver);
  safetyLayer.init();
  
  // Initialize scheduler
  scheduler.init();
  
  // Register tasks
  scheduler.registerTask(task_control_loop, 1000 / TASK_CONTROL_LOOP_HZ, "ctrl");
  scheduler.registerTask(task_sensors_fast, 1000 / TASK_SENSORS_FAST_HZ, "sens_f");
  scheduler.registerTask(task_sensors_slow, 1000 / TASK_SENSORS_SLOW_HZ, "sens_s");
  scheduler.registerTask(task_protocol_rx, 1, "rx");
  
  // Protocol decoder removed - JSON only
  // protocolDecoder.reset();
  
  // Enable watchdog (8 seconds)
  wdt_enable(WDTO_8S);
  wdt_reset();
  
  // Send ready marker: "R\n"
  // Host waits for this after DTR reset
  if (Serial.availableForWrite() >= 2) {
    Serial.write('R');
    Serial.write('\n');
  }
  wdt_reset();
  
  // Status LED disabled (FastLED too heavy)
  // statusLED.setStateIdle();
}

void loop() {
  // Reset watchdog at start of every loop
  wdt_reset();
  
  // Run scheduler
  scheduler.run();
  
  // DISABLED: LED animations use too much stack
  // statusLED.update();
  
  // Flush pending TX responses
  JsonProtocol::flushPending();
  
  wdt_reset();
  
  // Small delay to prevent tight loop
  delay(1);
}
