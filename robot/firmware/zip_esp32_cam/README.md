# ZIP ESP32-S3 Camera Firmware

Production-ready ESP32-S3 camera firmware for the ELEGOO Smart Robot Car V4.0, refactored with modular architecture and proper ESP32-S3 GPIO mappings.

## Features

- **WiFi AP Mode**: Creates `ELEGOO-XXXX` network (no password)
- **MJPEG Streaming**: `http://192.168.4.1:81/stream`
- **Single Capture**: `http://192.168.4.1/capture`
- **Health Diagnostics**: `http://192.168.4.1/health` (JSON)
- **Web UI**: `http://192.168.4.1/`
- **JSON Command Bridge**: TCP port 100 (WiFi → Serial2 → UNO)
- **Boot-Safe UART**: GPIO0 protection during startup

## Hardware Configuration

| Component | Configuration |
|-----------|---------------|
| Board | ESP32S3-Camera-v1.0 |
| MCU | ESP32-S3-WROOM-1 |
| Camera | OV2640 |
| PSRAM | 8 MB (OPI) |
| Flash | 8 MB (QIO) |

### Pin Assignments

**Camera (OV2640):**
| Signal | GPIO |
|--------|------|
| XCLK | 15 |
| SIOD | 4 |
| SIOC | 5 |
| Y2-Y9 | 11, 9, 8, 10, 12, 18, 17, 16 |
| VSYNC | 6 |
| HREF | 7 |
| PCLK | 13 |

**UART Bridge (to Robot Shield P8):**
| Pin | GPIO | Note |
|-----|------|------|
| RX | 44 | Hardware UART0 RX |
| TX | 43 | Hardware UART0 TX |

**Status LED:**
| Pin | GPIO |
|-----|------|
| LED | 3 |

## Requirements

