/*
 * Configuration Constants
 * 
 * System-wide configuration for ZIP Robot Firmware
 * 
 * IMPORTANT: Arduino UNO has only 2KB RAM!
 * Current usage target: < 85% (< 1700 bytes)
 */

#ifndef CONFIG_H
#define CONFIG_H

// Serial Communication
// Note: Official ELEGOO uses 9600, we use 115200 for better performance
#define SERIAL_BAUD 115200

// RX Ring Buffer Size (must be power of 2) - minimal for UNO
// 32 bytes is minimum for basic JSON commands
#define RX_RING_BUFFER_SIZE 32

// JSON parsing limits - minimal for UNO
#define JSON_MAX_LINE_LENGTH 64   // Max JSON command length before resync
#define JSON_DOC_SIZE 64          // StaticJsonDocument size (minimal)

// Protocol Configuration (binary protocol) - minimal for UNO
#define PROTOCOL_FRAME_HEADER_0 0xAA
#define PROTOCOL_FRAME_HEADER_1 0x55
#define PROTOCOL_MAX_PAYLOAD_SIZE 24  // Minimal for UNO RAM constraints
#define PROTOCOL_MAX_FRAME_SIZE (4 + PROTOCOL_MAX_PAYLOAD_SIZE + 2)

// Task Frequencies (Hz)
#define TASK_CONTROL_LOOP_HZ 50  // Motion controller updates at 50Hz (20ms cadence)
#define TASK_SENSORS_FAST_HZ 50
#define TASK_SENSORS_SLOW_HZ 10
#define TASK_TELEMETRY_HZ 0  // DISABLED - telemetry flooding serial port
#define TASK_PROTOCOL_RX_CONTINUOUS true

// Motion Control Configuration
#define MOTION_CONTROLLER_UPDATE_MS 20  // 50Hz update rate
#define MOTION_SETPOINT_TTL_MIN_MS 150
#define MOTION_SETPOINT_TTL_MAX_MS 300
#define MOTION_MACRO_TTL_MIN_MS 1000
#define MOTION_MACRO_TTL_MAX_MS 10000
#define MOTION_RATE_LIMIT_HZ 50  // Max commands per second

// Motor Control
#define MOTOR_RAMP_RATE_MAX 5        // Maximum PWM change per control loop iteration
#define MOTOR_PWM_DEADBAND 10        // Minimum PWM to overcome friction
#define MOTOR_BRAKE_MODE true        // Use brake mode (vs coast)

// Sensor Rates
#define ULTRASONIC_MAX_RATE_HZ 10    // Maximum ultrasonic reads per second
#define IMU_SAMPLE_RATE_HZ 50        // IMU sampling rate

// Safety
#define WATCHDOG_TIMEOUT_MS 4000     // Watchdog timeout (4 seconds) - increased to prevent reset loop
#define COMMS_TIMEOUT_MS 1000         // Communication timeout (stop motors if no command received)
#define LOW_BATTERY_HYSTERESIS_V 0.2 // Hysteresis for low battery detection

// JSON parsing (see JSON_DOC_SIZE above for StaticJsonDocument size)
// JSON_BUFFER_SIZE removed - using ring buffer instead

// Firmware Version
#define FW_VERSION_MAJOR 1
#define FW_VERSION_MINOR 0
#define FW_VERSION_PATCH 0
#define FW_VERSION_STRING "1.0.0"

// Capability Flags
#define CAP_MOTOR_DRIVER_TB6612 (1 << 0)
#define CAP_MOTOR_DRIVER_DRV8835 (1 << 1)
#define CAP_IMU_MPU6050 (1 << 2)
#define CAP_IMU_QMI8658C (1 << 3)
#define CAP_ULTRASONIC (1 << 4)
#define CAP_LINE_TRACKING (1 << 5)
#define CAP_SERVO (1 << 6)
#define CAP_RGB_LED (1 << 7)

// Default Capabilities (TB6612 + MPU6050 + all sensors)
#define DEFAULT_CAPABILITIES (CAP_MOTOR_DRIVER_TB6612 | CAP_IMU_MPU6050 | CAP_ULTRASONIC | CAP_LINE_TRACKING | CAP_SERVO | CAP_RGB_LED)

// Self-Test Configuration
#define SELF_TEST_MOTOR_PWM 120
#define SELF_TEST_DURATION_MS 500
#define SELF_TEST_ENABLED false  // Disabled to test communication

// LED Configuration
#define LED_BRIGHTNESS_DEFAULT 20
#define LED_BRIGHTNESS_MAX 255

#endif // CONFIG_H

