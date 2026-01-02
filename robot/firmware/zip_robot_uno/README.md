# ZIP Robot Firmware

Production-grade firmware for ELEGOO Smart Robot Car V4.0 on Arduino UNO.

**Verified Configuration (January 2026)**
- RAM: 83.7% (1715/2048 bytes)
- Flash: 71.9% (23190/32256 bytes)
- All motion tests passing
- Servo control: **Known Issue** - works at boot, fails on commands (RAM too high)
- Sensor commands return actual values (N=21, N=22, N=23)

⚠️ **Servo Issue**: N=5 commands fail at 83% RAM. Servo works at 46% RAM. See [Troubleshooting](#servo-doesnt-move).

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture](#architecture)
3. [Subsystem Configuration](#subsystem-configuration)
4. [Building & Uploading](#building--uploading)
5. [Testing](#testing)
6. [Protocol Reference](#protocol-reference)
7. [Pin Mapping](#pin-mapping)
8. [RAM Constraints & Lessons Learned](#ram-constraints--lessons-learned)
9. [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# 1. Build and upload firmware
cd robot/firmware/zip_robot_uno
pio run -t upload

# 2. Run the verification tests
cd tools
node serial_motor_bringup.js COM5

# 3. Run extended motion tests (slow, 0.5ft radius safe)
node serial_motor_bringup.js COM5 --motion-only
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Main Loop (1ms)                          │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐  │
│  │  Scheduler   │  Serial RX   │  Watchdog    │  TX Flush    │  │
│  └──────────────┴──────────────┴──────────────┴──────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ task_control_loop│ │ task_sensors_slow│ │ task_protocol_rx │
│     (50 Hz)      │ │     (10 Hz)      │ │    (1 kHz)       │
├──────────────────┤ ├──────────────────┤ ├──────────────────┤
│ motionController │ │ ultrasonic       │ │ JSON Parser      │
│ macroEngine      │ │ batteryMonitor   │ │ Command Router   │
│                  │ │ lineSensor       │ │                  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
          │
          ▼
┌──────────────────┐
│   Motor Driver   │
│   (TB6612FNG)    │
└──────────────────┘
```

### Core Components

| Component | File | Description |
|-----------|------|-------------|
| **Scheduler** | `lib/scheduler/` | Cooperative task scheduler |
| **Motor Driver** | `src/hal/motor_driver.cpp` | TB6612FNG PWM control |
| **Motion Controller** | `src/motion/motion_controller.cpp` | Setpoint tracking |
| **Macro Engine** | `src/motion/macro_engine.cpp` | Predefined motion sequences |
| **Frame Parser** | `src/serial/frame_parser.cpp` | JSON command parsing |
| **JSON Protocol** | `src/serial/json_protocol.cpp` | Response formatting |

---

## Subsystem Configuration

### Enabled Subsystems ✅

| Subsystem | Init | Task | RAM Impact | Description |
|-----------|------|------|------------|-------------|
| `motorDriver` | ✅ | control_loop | baseline | TB6612 motor control |
| `batteryMonitor` | ✅ | sensors_slow | minimal | ADC battery voltage |
| `servoPan` | ✅ | - | minimal | Pan servo (Servo lib) |
| `ultrasonic` | ✅ | sensors_slow | minimal | HC-SR04 distance |
| `lineSensor` | ✅ | sensors_slow | minimal | 3x IR line detect |
| `modeButton` | ✅ | - | minimal | Digital input |
| `motionController` | ✅ | control_loop | minimal | Setpoint tracking |
| `macroEngine` | ✅ | control_loop | minimal | Motion macros |
| `safetyLayer` | ✅ | - | minimal | Safety checks |

### Disabled Subsystems ❌

| Subsystem | Reason | RAM Saved |
|-----------|--------|-----------|
| `statusLED` | FastLED library uses ~96 bytes RAM + heavy stack usage | ~100 bytes |
| `imu` | Wire library + IMU pushes RAM to 88.3%, causes resets | ~103 bytes |
| `commandHandler` | Legacy ELEGOO runtime (intentionally removed) | varies |

### Task Configuration

| Task | Frequency | Enabled | Purpose |
|------|-----------|---------|---------|
| `task_control_loop` | 50 Hz | ✅ | Motion/macro updates |
| `task_sensors_fast` | 50 Hz | ✅ | (empty - IMU disabled) |
| `task_sensors_slow` | 10 Hz | ✅ | Ultrasonic, battery, line sensor |
| `task_protocol_rx` | 1 kHz | ✅ | Serial command processing |
| `task_telemetry` | 0 Hz | ❌ | Disabled (causes TX floods) |

---

## Building & Uploading

### Prerequisites

- [PlatformIO](https://platformio.org/) (CLI or VSCode extension)
- [Node.js](https://nodejs.org/) 18+ (for test scripts)
- Arduino UNO connected via USB

### Build Commands

```bash
# Navigate to firmware directory
cd robot/firmware/zip_robot_uno

# Build firmware (production, size-optimized)
pio run

# Build and upload
pio run -t upload

# Upload to specific port
pio run -t upload --upload-port COM5

# Check memory usage
pio run -v | grep -E "RAM|Flash"

# Clean build
pio run -t clean

# Monitor serial (115200 baud)
pio device monitor -b 115200
```

### Build Environments

| Environment | Optimization | Debug Symbols | Use Case |
|-------------|--------------|---------------|----------|
| `uno` | `-Os` (size) | No | Production |
| `uno_debug` | `-O0` (none) | Yes | Debugging |

### Expected Build Output

```
RAM:   [========  ]  83.9% (used 1719 bytes from 2048 bytes)
Flash: [=======   ]  71.1% (used 22934 bytes from 32256 bytes)
```

⚠️ **RAM Warning**: Keep RAM under 85% to allow for stack usage during function calls.

---

## Testing

### Test Scripts

| Script | Language | Purpose |
|--------|----------|---------|
| `tools/serial_motor_bringup.js` | Node.js | Motor/motion tests |
| `test_servo_rotation.py` | Python | Servo control tests |

### Motor Test: `serial_motor_bringup.js`

A comprehensive Node.js test tool for verifying motor functionality.

#### Installation

```bash
cd robot/firmware/zip_robot_uno/tools
npm install serialport
```

#### Usage

```bash
# Full test suite (motors + sensors + servo + macros)
node serial_motor_bringup.js COM5

# Quick test (basic motor control only - 3 cycles)
node serial_motor_bringup.js COM5 --quick

# Extended motion tests only (safe for desktop - 0.5ft radius)
node serial_motor_bringup.js COM5 --motion-only
```

### Servo Test: `test_servo_rotation.py`

Python test script for verifying servo control via N=5 JSON protocol.

#### Usage

```bash
cd robot/firmware/zip_robot_uno

# Run full servo test suite
python test_servo_rotation.py --port COM5 --all

# Set servo to specific angle
python test_servo_rotation.py --port COM5 --angle 90

# Run sweep test only
python test_servo_rotation.py --port COM5 --sweep

# List available serial ports
python test_servo_rotation.py --list-ports
```

#### Test Modes

| Mode | Flag | Description |
|------|------|-------------|
| **All** | `--all` | Edge cases + sweep + rapid moves |
| **Single** | `--angle 90` | Set to specific angle |
| **Sweep** | `--sweep` | 0° → 180° → 0° sweep |

#### Test Modes

| Mode | Flag | Tests | Duration |
|------|------|-------|----------|
| **Full** | (none) | 11 phases, all subsystems | ~60s |
| **Quick** | `--quick` | Basic motor start/stop | ~10s |
| **Motion Only** | `--motion-only` | 8 motion phases | ~45s |

#### Test Phases (Full Mode)

| # | Phase | Tests | Description |
|---|-------|-------|-------------|
| 1 | Basic Motor | 3 | Forward pulse, stop verify |
| 2 | Forward/Backward | 6 | Creep, slow, medium speeds |
| 3 | Pivot Turns | 6 | Spin in place L/R |
| 4 | Arc Turns | 6 | Wide/tight curves |
| 5 | Wiggle | 4 | Rapid side-to-side |
| 6 | Gradual Speed | 8 | Ramp up/down |
| 7 | Setpoint Stream | 25 | N=200 streaming |
| 8 | Complex Patterns | 12 | Figure-8, box pattern |
| 9 | Servo | 7 | Pan angles 45°-135° |
| 10 | Sensors | 4 | Ultrasonic, line sensors |
| 11 | Macros | 2 | Start/cancel macro |

#### Motion Speed Settings (Desktop Safe)

```javascript
const CREEP_PWM = 60;       // Very slow
const SLOW_PWM = 80;        // Slow  
const MEDIUM_PWM = 100;     // Medium slow
const MICRO_DURATION = 200; // 200ms movements
const SHORT_DURATION = 400; // 400ms movements
```

#### Expected Output

```
════════════════════════════════════════════════════════════
TEST SUMMARY
════════════════════════════════════════════════════════════
Total responses: 93

Test Phase            Passed  Failed  Status
────────────────────────────────────────────────────────────
Motor Direct                3       0  ✓ PASS
Motor Stop                  3       0  ✓ PASS
Forward/Backward            6       0  ✓ PASS
Pivot Turns                 6       0  ✓ PASS
Arc Turns                   6       0  ✓ PASS
Wiggle                      1       0  ✓ PASS
Gradual Speed               1       0  ✓ PASS
Setpoint Stream             1       0  ✓ PASS
────────────────────────────────────────────────────────────

✓ All tests passed!
```

#### Log Output

All test output is logged to:
```
<project>/.cursor/debug.log
```

Format: NDJSON (one JSON object per line)

---

## Protocol Reference

### Baud Rate: 115200

### Command Format

```json
{"N":<command>,"H":"<tag>","D1":<val1>,"D2":<val2>,"T":<ttl>}
```

### Core Commands

| N | Command | Parameters | Response | Description |
|---|---------|------------|----------|-------------|
| 0 | Hello | - | `{H_ok}` | Handshake/ping |
| 5 | Servo | D1=angle | `{H_ok}` | Pan servo control (0-180°) |
| 21 | Ultrasonic | D1=mode | `{H_<value>}` | Distance/obstacle sensor |
| 22 | Line Sensor | D1=sensor | `{H_<value>}` | IR line sensor (L/M/R) |
| 23 | Battery | - | `{H_<mV>}` | Battery voltage |
| 120 | Diagnostics | - | `{<state>...}` | Debug state dump |
| 200 | Setpoint | D1=v, D2=w, T=ttl | (none) | Streaming motion |
| 201 | Stop | - | `{H_ok}` | Immediate stop |
| 210 | Macro Start | D1=id | `{H_ok}` | Start macro |
| 211 | Macro Cancel | - | `{H_ok}` | Cancel macro |
| 999 | Direct Motor | D1=L, D2=R | `{H_ok}` | Raw PWM control |

### Sensor Commands (N=21-23)

These commands return actual sensor values in the response.

| N | Command | Parameters | Response | Description |
|---|---------|------------|----------|-------------|
| 21 | Ultrasonic | D1=1 | `{H_true/false}` | Obstacle detection (≤20cm) |
| 21 | Ultrasonic | D1=2 | `{H_<distance>}` | Distance in cm (0-400) |
| 22 | Line Sensor | D1=0 | `{H_<value>}` | Left sensor (0-1023) |
| 22 | Line Sensor | D1=1 | `{H_<value>}` | Middle sensor (0-1023) |
| 22 | Line Sensor | D1=2 | `{H_<value>}` | Right sensor (0-1023) |
| 23 | Battery | - | `{H_<voltage_mv>}` | Battery voltage in mV |

**Examples:**
```json
// Ultrasonic distance
{"N":21,"H":"ultra","D1":2}  →  {ultra_42}   // 42cm

// Ultrasonic obstacle detection
{"N":21,"H":"obs","D1":1}    →  {obs_false}  // No obstacle

// Line sensor (middle)
{"N":22,"H":"line1","D1":1}  →  {line1_512}  // Analog value

// Battery voltage
{"N":23,"H":"batt"}          →  {batt_7400}  // 7.4V
```

### Legacy Commands (N=1-199)

Other legacy ELEGOO commands return `{H_ok}` for compatibility.

| N | Command | Parameters | Description |
|---|---------|------------|-------------|
| 100 | Clear Mode | - | Stop all |
| 110 | Clear State | - | Reset state |

### Diagnostics Response (N=120)

```
{<owner><L>,<R>,<stby>,<state>,<resets>}
{stats:rx=<rx>,jd=<jd>,pe=<pe>,bc=<bc>,tx=<tx>,ms=<ms>}
```

| Field | Values | Description |
|-------|--------|-------------|
| owner | `I`=Idle, `D`=Direct, `X`=Stopped | Motion owner |
| L, R | -255 to 255 | Current PWM values |
| stby | 0/1 | Motor driver standby |
| state | 0-4 | Motion controller state |
| resets | 0+ | Reset counter |

### Direct Motor Control (N=999)

```json
{"N":999,"H":"tag","D1":180,"D2":180}
```

- D1: Left motor PWM (-255 to 255, negative=reverse)
- D2: Right motor PWM (-255 to 255, negative=reverse)
- Bypasses all motion control, directly sets pins
- Maintained by control loop until stopped

### Servo Control (N=5)

```json
{"N":5,"H":"tag","D1":90}
```

- D1: Servo angle (0-180 degrees)
- Controls the pan servo on pin 10
- Uses official Elegoo pulse width calibration (500μs-2400μs)
- Re-attaches servo before each write for reliability

**Examples:**
```json
{"N":5,"D1":0}     // Pan full left
{"N":5,"D1":90}    // Pan center
{"N":5,"D1":180}   // Pan full right
```

**Test Script:**
```bash
# Run servo rotation test
python test_servo_rotation.py --port COM5 --all
```

### Setpoint Streaming (N=200)

```json
{"N":200,"D1":100,"D2":30,"T":200}
```

- D1: Forward velocity (-255 to 255)
- D2: Yaw/turn rate (-255 to 255)
- T: Time-to-live in ms (150-300 typical)
- Fire-and-forget (no response)
- Stream at 10-20Hz for smooth motion

---

## Pin Mapping

### Motor Driver (TB6612FNG)

| Function | Pin | Arduino |
|----------|-----|---------|
| STBY | D3 | 3 |
| AIN1 (L dir) | D7 | 7 |
| AIN2 (L dir) | D8 | 8 |
| PWMA (L speed) | D5 | 5 |
| BIN1 (R dir) | D4 | 4 |
| BIN2 (R dir) | D9 | 9 |
| PWMB (R speed) | D6 | 6 |

### Sensors & Peripherals

| Function | Pin | Arduino | Notes |
|----------|-----|---------|-------|
| Servo Pan (Z) | D10 | 10 | Horizontal pan, 0-180° |
| Servo Tilt (Y) | D11 | 11 | Vertical tilt (not impl.) |
| Ultrasonic Trig | D13 | 13 | HC-SR04 |
| Ultrasonic Echo | D12 | 12 | HC-SR04 |
| Line Sensor L | A2 | 16 | ITR20001 |
| Line Sensor M | A1 | 15 | ITR20001 |
| Line Sensor R | A0 | 14 | ITR20001 |
| Battery Monitor | A3 | 17 | Voltage divider |
| Mode Button | D2 | 2 | Interrupt capable |
| RGB LED | D4 | 4 | WS2812 (disabled) |

---

## RAM Constraints & Lessons Learned

### Arduino UNO Limitations

- **Total RAM**: 2048 bytes
- **Safe Limit for basic commands**: ~85% (1740 bytes)
- **Safe Limit for servo control**: ~75% (1536 bytes) - servo.attach() needs stack space
- **Current Usage**: 83.7% (1715 bytes)

⚠️ **CRITICAL**: Servo control requires RAM below 75% to work reliably. The `servo.attach()` function uses significant stack space and will corrupt memory if insufficient stack is available.

### What Uses RAM

| Component | Approx. RAM | Notes |
|-----------|-------------|-------|
| Serial buffers | 128 bytes | TX + RX |
| JSON parser | 160 bytes | StaticJsonDocument |
| Frame parser | 80 bytes | Reduced from 128 |
| Scheduler | ~50 bytes | 4 task slots |
| Motor driver | ~20 bytes | State + config |
| Sensors | ~30 bytes | Cached values |
| Stack | ~200 bytes | Function calls |

### What Broke (and Why)

| Issue | Symptom | Cause | Solution |
|-------|---------|-------|----------|
| **FastLED** | Watchdog resets | +96 bytes RAM + stack | Disabled statusLED |
| **IMU/Wire** | Resets at 88% RAM | Wire library overhead | Disabled IMU |
| **Verbose debug** | Resets mid-command | F() strings still use RAM | Minimal logging |
| **Multiple motor writers** | Inconsistent stops | macroEngine/motionController calling motorDriver.stop() | Centralized control |

### Best Practices

1. **Never use `String`** - Use `char[]` with fixed sizes
2. **Use `F()` sparingly** - Still consumes RAM at runtime
3. **Minimize debug output** - Serial.print() uses stack
4. **StaticJsonDocument ≤ 160 bytes** - Larger causes stack overflow
5. **Keep RAM under 85%** - Leave room for stack
6. **Test after each subsystem enable** - Find RAM issues early

---

## Troubleshooting

### Motors Don't Move

1. Check STBY pin (D3) is HIGH
2. Verify N=999 command is acknowledged (`{H_ok}`)
3. Check diagnostics: `{"N":120}` - should show `{D<pwm>,...}`
4. Verify battery voltage is adequate

### Motors Don't Stop

1. Send `{"N":201}` and check for `{H_ok}`
2. Check diagnostics shows `{X0,0,0,...}`
3. Ensure control loop is running (50Hz)

### No Serial Response

1. Verify baud rate is 115200
2. Check for `R` on boot (ready marker)
3. Reduce command rate (max 50/sec)
4. Check TX buffer isn't full

### Watchdog Resets (repeated `R`)

1. Check RAM usage (<85%)
2. Remove debug print statements
3. Ensure no blocking operations
4. Verify all tasks complete quickly

### Test Script Fails

1. Ensure correct COM port
2. Wait for DTR reset (600ms)
3. Check Node.js serialport installed
4. Verify firmware is uploaded

### Servo Doesn't Move

**Quick Checks:**
1. Verify servo signal wire connected to pin 10
2. Check servo has 5V power (red wire)
3. Check servo ground connected to Arduino GND
4. Send test command: `{"N":5,"D1":90}`
5. Run servo test: `python test_servo_rotation.py --port COM5 --angle 90`

**If servo moves on boot but not on commands - RAM/Stack Issue:**

The servo control uses the exact ELEGOO pattern which requires significant stack space:
```cpp
servo.attach(PIN_SERVO_Z);   // Attach before write
servo.write(angle);          // Set position
delay(450);                  // Wait for movement
servo.detach();              // Release Timer1
```

When RAM usage is too high (>80%), there's insufficient stack space for `servo.attach()` which corrupts the Servo library's internal data structures.

**Symptoms of stack overflow:**
- Servo moves to center on boot (init works) but not on commands
- `servo.attached()` returns false even after calling `attach()`
- `servo.read()` returns garbage values like -34

**Solutions:**
1. Reduce RAM usage to below 75% (gives ~500+ bytes for stack)
2. Disable non-essential subsystems (IMU, FastLED already disabled)
3. Reduce buffer sizes in frame parser or JSON documents
4. Move servo control earlier in the call chain (reduce stack depth)

**Verify the issue:**
```bash
# Test at minimal RAM (should work)
# Disable most subsystems, keep only servo + motor + JSON parser

# Check RAM after build:
pio run -v | grep RAM
# Should be below 75% for servo to work reliably
```

---

## Version History

### v2.3.0 (January 2026) - Current
- **Servo control uses exact ELEGOO pattern**: attach → write → delay(450) → detach
- **Known Issue**: Servo commands fail at 83% RAM due to stack overflow
  - Servo works during boot (init) but not on N=5 commands
  - Root cause: `servo.attach()` needs stack space, overflows at high RAM
  - Works at 46% RAM, fails at 83% RAM
  - **Fix needed**: Reduce RAM usage to below 75%

### v2.2.0 (January 2026)
- **Sensor commands now return actual values** (matching official ELEGOO protocol)
- N=21: Ultrasonic returns distance in cm or obstacle detection status
- N=22: Line sensors return analog values (0-1023)
- N=23: Battery voltage command added (returns mV)
- Updated test scripts to validate sensor values

### v2.1.0 (January 2026)
- **Added N=5 servo control** via JSON protocol
- Fixed servo HAL to match official Elegoo pattern (re-attach before write)
- Added pulse width calibration (500μs-2400μs)
- New `test_servo_rotation.py` test script
- RAM reduced to 82.7% (from 83.9%)

### v2.0.0 (January 2026)
- Complete motion control refactor
- Removed legacy ELEGOO runtime handlers
- Single motor ownership model
- Comprehensive test suite
- RAM optimization (96% → 84%)

### v1.0.0 (Initial)
- Basic ELEGOO compatibility
- Dual protocol support
- Self-test on boot

---

## License

MIT License - See LICENSE file for details.

## References

- [ELEGOO Smart Robot Car V4.0](https://www.elegoo.com)
- [PlatformIO Documentation](https://docs.platformio.org/)
- [Arduino UNO Pinout](https://www.arduino.cc/en/Reference/Board)
