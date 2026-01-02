/*
 * Pin Mapping - Elegoo Smart Robot Car V4.0
 * 
 * Matches official Elegoo V4.0 reference code
 */

#ifndef PINS_H
#define PINS_H

#include <Arduino.h>

// Motor Driver (TB6612FNG) - Official Elegoo V4.0 pin mapping
#define PIN_MOTOR_PWMA 5      // Motor A PWM (right motor)
#define PIN_MOTOR_PWMB 6      // Motor B PWM (left motor)
#define PIN_MOTOR_AIN1 7      // Motor A direction (right motor)
#define PIN_MOTOR_BIN1 8      // Motor B direction (left motor)
#define PIN_MOTOR_STBY 3      // Standby control (CRITICAL - must be HIGH to enable)

// Note: Official Elegoo code only uses AIN1/BIN1 (AIN2/BIN2 are tied to ground)
// Forward: AIN1/BIN1=HIGH, PWM=speed
// Reverse: AIN1/BIN1=LOW, PWM=speed
// Stop: PWM=0, STBY=LOW

// Servo Motors
#define PIN_SERVO_Z 10        // Camera gimbal Z-axis (horizontal pan)
#define PIN_SERVO_Y 11        // Camera gimbal Y-axis (vertical tilt)

// Ultrasonic Sensor (HC-SR04)
#define PIN_ULTRASONIC_TRIG 13
#define PIN_ULTRASONIC_ECHO 12

// Line Tracking Sensors (ITR20001)
#define PIN_LINE_L A2         // Left sensor (analog)
#define PIN_LINE_M A1         // Middle sensor (analog)
#define PIN_LINE_R A0         // Right sensor (analog)

// Battery Voltage Monitoring
#define PIN_VOLTAGE A3        // Voltage divider ADC input

// I2C Pins (for MPU6050 IMU)
#define PIN_I2C_SDA A4
#define PIN_I2C_SCL A5

// RGB LED (FastLED)
#define PIN_RGB_LED 4
#define NUM_LEDS 1

// IR Receiver
#define PIN_IR_RECEIVER 9

// Mode Button
#define PIN_MODE_BUTTON 2     // Hardware interrupt capable

// Motor Constants
#define MOTOR_PWM_MAX 255
#define MOTOR_PWM_MIN 0
#define MOTOR_DEADBAND 10     // Minimum PWM to overcome friction

// Servo Constants
#define SERVO_ANGLE_MIN 0
#define SERVO_ANGLE_MAX 180
#define SERVO_ANGLE_CENTER 90

// Ultrasonic Constants
#define ULTRASONIC_MAX_DISTANCE_CM 200
#define ULTRASONIC_MIN_DISTANCE_CM 2
#define ULTRASONIC_TIMEOUT_US 30000  // 30ms timeout

// Line Sensor Constants
#define LINE_SENSOR_ADC_MAX 1023
#define LINE_SENSOR_THRESHOLD_DEFAULT 512

// Battery Constants (Official ELEGOO: 2x 18650 Li-ion pack)
#define BATTERY_VOLTAGE_MIN 6.0   // Minimum safe voltage (V)
#define BATTERY_VOLTAGE_MAX 8.4   // Maximum voltage (V) - fully charged
#define BATTERY_VOLTAGE_LOW 7.0   // Low battery warning threshold (V) - matches official
#define BATTERY_ADC_SCALE 0.0049  // 5V / 1024 = 0.0049V per ADC step
// Official ELEGOO voltage divider: (10kΩ + 1.5kΩ) / 1.5kΩ = 7.67
#define BATTERY_DIVIDER_RATIO 7.67

#endif // PINS_H

