# Firmware Reset Loop - Critical Issue

## Problem Identified

**The firmware is stuck in a reset loop:**
- ✅ Firmware initializes successfully
- ✅ Prints "Initialization complete. Ready for commands."
- ❌ Immediately resets and starts over
- ❌ Never sends telemetry (should be 10Hz)
- ❌ Never processes incoming commands
- ❌ Never sends ACKs

## Evidence

From bridge logs:
```
[SerialManager] Text data: tialization complete. Ready for commands.
[SerialManager] Text data: === ZIP Robot Firmware ===
[SerialManager] Text data: Ver
[SerialManager] Text data: sion: 1.0.0
Initializing...
```

This pattern repeats continuously, indicating the Arduino is resetting every few seconds.

## Root Causes (Possible)

### 1. Watchdog Timeout (Most Likely)
- Watchdog is set to 2 seconds (`WDTO_2S`)
- If a task blocks for > 2 seconds, watchdog resets the Arduino
- **Check:** Are any tasks (IMU, sensors, telemetry) blocking?

### 2. Stack Overflow
- Arduino UNO has only 2KB RAM
- Large JSON documents or deep call stacks could overflow
- **Check:** Telemetry payload uses 128-byte buffer, but protocol limit is 64 bytes

### 3. Hardware Issue
- Power supply instability
- USB connection issue
- Hardware fault causing brownout resets

### 4. Infinite Loop
- A task might be stuck in an infinite loop
- **Check:** `task_telemetry()`, `task_sensors_fast()`, `task_sensors_slow()`

## Immediate Fixes to Try

### Fix 1: Increase Watchdog Timeout
In `robot/firmware/zip_robot_uno/include/config.h`:
```cpp
#define WATCHDOG_TIMEOUT_MS 4000  // Increase from 2000 to 4000
```

In `robot/firmware/zip_robot_uno/src/main.cpp`:
```cpp
wdt_enable(WDTO_4S);  // Change from WDTO_2S to WDTO_4S
```

### Fix 2: Reduce Telemetry Payload Size
The telemetry payload is likely > 64 bytes, which exceeds protocol limit. Reduce the telemetry data:

In `robot/firmware/zip_robot_uno/src/behavior/command_handler.cpp`:
- Remove some IMU fields if not critical
- Reduce JSON precision
- Or split telemetry into multiple smaller messages

### Fix 3: Add Watchdog Resets in Long-Running Tasks
Ensure all tasks call `wdt_reset()` if they might take > 500ms:

```cpp
void task_telemetry() {
  wdt_reset();  // Reset watchdog before sending
  commandHandler.sendTELEMETRY();
}
```

### Fix 4: Disable Watchdog Temporarily (For Testing)
To verify if watchdog is the issue:

In `robot/firmware/zip_robot_uno/src/main.cpp`:
```cpp
// wdt_enable(WDTO_2S);  // Comment out to disable watchdog
```

**WARNING:** Only for testing! Watchdog protects against infinite loops.

## Diagnostic Steps

1. **Check if telemetry task is blocking:**
   - Add Serial.println() before and after sendTELEMETRY()
   - See if it gets stuck

2. **Check IMU initialization:**
   - IMU init has timeout protection, but might still block
   - Try disabling IMU temporarily

3. **Check stack usage:**
   - Add stack usage monitoring
   - Or reduce buffer sizes

4. **Monitor reset pattern:**
   - Time between resets
   - Does it always reset at the same point?

## Expected Behavior After Fix

Once the reset loop is fixed, you should see:
- ✅ Firmware initializes once and stays running
- ✅ `[SerialManager] Protocol frame detected` messages (telemetry every 100ms)
- ✅ `[SerialManager] ✅ Decoded message` messages (ACKs, INFO, telemetry)
- ✅ Commands receive ACKs
- ✅ Web interface shows robot as connected with telemetry data

## Next Steps

1. **Try Fix 1 (Increase watchdog timeout)** - Easiest, least risky
2. **If that doesn't work, try Fix 4 (Disable watchdog)** - To confirm watchdog is the issue
3. **Then apply Fix 2 (Reduce telemetry)** - Most likely root cause
4. **Recompile and upload firmware**
5. **Test with bridge service**

## Current Status

- ✅ Bridge service: Working correctly
- ✅ Protocol encoding: Correct
- ✅ Commands being sent: Correct
- ❌ Firmware: Stuck in reset loop
- ❌ Protocol frames: Not being sent (firmware resets before sending)

**Action Required:** Fix firmware reset loop, then re-test.

