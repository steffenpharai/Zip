# ZIP Robot

ZIP is an AI-powered robot built on the ELEGOO Smart Robot Car V4.0 platform, featuring voice control, computer vision, and autonomous capabilities through a Jarvis-style HUD interface.

## Overview

ZIP combines custom Arduino firmware, a WebSocket bridge server, and a Next.js HUD interface to create an intelligent robot that can be controlled through voice commands, text chat, or autonomous AI orchestration.

```
┌─────────────────────────────────────────────────────────────────┐
│                         ZIP HUD                                  │
│              (Next.js + OpenAI Realtime Voice)                  │
│                    http://localhost:3000                         │
└─────────────────────────┬───────────────────────────────────────┘
                          │ WebSocket
┌─────────────────────────▼───────────────────────────────────────┐
│                      Robot Bridge                                │
│                  ws://localhost:8765/robot                       │
│              (WebSocket ↔ Serial Translation)                    │
└─────────────────────────┬───────────────────────────────────────┘
                          │ Serial (115200 baud)
┌─────────────────────────▼───────────────────────────────────────┐
│                     ZIP Robot Firmware                           │
│              (Arduino UNO + ELEGOO Shield)                       │
│         Motors • Sensors • Servos • IMU • Camera                 │
└─────────────────────────────────────────────────────────────────┘
```

## Features

### Robot Hardware
- **ELEGOO Smart Robot Car V4.0** base platform
- **Arduino UNO R3** with SmartCar-Shield-v1.1
- **TB6612FNG** dual H-bridge motor driver
- **MPU6050** IMU for orientation sensing
- **Ultrasonic sensor** for distance measurement
- **Line tracking sensors** for navigation
- **Servo-mounted sensor head** for scanning
- **ESP32-CAM** module for robot vision (in development)

### AI Capabilities
- **Voice Control**: Natural language commands via OpenAI Realtime
- **Autonomous Navigation**: AI-driven motion planning
- **Computer Vision**: Image analysis and object detection
- **Memory System**: Remembers commands and context
- **Tool Orchestration**: Chains multiple operations intelligently

### HUD Interface
- **Real-time Telemetry**: Motor states, sensor readings, battery voltage
- **Motion Control**: Velocity/turn rate joystick and presets
- **Sensor Display**: Live ultrasonic, line sensor, and IMU data
- **Serial Console**: Direct firmware communication
- **Voice & Chat**: Multiple interaction modes

## Documentation

| Document | Description |
|----------|-------------|
| [Robot Firmware](robot/firmware/zip_robot_uno/README.md) | Arduino firmware documentation |
| [Robot Bridge](robot/bridge/zip-robot-bridge/README.md) | WebSocket bridge server |
| [Motion Control](robot/ELEGOO_MOTION_CONTROL.md) | Motion system details |
| [Docker Guide](docs/docker/README.md) | Docker deployment |
| [Architecture](docs/agents/architecture.md) | System architecture |

## Quick Start

### 1. Flash the Robot Firmware

```bash
cd robot/firmware/zip_robot_uno
pio run -t upload
```

### 2. Start the Bridge Server

```bash
cd robot/bridge/zip-robot-bridge
npm install
npm run dev
```

### 3. Start the HUD

```bash
npm install
cp example-env .env
# Add your OPENAI_API_KEY to .env
npm run dev
```

### 4. Open the HUD

