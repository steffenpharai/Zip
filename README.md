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

### HUD Interface
- **🎤 Realtime Voice Interface**: Low-latency voice control via OpenAI Realtime WebRTC with barge-in support
- **🤖 AI Orchestration**: Intelligent request routing with research and workflow sub-graphs
- **💬 Multi-Modal Interaction**: Voice, text chat, and vision (webcam analysis) support
- **🧠 Memory System**: User-controlled pinned memory with natural language commands
- **📊 Real-time Telemetry**: Motor states, sensor readings, battery voltage
- **🎮 Motion Control**: Velocity/turn rate joystick and presets
- **📡 Sensor Display**: Live ultrasonic, line sensor, and IMU data
- **🔌 Serial Console**: Direct firmware communication

### Additional Capabilities
- **📚 Document Intelligence**: PDF ingestion, vector search, and Q&A with citations
- **🌐 Web Research**: Automated research pipeline with source validation and citations
- **📝 Notes & Timers**: Full CRUD operations for notes and server-side timer reminders
- **🖨️ 3D Printer Control**: Moonraker/Klipper printer integration (11 tools)
- **🔒 Security**: Permission-based tool access, input validation, and audit logging
- **📊 Observability**: Comprehensive tracing, audit logs, and request tracking

## Documentation

| Document | Description |
|----------|-------------|
| [Robot Firmware](robot/firmware/zip_robot_uno/README.md) | Arduino firmware documentation |
| [Robot Bridge](robot/bridge/zip-robot-bridge/README.md) | WebSocket bridge server |
| [Motion Control](robot/ELEGOO_MOTION_CONTROL.md) | Motion system details |
| [ESP32-CAM](robot/firmware/zip_esp32_cam/README.md) | Camera module firmware |
| [Docker Guide](docs/docker/README.md) | Docker deployment documentation |
| [Windows Serial Port](docs/docker/WINDOWS_SERIAL_PORT.md) | Serial port setup on Windows |
| [Agent Guide](AGENT_GUIDE.md) | Quick reference for AI agents |
| [Agent Onboarding](docs/agents/README.md) | Getting started for agents |
| [Architecture Guide](docs/agents/architecture.md) | System architecture details |
| [Development Workflow](docs/agents/development-workflow.md) | How to work on tasks |

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

## Local Development

ZIP can be run as multiple independent services locally. This setup is useful for development and debugging.

### Prerequisites

