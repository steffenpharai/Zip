# Robot Command Test Scripts

## test_robot_serial.py

Direct serial test suite that communicates with the robot via serial port using the binary protocol. This bypasses the WebSocket bridge and tests the robot firmware directly.

### Usage

1. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Run the test suite:**
   ```bash
   python scripts/test_robot_serial.py [PORT]
   ```
   
   Or let it auto-detect the port:
   ```bash
   python scripts/test_robot_serial.py
   ```
   
   Examples:
   ```bash
   # Windows
   python scripts/test_robot_serial.py COM3
   
   # Linux/Mac
   python scripts/test_robot_serial.py /dev/ttyUSB0
   ```

### What It Tests

Same as the WebSocket test suite - all 8 robot command types with 24 test cases total.

### Advantages

- Direct serial communication (no bridge dependency)
- Faster response times
- Better for debugging protocol issues
- Can test robot firmware independently

---

## test-all-commands.ts

Comprehensive test suite that tests all available robot commands via WebSocket and verifies ACK responses.

### Usage

1. **Ensure the bridge service is running:**
   ```bash
   npm run dev
   ```

2. **Ensure the robot is connected and responding:**
   - The robot should be connected via serial port
   - The bridge should show "Serial Connected" in logs
   - The robot should have responded to HELLO command

3. **Run the test suite:**
   ```bash
   npm run test:commands
   ```

   Or with custom WebSocket URL:
   ```bash
   WS_URL=ws://localhost:8765/robot npm run test:commands
   ```

### What It Tests

The test suite exercises all 8 robot command types:

1. **HELLO** - Request robot information
2. **SET_MODE** - Set operating mode (STANDBY, MANUAL, LINE_FOLLOW, OBSTACLE_AVOID, FOLLOW)
3. **DRIVE_TWIST** - Twist control (forward, rotate, stop)
4. **DRIVE_TANK** - Tank drive (forward, turn left, turn right, stop)
5. **SERVO** - Servo position control (center, left, right)
6. **LED** - LED color and brightness control (red, green, blue, cyan, off)
7. **E_STOP** - Emergency stop
8. **CONFIG_SET** - Configuration setting

### Test Output

The script provides:
- Real-time progress for each command
- Success/failure status with response times
- Summary statistics (success rate, average response time)
- List of failed commands (if any)
- Breakdown by command category

### Example Output

```
============================================================
Robot Command Test Suite
============================================================
WebSocket URL: ws://localhost:8765/robot
Total commands to test: 24

✓ Bridge service is healthy and robot is connected

[1/24] Testing: HELLO - Request robot info
  [SENT] HELLO - Request robot info (seq=1)
  ✓ SUCCESS (45ms) - ACK: ok=true

...

============================================================
Test Summary
============================================================
Total commands: 24
Successful: 24 (100.0%)
Failed: 0 (0.0%)
Average response time: 52ms

Successful Commands by Category:
  HELLO: 1 test(s)
  SET_MODE: 5 test(s)
  DRIVE_TWIST: 3 test(s)
  DRIVE_TANK: 4 test(s)
  SERVO: 3 test(s)
  LED: 5 test(s)
  E_STOP: 1 test(s)
  CONFIG_SET: 1 test(s)
```

### Troubleshooting

**Connection Refused:**
- Ensure the bridge service is running (`npm run dev`)
- Check that the WebSocket port (8765) is not blocked

**Robot Not Connected:**
- Verify serial port connection
- Check bridge logs for connection errors
- Ensure robot firmware is running and responding

**Command Timeouts:**
- Check robot firmware is processing commands
- Verify serial communication is working
- Check bridge logs for protocol errors

**ACK Failures:**
- Review robot firmware logs
- Check command payload format matches protocol spec
- Verify robot is in correct mode for the command

