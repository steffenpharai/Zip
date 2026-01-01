# Firmware Communication Issue - Diagnosis

## Problem
Commands are being sent to the robot but **no responses are received** (0 messages received).

## Protocol Verification
✅ **Protocol encoding matches** between bridge and firmware:
- Header: `0xAA 0x55` ✓
- LEN calculation: TYPE + SEQ + PAYLOAD ✓
- CRC16-CCITT calculation matches ✓
- Message types match ✓

## Possible Issues

### 1. Firmware Not Uploaded/Running
**Check:**
- Is the firmware compiled and uploaded to the Arduino?
- Does the Arduino Serial Monitor show initialization messages?
- Expected output on Serial Monitor:
  ```
  === ZIP Robot Firmware ===
  Version: 1.0.0
  Initializing...
  Init motor driver...
  Motor driver OK
  ...
  Initialization complete. Ready for commands.
  ```

### 2. Serial Port Conflict
**Issue:** If Arduino Serial Monitor is open, it may block the bridge from accessing COM5.

**Solution:**
- Close Arduino Serial Monitor
- Ensure only the bridge service is using COM5
- Restart the bridge service

### 3. Firmware Initialization Failure
**Check:** The firmware might be stuck in initialization or crashed.

**Symptoms:**
- No serial output
- LED not blinking
- No response to any commands

**Solution:**
- Reset the Arduino
- Check if firmware compiles without errors
- Verify hardware connections

### 4. Serial Buffer Issues
**Issue:** Serial buffer might be full or corrupted.

**Solution:**
- Reset Arduino
- Restart bridge service
- Send HELLO command again

### 5. Baud Rate Mismatch
**Current:** Bridge uses 115200, firmware uses 115200 ✓

**If changed:** Update `SERIAL_BAUD` in both `config.h` and bridge `.env`

## Testing Steps

### Step 1: Verify Firmware is Running
1. Open Arduino Serial Monitor at 115200 baud
2. Reset Arduino
3. Look for initialization messages
4. If no messages appear, firmware is not running

### Step 2: Test Direct Serial Communication
1. Close Arduino Serial Monitor (important!)
2. Restart bridge service
3. Send HELLO command via WebSocket
4. Check bridge logs for:
   - `[SerialManager] Sending X bytes: ...`
   - `[SerialManager] Received X bytes: ...`

### Step 3: Check Bridge Logs
Look for these log messages:
- `[SerialManager] Connected to COM5` ✓ (should appear)
- `[SerialManager] Sending X bytes: AA 55 ...` ✓ (commands being sent)
- `[SerialManager] Received X bytes: ...` ❌ (should appear if robot responds)
- `[SerialManager] Decoded message: type=0x...` ❌ (should appear if robot responds)

### Step 4: Verify Protocol Frame
Test HELLO command frame:
```
AA 55 04 01 01 7B 7D 17 A2
│  │  │  │  │  │  │  └─┘
│  │  │  │  │  │  └─ CRC16
│  │  │  │  │  └─ Payload: {}
│  │  │  │  └─ SEQ: 1
│  │  │  └─ TYPE: 0x01 (HELLO)
│  │  └─ LEN: 4 (TYPE+SEQ+PAYLOAD)
│  └─ Header: 0x55
└─ Header: 0xAA
```

## Expected Robot Response to HELLO

When HELLO is received, robot should send:
1. **INFO message** (type 0x81) with firmware version and capabilities
2. **ACK message** (type 0x82) confirming HELLO was processed

Both should appear in bridge logs as:
- `[SerialManager] Received X bytes: AA 55 ...`
- `[WebSocketServer] Received ACK from robot: seq=1, ok=true`

## Next Steps

1. **Verify firmware is uploaded** - Check Arduino IDE or PlatformIO
2. **Check Serial Monitor** - See if firmware is initializing
3. **Close Serial Monitor** - Ensure bridge can access COM5
4. **Restart bridge** - Reload with latest code
5. **Send test command** - Use WebSocket test script
6. **Check logs** - Look for received messages