- Node.js 18+
- PlatformIO (for firmware)
- npm or yarn
- `.env` file configured (see [Environment Variables](#environment-variables))
- Serial port available or `LOOPBACK_MODE=true` for testing

### Service Architecture

1. **zip-app** (Next.js HUD application)
   - Port: 3000
   - Health: `GET /api/health`
   - Hot reloading in development

2. **robot-bridge** (Robot communication bridge)
   - WebSocket: 8765
   - HTTP: 8766
   - Health: `GET /health`
   - Serial port access for robot communication

3. **zip-robot-firmware** (Arduino firmware)
   - Serial: 115200 baud
   - Protocol: ELEGOO-style JSON

### Running Services

**Terminal 1 - ZIP HUD:**
```bash
npm run dev:local
```

**Terminal 2 - Robot Bridge:**
```bash
npm run dev:bridge
```

**Firmware - Upload once:**
```bash
cd robot/firmware/zip_robot_uno
pio run -t upload
```

### Available Scripts

#### ZIP HUD (Root Directory)

| Script | Description |
|--------|-------------|
| `npm run dev:local` | Start ZIP HUD in development mode |
| `npm run dev:bridge` | Start robot bridge in development mode |
| `npm run build:local` | Build ZIP HUD for production |
| `npm run build:bridge` | Build robot bridge for production |
| `npm run test:local` | Run full test suite |
| `npm run test:health` | Health check both services |
| `npm run test:integration` | Integration tests between services |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | Run ESLint |
| `npm run test:e2e` | Run Playwright E2E tests |

#### Robot Bridge (`robot/bridge/zip-robot-bridge/`)

| Script | Description |
|--------|-------------|
| `npm run dev:local` | Development mode with hot reload |
| `npm run build:local` | Production build |
| `npm start` | Run production build |
| `npm run test:health` | Health check endpoint test |
| `npm run test:integration` | Integration tests |

## Docker Deployment

ZIP can be run in Docker with hot reloading for development and optimized builds for production.

### Quick Start

**Development:**
```bash
make dev
# or
docker-compose up
```

**Production:**
```bash
make prod:build
make prod:up
```

### Services

The Docker setup includes:

1. **zip-app** (Next.js application)
   - Port: 3000
   - Health: `GET /api/health`
   - Hot reloading in development

2. **robot-bridge** (Robot communication bridge)
   - WebSocket: 8765
   - HTTP: 8766
   - Health: `GET /health`
   - Serial port access for robot communication

### Serial Port Configuration

For robot bridge to access serial ports:

**Linux:**
```yaml
devices:
  - /dev/ttyUSB0:/dev/ttyUSB0
```

**Windows/WSL2:**
```yaml
devices:
  - //./COM3:/dev/ttyUSB0
```

**Testing without hardware:**
Set `LOOPBACK_MODE=true` in `.env` to enable loopback mode.

For detailed Docker documentation, see [docs/docker/README.md](docs/docker/README.md).

## Architecture Overview

### Event-Driven Architecture

ZIP uses a typed event bus system where all UI state changes flow through events:

```
User Input → Event Bus → State Reducer → UI Updates
                ↓
         Tool Executor → OpenAI API → Tool Results → Panel Updates
                ↓
         Robot Bridge → Serial → Firmware → Motors/Sensors
```

### Core Systems

| System | Location | Description |
|--------|----------|-------------|
| Event Bus | `lib/events/` | Typed event system for all UI state changes |
| State Machine | `lib/state/hudStore.ts` | HUD reducer managing Zip states |
| Tool Registry | `lib/tools/registry.ts` | Whitelisted tools with Zod schemas |
| Tool Executor | `lib/tools/executor.ts` | Executor with permissions, audit, tracing |
| AI Orchestration | `lib/orchestrators/brain.ts` | LangGraph-based orchestration system |
| Robot Client | `lib/robot/` | WebSocket client for robot communication |
| Memory | `lib/memory/` | SQLite-based pinned memory |
| Observability | `lib/observability/` | Tracing and audit logging |

### OpenAI Integration

ZIP uses a two-model approach:

1. **Realtime Model** (`OPENAI_REALTIME_MODEL`): Low-latency voice interactions via WebRTC
2. **Responses Model** (`OPENAI_RESPONSES_MODEL`): Stronger reasoning for planning and tool calling

#### Realtime WebRTC

- **Endpoint**: `/api/realtime/token` - Returns ephemeral token for WebRTC connection
- **Bridge Endpoint**: `/api/realtime/bridge` - Bridges voice to AI orchestration
- **Client Hook**: `hooks/useRealtime.ts` - Manages WebRTC connection
- **State Mapping**: Realtime states → Zip states (LISTENING/THINKING/SPEAKING/TOOL_RUNNING)
- **Barge-in**: User can interrupt Zip while speaking
- **Fallback**: STT/TTS pipeline if Realtime unavailable

#### Responses API

- **Endpoint**: `/api/agent` - Main chat endpoint with tool calling
- **AI Brain Orchestration**: All requests route through `lib/orchestrators/brain.ts`
- **Intelligent Routing**: Automatically routes to research, workflow, or direct tool calling
- **Multi-Step Loops**: Supports up to 10 iterations of tool calling
- **Memory Integration**: Pinned memory automatically included in system prompt

## Tool Registry

### Permission Tiers

| Tier | Description | Confirmation |
|------|-------------|--------------|
| READ | Safe read-only operations | None |
| WRITE | Data modification | None |
| ACT | Physical actions or external effects | Required |
| ADMIN | Administrative operations | Reserved |

### Robot Tools (7 tools)

| Tool | Tier | Description |
|------|------|-------------|
| `get_robot_status` | READ | Connection status and bridge state |
| `get_robot_diagnostics` | READ | Motor states, reset count, serial stats |
| `get_robot_sensors` | READ | Ultrasonic, line sensors, battery voltage |
| `robot_move` | ACT | Move with velocity and turn rate |
| `robot_stop` | ACT | Emergency stop |
| `robot_stream_start` | ACT | Start continuous motion streaming |
| `robot_stream_stop` | ACT | Stop motion streaming |

### 3D Printer Tools (11 tools)

| Tool | Tier | Description |
|------|------|-------------|
| `get_printer_status` | READ | Comprehensive printer status |
| `get_printer_temperature` | READ | Hotend and bed temperatures |
| `get_print_progress` | READ | Current print job progress |
| `list_printer_files` | READ | G-code files on printer |
| `start_print` | ACT | Start printing a G-code file |
| `pause_print` | ACT | Pause current print |
| `resume_print` | ACT | Resume paused print |
| `cancel_print` | ACT | Cancel current print |
| `set_temperature` | ACT | Set hotend or bed temperature |
| `home_axes` | ACT | Home specified axes |
| `move_axis` | ACT | Move a specific axis |

### System & Info Tools

| Tool | Tier | Description |
|------|------|-------------|
| `get_system_stats` | READ | CPU, RAM, Disk usage |
| `get_weather` | READ | Weather with forecast and air quality |
| `get_uptime` | READ | System uptime and session stats |

### Web & Research Tools

| Tool | Tier | Description |
|------|------|-------------|
| `web_search` | READ | Search the web for current information |
| `fetch_url` | READ | Fetch and extract content from URLs |
| `summarize_sources` | READ | Summarize multiple sources with citations |

### Document Tools

| Tool | Tier | Description |
|------|------|-------------|
| `ingest_document` | WRITE | Ingest PDFs and text documents |
| `doc_search` | READ | Vector search across documents |
| `doc_answer` | READ | Answer questions from documents |

### Notes & Timers

| Tool | Tier | Description |
|------|------|-------------|
| `create_note` | WRITE | Create a new note |
| `list_notes` | READ | List all notes |
| `search_notes` | READ | Search notes by content |
| `delete_note` | WRITE | Delete a note |
| `create_timer` | ACT | Create a timer with reminder |
| `cancel_timer` | ACT | Cancel a timer |

### Vision & Camera

| Tool | Tier | Description |
|------|------|-------------|
| `analyze_image` | READ | Analyze images using vision AI |
| `set_camera_enabled` | ACT | Toggle camera state |
| `open_url` | ACT | Open URL in browser (requires confirmation) |

## Firmware Protocol

The firmware uses ELEGOO-style JSON protocol over serial (115200 baud):

```json
{"N":<command>,"H":"<tag>","D1":<val>,"D2":<val>,"T":<ttl>}
```

### Commands

| N | Command | Parameters | Response | Description |
|---|---------|------------|----------|-------------|
| 0 | Hello | H=tag | `{<tag>_ok}` | Handshake/ping |
| 21 | Read Ultrasonic | H=tag | `{<tag>_<cm>}` | Distance in cm |
| 22 | Read Line Sensors | H=tag | `{<tag>_L_M_R}` | Line sensor values |
| 23 | Read Battery | H=tag | `{<tag>_<mV>}` | Battery voltage |
| 120 | Diagnostics | H=tag | Multi-line | Debug state dump |
| 200 | Setpoint | D1=v, D2=w, T=ttl | (none) | Streaming motion |
| 201 | Stop | H=tag | `{<tag>_ok}` | Immediate stop |
| 210 | Macro Start | D1=id, H=tag | `{<tag>_ok}` | Start macro |
| 211 | Macro Cancel | H=tag | `{<tag>_ok}` | Cancel macro |
| 300 | Servo | D1=angle, H=tag | `{<tag>_ok}` | Set servo angle |
| 999 | Direct Motor | D1=L, D2=R, H=tag | `{<tag>_ok}` | Raw PWM control |

See [robot/firmware/zip_robot_uno/README.md](robot/firmware/zip_robot_uno/README.md) for full protocol documentation.

## API Endpoints

### Agent & Chat
- `POST /api/agent` - Main agent endpoint with tool calling

### Realtime Voice
- `GET /api/realtime/token` - Get ephemeral token for WebRTC
- `POST /api/realtime/bridge` - Bridge voice to orchestration

### Voice Fallback
- `POST /api/voice/transcribe` - STT using Whisper
- `POST /api/voice/speak` - TTS synthesis

### Memory
- `GET /api/memory/get` - Get memories
- `POST /api/memory/add` - Add memory
- `DELETE /api/memory/delete` - Delete memory

### Notes
- `POST /api/notes/create` - Create note
- `GET /api/notes/list` - List notes
- `POST /api/notes/search` - Search notes
- `DELETE /api/notes/delete` - Delete note

### Timers
- `POST /api/timers/create` - Create timer
- `DELETE /api/timers/cancel` - Cancel timer

### Tools
- `POST /api/tools/web_search` - Web search
- `POST /api/tools/fetch_url` - Fetch URL content
- `POST /api/tools/vision` - Analyze image
- `POST /api/tools/docs/ingest` - Ingest document
- `POST /api/tools/docs/search` - Search documents
- `POST /api/tools/docs/answer` - Answer from documents

All endpoints support rate limiting and return JSON responses with proper error handling.

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

### OpenAI Models

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_REALTIME_MODEL` | `gpt-4o-realtime-preview-2024-12-17` | Realtime voice model |
| `OPENAI_RESPONSES_MODEL` | `gpt-4o` | Chat/reasoning model |
| `OPENAI_VISION_MODEL` | `gpt-4o` | Vision API model |
| `OPENAI_TTS_MODEL` | `gpt-4o-mini-tts-2025-12-15` | TTS model |
| `OPENAI_STT_MODEL` | `whisper-1` | STT model |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model |

### HUD Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ZIP_REALTIME_ENABLED` | `true` | Enable Realtime WebRTC |
| `ZIP_VOICE_FALLBACK_ENABLED` | `true` | Enable STT/TTS fallback |
| `ZIP_UPDATE_INTERVAL_MS` | `2000` | Panel update interval |
| `PRINTER_API_URL` | `http://169.254.178.90` | 3D printer API URL |

## Project Structure

```
zip/
├── robot/                      # Robot integration
│   ├── firmware/
│   │   ├── zip_robot_uno/      # Arduino UNO firmware
│   │   │   ├── src/            # Source files
│   │   │   ├── include/        # Headers
│   │   │   ├── tools/          # Test utilities
│   │   │   └── README.md       # Firmware documentation
│   │   └── zip_esp32_cam/      # ESP32-CAM firmware (in development)
│   ├── bridge/
│   │   └── zip-robot-bridge/   # WebSocket-to-Serial bridge
│   │       ├── src/            # Bridge source
│   │       └── README.md       # Bridge documentation
│   └── tools/                  # Testing and diagnostic utilities
├── app/                        # Next.js HUD application
│   ├── api/                    # API routes
│   │   ├── agent/              # Main agent endpoint
│   │   ├── realtime/           # Realtime endpoints
│   │   ├── voice/              # Voice fallback endpoints
│   │   ├── memory/             # Memory endpoints
│   │   ├── notes/              # Notes endpoints
│   │   ├── timers/             # Timer endpoints
│   │   └── tools/              # Tool endpoints
│   ├── (hud)/                  # Main HUD page
│   └── robot/                  # Robot control page
├── components/                 # React components
│   ├── hud/                    # HUD-specific components
│   │   ├── TopBar.tsx          # Top navigation bar
│   │   ├── LeftRail.tsx        # Left panel rail
│   │   ├── RightChat.tsx       # Chat interface
│   │   ├── CenterCore.tsx      # Center display
│   │   └── panels/             # Panel components
│   └── robot/                  # Robot control components
│       ├── ConnectionStatus.tsx
│       ├── MotionControl.tsx
│       ├── MotorGauges.tsx
│       ├── SensorDisplay.tsx
│       ├── SerialConsole.tsx
│       └── ServoControl.tsx
├── hooks/                      # React hooks
│   ├── useChat.ts              # Chat hook
│   ├── useRealtime.ts          # Realtime hook
│   ├── useRobot.ts             # Robot bridge hook
│   ├── usePanelUpdates.ts      # Panel update hook
│   └── useTTS.ts               # TTS fallback hook
├── lib/                        # Core libraries
│   ├── robot/                  # Robot client
│   │   ├── client.ts           # Browser WebSocket client
│   │   ├── server-client.ts    # Server-side HTTP client
│   │   ├── wifi-client.ts      # Direct WiFi client
│   │   └── types.ts            # Robot type definitions
│   ├── events/                 # Event bus system
│   ├── orchestrators/          # AI orchestration
│   │   ├── brain.ts            # Main orchestration graph
│   │   ├── nodes/              # Orchestration nodes
│   │   └── utils/              # Utilities
│   ├── tools/                  # Tool registry and executor
│   │   ├── registry.ts         # Tool registry
│   │   ├── executor.ts         # Tool executor
│   │   └── implementations/    # Tool implementations
│   ├── memory/                 # Memory management
│   ├── observability/          # Tracing and audit
│   ├── openai/                 # OpenAI integration
│   └── voice/                  # Voice system
├── scripts/                    # Utility scripts
├── docs/                       # Documentation
│   ├── agents/                 # Agent guides
│   └── docker/                 # Docker documentation
└── data/                       # Runtime data (auto-created)
    ├── audit.log               # Audit logs
    ├── traces/                 # Trace files
    ├── memory.db               # Memory database
    ├── notes.db                # Notes database
    └── docs.db                 # Documents database
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
| Motor Standby | D3 |
| Ultrasonic | D13 (Trig), D12 (Echo) |
| Servo | D10 |
| Line Sensors | A0, A1, A2 |
| Battery | A3 |
| I2C (IMU) | A4 (SDA), A5 (SCL) |

See [robot/firmware/zip_robot_uno/README.md](robot/firmware/zip_robot_uno/README.md) for detailed pin mapping.

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

# Orchestration tests
npx tsx scripts/test-api-orchestration.ts

# Brain integration tests
npx tsx scripts/test-brain-integration.ts

# Voice fallback tests
npx tsx scripts/test-voice-fallback.ts

# Eval harness (20 test prompts)
npx tsx scripts/eval-harness.ts
```

## Security

### API Key Protection
- All OpenAI API calls are server-side
- Realtime token endpoint uses server-side WebSocket proxy

### Tool Security
- Tool execution strictly whitelisted via registry
- Input/output validation using Zod schemas
- Permission-based access control (READ/WRITE/ACT/ADMIN)
- User confirmation required for ACT-tier tools
- URL and file path sanitization

### Rate Limiting
- In-memory rate limiter for all endpoints
- Default: 100 requests/minute per IP

### Audit & Tracing
- Every tool call logged to `./data/audit.log`
- Request-scoped tracing in `./data/traces/`
- Request IDs and step IDs for debugging

## Development Status

**Version**: 0.1.0

### Robot - Completed
- ✅ Arduino firmware with motion control
- ✅ WebSocket bridge server
- ✅ HUD with real-time telemetry
- ✅ Voice control integration
- ✅ AI tool orchestration for robot commands
- ✅ Sensor reading and display
- ✅ IMU integration (MPU6050)
- ✅ Servo control
- ✅ Drive safety layer (battery-aware, deadband, ramping)

### Robot - In Development
- 🔄 ESP32-CAM integration for robot vision
- 🔄 Autonomous navigation modes
- 🔄 Path planning and mapping

### HUD - Completed
- ✅ Voice and text interaction
- ✅ 39 tools with permission-based access
- ✅ AI orchestration with intelligent routing
- ✅ 3D printer integration (Moonraker/Klipper)
- ✅ Document intelligence with vector search
- ✅ Web research with citations
- ✅ Memory system
- ✅ Audit logging and tracing
- ✅ Docker deployment support

## Technology Stack

**Robot:**
- PlatformIO + Arduino framework
- ELEGOO Smart Robot Car V4.0
- TB6612FNG motor driver
- MPU6050 IMU
- ESP32-CAM (in development)

**Bridge:**
- Node.js + TypeScript
- WebSocket (ws)
- SerialPort

**HUD Frontend:**
- Next.js 16, React 19, TypeScript
- Tailwind CSS
- Three.js + React Three Fiber
- Framer Motion

**HUD Backend:**
- Next.js API Routes
- OpenAI API (Realtime, Responses, Vision, TTS, STT, Embeddings)
- SQLite (better-sqlite3)
- Zod validation

**AI & Orchestration:**
- LangGraph + LangChain
- OpenAI Embeddings
- Semantic similarity search

## Contributing

### For AI Agents

This project is configured for AI agent collaboration:

- **[Agent Guide](AGENT_GUIDE.md)** - Quick reference
- **[GitHub Copilot Instructions](.github/copilot-instructions.md)** - Copilot guide
- **Issue Templates** - `.github/ISSUE_TEMPLATE/`

### For Developers

1. Fork the repository
2. Create a feature branch
3. Follow patterns in `.cursorrules`
4. Run `npm run typecheck` and `npm run lint`
5. Submit a pull request

## License

MIT
