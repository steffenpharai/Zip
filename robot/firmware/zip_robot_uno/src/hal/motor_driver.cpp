/*
 * Motor Driver Implementation - TB6612FNG
 */

#include "hal/motor_driver.h"

MotorDriverTB6612::MotorDriverTB6612()
  : targetLeftPWM(0)
  , targetRightPWM(0)
  , currentLeftPWM(0)
  , currentRightPWM(0)
  , rampRate(MOTOR_RAMP_RATE_MAX)
  , deadband(MOTOR_PWM_DEADBAND)
  , standbyEnabled(false)
{
}

void MotorDriverTB6612::init() {
  // Configure pins (matching official Elegoo code)
  pinMode(PIN_MOTOR_PWMA, OUTPUT);
  pinMode(PIN_MOTOR_PWMB, OUTPUT);
  pinMode(PIN_MOTOR_AIN1, OUTPUT);
  pinMode(PIN_MOTOR_BIN1, OUTPUT);
  pinMode(PIN_MOTOR_STBY, OUTPUT);
  
  // Start with motors disabled (STBY LOW)
  disable();
  
  // Set initial PWM to 0
  analogWrite(PIN_MOTOR_PWMA, 0);
  analogWrite(PIN_MOTOR_PWMB, 0);
  
  standbyEnabled = false;
}

void MotorDriverTB6612::enable() {
  // Set STBY HIGH to enable motors (matching official Elegoo code)
  digitalWrite(PIN_MOTOR_STBY, HIGH);
  standbyEnabled = true;
}

void MotorDriverTB6612::disable() {
  digitalWrite(PIN_MOTOR_STBY, LOW);
  standbyEnabled = false;
  // Also stop PWM
  analogWrite(PIN_MOTOR_PWMA, 0);
  analogWrite(PIN_MOTOR_PWMB, 0);
  currentLeftPWM = 0;
  currentRightPWM = 0;
  targetLeftPWM = 0;
  targetRightPWM = 0;
}

void MotorDriverTB6612::setLeftMotor(int16_t pwm) {
  targetLeftPWM = constrain(pwm, -255, 255);
}

void MotorDriverTB6612::setRightMotor(int16_t pwm) {
  targetRightPWM = constrain(pwm, -255, 255);
}

void MotorDriverTB6612::setMotors(int16_t left, int16_t right) {
  // Official Elegoo pattern: Apply PWM immediately (matching DeviceDriverSet_Motor_control)
  // CRITICAL: Set STBY HIGH FIRST (before any direction/PWM changes)
  // This matches the official code which sets STBY HIGH at the start of DeviceDriverSet_Motor_control
  // Always enable motors when setting new PWM values (even if previously stopped)
  digitalWrite(PIN_MOTOR_STBY, HIGH);
  standbyEnabled = true;
  
  // Set targets for tracking
  targetLeftPWM = constrain(left, -255, 255);
  targetRightPWM = constrain(right, -255, 255);
  
  // Update current values immediately (no ramping for immediate response)
  currentLeftPWM = targetLeftPWM;
  currentRightPWM = targetRightPWM;
  
  // Apply PWM immediately (matching official Elegoo behavior)
  // Official mapping: Motor A (PWMA/AIN1) = RIGHT, Motor B (PWMB/BIN1) = LEFT
  applyPWM(right, PIN_MOTOR_PWMA, PIN_MOTOR_AIN1);  // Right motor (Motor A)
  applyPWM(left, PIN_MOTOR_PWMB, PIN_MOTOR_BIN1);   // Left motor (Motor B)
}

void MotorDriverTB6612::tankDrive(int16_t leftPWM, int16_t rightPWM) {
  setMotors(leftPWM, rightPWM);
}

void MotorDriverTB6612::twistDrive(int16_t v, int16_t omega) {
  // Convert twist (v, omega) to left/right PWM
  // Simple differential drive model:
  // left = v - omega * wheelbase/2
  // right = v + omega * wheelbase/2
  // For now, use simplified conversion (can be calibrated)
  
  // const int16_t wheelbase = 150;  // mm (approximate) - unused for now
  const int16_t maxPWM = 255;
  
  // Convert v (mm/s) and omega (mrad/s) to PWM
  // Scale factors (can be tuned)
  const float vScale = 0.5;      // mm/s to PWM
  const float omegaScale = 0.1;  // mrad/s to PWM
  
  int16_t vPWM = (int16_t)(v * vScale);
  int16_t omegaPWM = (int16_t)(omega * omegaScale);
  
  int16_t left = vPWM - omegaPWM;
  int16_t right = vPWM + omegaPWM;
  
  // Constrain to max PWM
  left = constrain(left, -maxPWM, maxPWM);
  right = constrain(right, -maxPWM, maxPWM);
  
  setMotors(left, right);
}

void MotorDriverTB6612::stop() {
  // Official Elegoo pattern: Set PWM to 0 and STBY LOW to stop motors
  // This matches DeviceDriverSet_Motor_control with direction_void
  analogWrite(PIN_MOTOR_PWMA, 0);
  analogWrite(PIN_MOTOR_PWMB, 0);
  digitalWrite(PIN_MOTOR_STBY, LOW);
  standbyEnabled = false;
  currentLeftPWM = 0;
  currentRightPWM = 0;
  targetLeftPWM = 0;
  targetRightPWM = 0;
}

