/*
 * Motor Driver HAL - TB6612FNG
 * 
 * Critical: STBY pin must be HIGH for motors to run
 */

#ifndef MOTOR_DRIVER_H
#define MOTOR_DRIVER_H

#include <Arduino.h>
#include "../pins.h"
#include "../config.h"

class MotorDriverTB6612 {
public:
  MotorDriverTB6612();
  
  // Initialization
  void init();
  
  // Motor control
  void setLeftMotor(int16_t pwm);  // -255 to 255 (negative = reverse)
  void setRightMotor(int16_t pwm);
  void setMotors(int16_t left, int16_t right);
  
  // Tank drive (direct PWM control)
  void tankDrive(int16_t leftPWM, int16_t rightPWM);
  
  // Twist drive (v, omega) - converts to left/right PWM
  void twistDrive(int16_t v, int16_t omega);  // v in mm/s, omega in mrad/s
  
  // Stop motors
  void stop();
  void brake();  // Active brake
  void coast();  // Coast to stop
  
  // Standby control (CRITICAL)
  void enable();   // Set STBY HIGH
  void disable();  // Set STBY LOW (motors off)
  
  // Ramping (slew-rate limiting)
  void setRampRate(uint8_t rate);  // Max PWM change per iteration
  void update();  // Call from control loop to apply ramping
  
  // Deadband compensation
  void setDeadband(uint8_t deadband);
  
  // Get current PWM values
  int16_t getLeftPWM() const { return currentLeftPWM; }
  int16_t getRightPWM() const { return currentRightPWM; }
  
  // Self-test
  bool test();  // Returns true if motors respond
  
private:
  // Target PWM values (set by commands)
  int16_t targetLeftPWM;
  int16_t targetRightPWM;
  
  // Current PWM values (after ramping)
  int16_t currentLeftPWM;
  int16_t currentRightPWM;
  
  // Ramping
  uint8_t rampRate;
  
  // Deadband
  uint8_t deadband;
  
  // Standby state
  bool standbyEnabled;
  
  // Internal methods
  void applyPWM(int16_t pwm, uint8_t pwmPin, uint8_t dirPin);
  int16_t applyDeadband(int16_t pwm);
  int16_t applyRamp(int16_t current, int16_t target);
};

#endif // MOTOR_DRIVER_H