Navigate to [http://localhost:3000](http://localhost:3000)

## Project Structure

```
zip/
├── robot/
│   ├── firmware/
│   │   ├── zip_robot_uno/      # Arduino UNO firmware
│   │   └── zip_esp32_cam/      # ESP32-CAM firmware (in development)
│   ├── bridge/
│   │   └── zip-robot-bridge/   # WebSocket-to-Serial bridge
│   └── tools/                  # Testing and diagnostic utilities
├── app/                        # Next.js HUD application
│   ├── api/                    # API routes
│   ├── (hud)/                  # Main HUD page
│   └── robot/                  # Robot control page
├── components/
│   ├── hud/                    # HUD UI components
│   └── robot/                  # Robot control components
├── lib/
│   ├── robot/                  # Robot client libraries
│   ├── orchestrators/          # AI orchestration
│   ├── tools/                  # Tool implementations
│   └── openai/                 # OpenAI integration
└── docs/                       # Documentation
```

## Robot Tools

The AI can control the robot through these tools:

| Tool | Tier | Description |
|------|------|-------------|
| `get_robot_status` | READ | Connection status and bridge state |
| `get_robot_diagnostics` | READ | Motor states, reset count, serial stats |
| `get_robot_sensors` | READ | Ultrasonic, line sensors, battery voltage |
| `robot_move` | ACT | Move with velocity and turn rate |
| `robot_stop` | ACT | Emergency stop |
| `robot_stream_start` | ACT | Start continuous motion streaming |
| `robot_stream_stop` | ACT | Stop motion streaming |

## Firmware Commands

The firmware uses ELEGOO-style JSON protocol:

| Command | N | Description |
|---------|---|-------------|
| Hello | 0 | Handshake/ping |
| Setpoint | 200 | Streaming motion (velocity, turn rate, TTL) |
| Stop | 201 | Immediate stop |
| Diagnostics | 120 | Debug state dump |
| Direct Motor | 999 | Raw PWM control |

See [robot/firmware/zip_robot_uno/README.md](robot/firmware/zip_robot_uno/README.md) for full protocol documentation.

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key for voice and AI features |

### Robot Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_ROBOT_BRIDGE_WS_URL` | `ws://localhost:8765/robot` | Bridge WebSocket URL |
| `SERIAL_PORT` | auto-detect | Serial port (COM5, /dev/ttyUSB0) |
| `SERIAL_BAUD` | `115200` | Serial baud rate |
| `LOOPBACK_MODE` | `false` | Test mode without hardware |

### HUD Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_REALTIME_MODEL` | `gpt-4o-realtime-preview-2024-12-17` | Voice model |
| `OPENAI_RESPONSES_MODEL` | `gpt-4o` | Chat/reasoning model |
| `ZIP_REALTIME_ENABLED` | `true` | Enable voice interface |
| `ZIP_UPDATE_INTERVAL_MS` | `2000` | Panel update interval |

## Testing

### Firmware Tests

```bash
cd robot/firmware/zip_robot_uno/tools

# Motor bringup test
node serial_motor_bringup.js COM5

# Hardware smoke test
node hardware_smoke.js COM5

# Motion-only test (safe 0.5ft radius)
node serial_motor_bringup.js COM5 --motion-only
```

### Bridge Tests

```bash
cd robot/bridge/zip-robot-bridge

# Health check
npm run test:health

# Integration tests
npm run test:integration
```

### HUD Tests

```bash
# E2E tests
npm run test:e2e

# Type checking
npm run typecheck
```

## Hardware Setup

### Components

- ELEGOO Smart Robot Car V4.0 kit
- Arduino UNO R3
- SmartCar-Shield-v1.1 (TB6612FNG motor driver)
- HC-SR04 ultrasonic sensor
- SG90 servo for sensor head
- MPU6050 IMU module
- ESP32-CAM module (optional, for vision)

### Wiring

The firmware is configured for the standard ELEGOO shield pinout:

| Component | Pins |
|-----------|------|
| Left Motor | D5 (PWM), D8/D9 (DIR) |
| Right Motor | D6 (PWM), D10/D11 (DIR) |
| Ultrasonic | D13 (Trig), D12 (Echo) |
| Servo | D10 |
| Motor Standby | D3 |
| Line Sensors | A0, A1, A2 |
| Battery | A3 |

See [robot/firmware/zip_robot_uno/README.md](robot/firmware/zip_robot_uno/README.md) for detailed pin mapping.

## Development Status

**Version**: 0.1.0

### Completed
- ✅ Arduino firmware with motion control
- ✅ WebSocket bridge server
- ✅ HUD with real-time telemetry
- ✅ Voice control integration
- ✅ AI tool orchestration for robot commands
- ✅ Sensor reading and display
- ✅ IMU integration (MPU6050)
- ✅ Drive safety layer (battery-aware, deadband, ramping)

### In Development
- 🔄 ESP32-CAM integration for robot vision
- 🔄 Autonomous navigation modes
- 🔄 Path planning and mapping

## Additional HUD Features

The ZIP HUD also includes non-robot features:

- **3D Printer Control**: Moonraker/Klipper integration (11 tools)
- **Document Intelligence**: PDF ingestion and Q&A
- **Web Research**: Automated research with citations
- **Notes & Timers**: Personal productivity tools
- **Memory System**: Persistent AI memory

## Contributing

1. Fork the repository
2. Create a feature branch
3. Follow patterns in `.cursorrules`
4. Run `npm run typecheck` and `npm run lint`
5. Submit a pull request

## License

MIT
