/*
 * Servo Pan Implementation
 */

#include "hal/servo_pan.h"

ServoPan::ServoPan()
  : currentAngle(90)
  , minAngle(SERVO_ANGLE_MIN)
  , maxAngle(SERVO_ANGLE_MAX)
{
}

void ServoPan::init() {
  servo.attach(PIN_SERVO_Z);
  servo.write(currentAngle);
}

void ServoPan::setAngle(uint8_t angle) {
  angle = constrain(angle, minAngle, maxAngle);
  currentAngle = angle;
  servo.write(angle);
}