void MotorDriverTB6612::brake() {
  stop();
  // For TB6612, setting both direction pins HIGH puts it in brake mode
  digitalWrite(PIN_MOTOR_AIN1, HIGH);
  digitalWrite(PIN_MOTOR_BIN1, HIGH);
  analogWrite(PIN_MOTOR_PWMA, 255);
  analogWrite(PIN_MOTOR_PWMB, 255);
  currentLeftPWM = 0;
  currentRightPWM = 0;
}

void MotorDriverTB6612::coast() {
  stop();
  // Disable standby to coast
  disable();
}

void MotorDriverTB6612::setRampRate(uint8_t rate) {
  rampRate = constrain(rate, 1, 255);
}

void MotorDriverTB6612::setDeadband(uint8_t db) {
  deadband = db;
}

void MotorDriverTB6612::update() {
  if (!standbyEnabled) {
    return;  // Motors disabled
  }
  
  // Official Elegoo pattern: Always ensure STBY is HIGH when motors are enabled
  // This prevents any interference from other code paths
  digitalWrite(PIN_MOTOR_STBY, HIGH);
  
  // Official Elegoo pattern: Apply ramping only if targets have changed
  // (For immediate commands via setMotors(), PWM is already applied)
  // This update() is mainly for legacy code paths that might still use ramping
  if (currentLeftPWM != targetLeftPWM || currentRightPWM != targetRightPWM) {
    currentLeftPWM = applyRamp(currentLeftPWM, targetLeftPWM);
    currentRightPWM = applyRamp(currentRightPWM, targetRightPWM);
    
    // Official Elegoo pattern: Apply PWM directly without deadband filtering
    // (Official code applies all PWM values directly - no filtering)
    // Apply to hardware
    // Official Elegoo mapping: Motor A (PWMA/AIN1) = RIGHT, Motor B (PWMB/BIN1) = LEFT
    applyPWM(currentRightPWM, PIN_MOTOR_PWMA, PIN_MOTOR_AIN1);  // Right motor (Motor A)
    applyPWM(currentLeftPWM, PIN_MOTOR_PWMB, PIN_MOTOR_BIN1);   // Left motor (Motor B)
  } else {
    // Even if values haven't changed, re-apply PWM to ensure it's maintained
    // This prevents any interference from other code paths
    applyPWM(currentRightPWM, PIN_MOTOR_PWMA, PIN_MOTOR_AIN1);  // Right motor (Motor A)
    applyPWM(currentLeftPWM, PIN_MOTOR_PWMB, PIN_MOTOR_BIN1);   // Left motor (Motor B)
  }
}

void MotorDriverTB6612::applyPWM(int16_t pwm, uint8_t pwmPin, uint8_t dirPin) {
  // Official Elegoo control pattern (from DeviceDriverSet_Motor_control):
  // Forward (direction_just): dirPin=HIGH, then analogWrite(PWM, speed)
  // Reverse (direction_back): dirPin=LOW, then analogWrite(PWM, speed)
  // Stop (direction_void): analogWrite(PWM, 0), STBY=LOW
  // 
  // CRITICAL: STBY must be HIGH before calling this function (set in setMotors())
  // Official code applies ALL PWM values directly - NO deadband filtering
  
  if (pwm == 0) {
    // Stop: Set PWM to 0, direction doesn't matter
    analogWrite(pwmPin, 0);
    digitalWrite(dirPin, LOW);
    // Note: Official code sets STBY LOW on stop, but we keep it HIGH for other motor
    // We only set STBY LOW in disable() or when both motors are stopped
    return;
  }
  
  // Set direction FIRST (matching official Elegoo code order exactly)
  // Official code: digitalWrite(dirPin, ...) THEN analogWrite(pwmPin, speed)
  bool forward = (pwm > 0);
  digitalWrite(dirPin, forward ? HIGH : LOW);
  
  // Then set PWM magnitude immediately (official code does this without any filtering)
  // Official code applies all PWM values directly - no deadband, no filtering
  uint8_t pwmValue = abs(pwm);
  analogWrite(pwmPin, pwmValue);
}

int16_t MotorDriverTB6612::applyDeadband(int16_t pwm) {
  if (abs(pwm) < deadband) {
    return 0;
  }
  return pwm;
}

int16_t MotorDriverTB6612::applyRamp(int16_t current, int16_t target) {
  int16_t diff = target - current;
  if (abs(diff) <= rampRate) {
    return target;  // Close enough
  }
  
  // Ramp towards target
  if (diff > 0) {
    return current + rampRate;
  } else {
    return current - rampRate;
  }
}

bool MotorDriverTB6612::test() {
  // Basic test: verify STBY pin can be set
  enable();
  if (digitalRead(PIN_MOTOR_STBY) != HIGH) {
    return false;
  }
  
  // Test PWM pins can be written
  analogWrite(PIN_MOTOR_PWMA, 100);
  delay(10);
  analogWrite(PIN_MOTOR_PWMA, 0);
  
  analogWrite(PIN_MOTOR_PWMB, 100);
  delay(10);
  analogWrite(PIN_MOTOR_PWMB, 0);
  
  return true;
}

