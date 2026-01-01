# Robot Streaming Problem Documentation

## Problem Summary

The robot's motors respond to **single N=200 setpoint commands** but **streaming multiple commands** does not maintain continuous motion. The firmware matches the official Elegoo implementation, and hardware connections are confirmed correct.

## What Works ✅

### Single N=200 Commands
- **Test 8**: `N=200, D1=200, D2=0, T=2000` - ✅ Works
- **Test 9**: `N=200, D1=200, D2=0, T=300` - ✅ Works  
- **Test 10**: `N=200, D1=255, D2=0, T=2000` - ✅ Works

**Observation**: Single N=200 setpoint commands successfully move the robot forward for their TTL duration.

## What Doesn't Work ❌

### N=999 Direct Motor Commands
- **Tests 1-7**: All N=999 direct motor control commands fail
- These bypass the motion controller and directly call `motorDriver.setMotors()`
- **Root Cause**: The motion controller's `update()` loop maintains setpoints, but N=999 doesn't use this mechanism

### Streaming N=200 Commands
- **Problem**: When sending multiple N=200 commands in sequence, subsequent commands don't maintain motion
- **Symptoms**:
  - First command works
  - Second and subsequent commands don't move the robot
  - Commands are being sent and received (confirmed via serial responses)
  - Firmware appears to process commands correctly

## Technical Details

### Firmware Architecture

#### Motion Controller Flow
1. **N=200 Command Received** → `handleMotionCommand()` → `motionController.setSetpoint()`
2. **setSetpoint()**:
   - Sets `state = MOTION_STATE_SETPOINT`
   - Sets `currentSetpoint.timestamp = millis()`
   - Immediately calls `motorDriver->setMotors()` to apply PWM
3. **update() Loop** (runs at 50Hz):
   - Checks if `state == MOTION_STATE_SETPOINT`
   - Verifies TTL hasn't expired
   - Re-applies PWM via `motorDriver->setMotors()` to maintain motion

#### Motor Driver
- **setMotors()**: Sets STBY HIGH, applies PWM immediately
- **stop()**: Sets PWM to 0, keeps STBY HIGH (doesn't disable)
- **enable()**: Sets STBY HIGH, sets `standbyEnabled = true`

### Code Path Analysis

**Single Command (Works)**:
```
N=200 → setSetpoint() → motorDriver.setMotors() → PWM applied
update() loop → re-applies PWM every 20ms → motion maintained until TTL expires
```

**Streaming Commands (Doesn't Work)**:
```
N=200 #1 → setSetpoint() → PWM applied → ✅ Works
N=200 #2 → setSetpoint() → timestamp reset → PWM should be applied → ❌ Doesn't work
```

### Hypothesis

The issue may be:
1. **State Management**: When a new setpoint arrives, it resets the timestamp, but something prevents the new command from taking effect
2. **Update Loop Timing**: The update loop might not be running frequently enough, or there's a race condition
3. **Motor Driver State**: The motor driver might be getting disabled or reset between commands
4. **Safety Layer**: The safety layer might be blocking subsequent commands (unlikely, as commands are being processed)

## Test Results

### Comprehensive Test (identify_working_test.js)
- **Tests 1-7 (N=999)**: ❌ All failed
- **Test 8 (N=200, T=2000)**: ✅ Worked
- **Test 9 (N=200, T=300)**: ✅ Worked
- **Test 10 (N=200, T=2000, v=255)**: ✅ Worked

### Streaming Tests
- **20Hz streaming (50ms interval, T=300ms)**: ❌ Failed
- **10Hz streaming (100ms interval, T=500ms)**: ❌ Failed
- **5Hz streaming (200ms interval, T=1000ms)**: ❌ Failed
- **800ms interval (T=1000ms)**: ⏳ Pending verification

## Current Status

- ✅ Firmware matches official Elegoo implementation
- ✅ Hardware connections confirmed correct
- ✅ Single N=200 commands work reliably
- ❌ Streaming N=200 commands does not maintain continuous motion
- ❌ N=999 direct motor commands do not work

## Next Steps

1. **Verify 800ms interval streaming test** - Test if slower command rate works
2. **Add debug logging** - Add Serial output to trace command processing
3. **Check update loop frequency** - Verify 50Hz control loop is running
4. **Investigate state transitions** - Check if motion controller state is being reset incorrectly
5. **Test with explicit stops** - Try sending N=201 stop between each N=200 command
6. **Check motor driver state** - Verify STBY pin and motor enable state between commands

## Files Involved

- `robot/firmware/zip_robot_uno/src/motion/motion_controller.cpp` - Motion control logic
- `robot/firmware/zip_robot_uno/src/hal/motor_driver.cpp` - Motor driver implementation
- `robot/firmware/zip_robot_uno/src/main.cpp` - Command routing and control loop
- `robot/tools/identify_working_test.js` - Comprehensive test script
- `robot/tools/working_stream_test.js` - Streaming test with 800ms intervals

## Related Issues

- Motor control matches official Elegoo V4.0 implementation
- Pin mappings verified correct (STBY=3, PWMA=5, PWMB=6, AIN1=7, BIN1=8)
- No deadband or ramping (matches official code)
- Immediate PWM application (matches official code)