- [PlatformIO](https://platformio.org/) CLI or VS Code extension
- USB cable to connect ESP32-S3 to PC
- ELEGOO Smart Robot Car V4.0 hardware

## Build and Upload

### 1. Build

```bash
cd robot/firmware/zip_esp32_cam

# Standard build
pio run -e esp32cam

# Debug build (verbose logging, self-test)
pio run -e esp32cam_debug

# Minimal build (no camera, UART bridge only)
pio run -e esp32cam_minimal
```

### 2. Upload

```bash
pio run -t upload
```

Or specify the port:

```bash
pio run -t upload --upload-port COM4
```

### 3. Monitor

```bash
pio device monitor
```

Expected output:
```
==========================================
  ZIP ESP32-S3 Camera Firmware v2.0
  Board: ESP32S3-Camera-v1.0
==========================================
Chip: ESP32-S3 rev 0, 2 cores @ 240 MHz
Flash: 8 MB
Heap: 280000 bytes free
PSRAM: 8388608 bytes (8380000 free)
Camera: XCLK=15 SIOD=4 SIOC=5 PCLK=13
UART: RX=0 TX=1 @ 115200 baud
LED: GPIO14
==========================================
[INIT] Initializing camera...
[CAM] Camera initialized successfully
[INIT] Initializing WiFi...
:----------------------------:
wifi_name:ELEGOO-1234ABCD
:----------------------------:
Camera Ready! Use 'http://192.168.4.1' to connect
==========================================
```

## Architecture

```
robot/firmware/zip_esp32_cam/
├── include/
│   ├── board/
│   │   └── board_esp32s3_elegoo_cam.h  ← Pin definitions (single source of truth)
│   └── config/
│       ├── build_config.h              ← Feature flags
│       └── runtime_config.h            ← Runtime parameters
├── src/
│   ├── app/
│   │   └── app_main.cpp               ← Main application (setup/loop)
│   ├── drivers/
│   │   ├── camera/
│   │   │   ├── camera_service.h
│   │   │   └── camera_service.cpp     ← Camera initialization & capture
│   │   └── uart/
│   │       ├── uart_bridge.h
│   │       └── uart_bridge.cpp        ← UART with boot-safe GPIO0
│   ├── net/
│   │   ├── net_service.h
│   │   └── net_service.cpp            ← WiFi AP management
│   └── web/
│       ├── web_server.h
│       └── web_server.cpp             ← HTTP handlers & streaming
└── platformio.ini
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     ESP32-S3                                 │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │  WiFi AP        │    │  Camera Server                  │ │
│  │  ELEGOO-XXXX    │    │  - OV2640 sensor (GPIO 15 XCLK)│ │
│  │  192.168.4.1    │    │  - MJPEG encoder                │ │
│  └────────┬────────┘    │  - HTTP handlers                │ │
│           │             └─────────────────────────────────┘ │
│  ┌────────▼────────┐                                        │
│  │  TCP Server     │    ┌─────────────────────────────────┐ │
│  │  Port 100       │───►│  UART Bridge (115200 baud)      │ │
│  │  JSON bridge    │◄───│  GPIO0 RX, GPIO1 TX             │ │
│  └─────────────────┘    └────────────┬────────────────────┘ │
└──────────────────────────────────────┼──────────────────────┘
                                       │
                          ┌────────────▼────────────┐
                          │  Arduino UNO (ZIP)      │
                          │  115200 baud            │
                          │  Motion control         │
                          └─────────────────────────┘
```

## Build Configurations

### Feature Flags (platformio.ini)

| Flag | Default | Description |
|------|---------|-------------|
| `ENABLE_CAMERA` | 1 | Enable camera subsystem |
| `ENABLE_UART` | 1 | Enable UART bridge |
| `ENABLE_STREAM` | 1 | Enable MJPEG streaming |
| `ENABLE_HEALTH_ENDPOINT` | 1 | Enable /health JSON |
| `ENABLE_SELF_TEST` | 0 | Run self-test at boot |
| `ENABLE_VERBOSE_LOGS` | 0 | Verbose debug logging |

### Build Environments

| Environment | Description |
|-------------|-------------|
| `esp32cam` | Standard production build |
| `esp32cam_debug` | Debug build with logging & self-test |
| `esp32cam_minimal` | No camera (UART bridge only) |

## Health Endpoint

`GET /health` returns JSON:

```json
{
  "camera": {
    "init_ok": true,
    "last_error": "OK",
    "status": "OK",
    "captures": 1234,
    "failures": 0
  },
  "uart": {
    "rx_pin": 0,
    "tx_pin": 1,
    "rx_bytes": 5678,
    "tx_bytes": 1234,
    "framing_errors": 0
  },
  "psram": {
    "bytes": 8388608,
    "free": 8380000
  },
  "heap": {
    "free": 280000,
    "min_free": 250000
  },
  "wifi": {
    "mode": "AP",
    "ssid": "ELEGOO-1234ABCD",
    "ip": "192.168.4.1",
    "stations": 1
  }
}
```

## Boot-Safe UART

GPIO0 is a boot strapping pin on ESP32-S3. If held LOW during reset, the chip enters download mode. The UART bridge implements a boot guard:

1. **Boot window**: First 1000ms after reset, UART RX is disabled
2. **GPIO0 check**: At boot, logs warning if GPIO0 is LOW
3. **Delayed init**: Serial2.begin() only after boot window expires

This prevents external devices on the UART from interfering with boot.

## Graceful Degradation

The firmware continues running even if subsystems fail:

- **Camera fails**: WiFi, UART, and web server still work. `/stream` returns 503.
- **UART fails**: Camera and WiFi still work.
- **WiFi fails**: Logs error but doesn't crash.
- **Serial not connected**: System runs normally without USB/Serial monitor. Serial operations are non-blocking and buffer output.

## Troubleshooting

### Upload Failed

1. Press and hold the BOOT button on ESP32-S3 while uploading
2. Check COM port is correct
3. Close any serial monitors

### Camera Not Detected

1. Check ribbon cable connection
2. Power cycle the ESP32
3. Monitor serial output for pin mismatch errors
4. Check `/health` endpoint for error details

### PSRAM Not Detected

Ensure `platformio.ini` has:
```ini
board_build.arduino.memory_type = qio_opi
```

### WiFi Connection Drops

1. Ensure PC is close to robot (WiFi range ~10m)
2. Check for interference from other 2.4GHz devices
3. Robot must be powered on

### ESP32 Not Running Without USB/Serial Monitor

**Fixed in v2.0**: The firmware now runs independently of Serial connection status.

**Previous Issue**: ESP32 would only run when USB was connected and Serial monitor was open, due to blocking `Serial.flush()` calls.

**Solution**: 
- Removed all blocking `Serial.flush()` calls
- Serial operations are now non-blocking (buffer output, drain when connected)
- Critical messages use ESP_LOG (always works, even without Serial)
- Buffer space checks prevent blocking when Serial buffer is full

**Result**: ESP32 now runs normally on external power without USB/Serial connection.

## Changes from Original ELEGOO Firmware

| Item | Original | Refactored |
|------|----------|------------|
| Architecture | Monolithic main.cpp | Modular services |
| Pin definitions | WROVER (invalid for S3) | OV2640 ESP32-S3 GPIOs |
| Camera sensor | OV2640 (assumed) | OV2640 (verified) |
| XCLK pin | GPIO 45 (strapping) | GPIO 15 (safe) |
| I2C pins | GPIO 1/2 | GPIO 4/5 (OV2640 standard) |
| UART pins | GPIO0/1 (boot issues) | GPIO43/44 (hardware UART0) |
| LED pin | GPIO13/14 | GPIO3 (after boot) |
| Boot safety | None | Strapping pin protection |
| Diagnostics | Minimal | /health JSON endpoint |
| Build system | Arduino IDE | PlatformIO |
| Error handling | Basic | Structured with status tracking |

## License

Based on ELEGOO official firmware. Modified for ZIP robot integration.
