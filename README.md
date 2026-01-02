# ZIP - Jarvis-style HUD Assistant

A Jarvis-style HUD assistant built with Next.js, TypeScript, and Tailwind CSS. ZIP provides a voice and text interface with OpenAI Realtime integration, tool calling, and an event-driven architecture.

## Features

- **🎤 Realtime Voice Interface**: Low-latency voice interactions via OpenAI Realtime WebRTC with barge-in support
- **🤖 AI Orchestration**: Intelligent request routing with research and workflow sub-graphs
- **💬 Multi-Modal Interaction**: Voice, text chat, and vision (webcam analysis) support
- **🧠 Memory System**: User-controlled pinned memory with natural language commands
- **📚 Document Intelligence**: PDF ingestion, vector search, and Q&A with citations
- **🌐 Web Research**: Automated research pipeline with source validation and citations
- **📝 Notes & Timers**: Full CRUD operations for notes and server-side timer reminders
- **🤖 Robot Control**: ELEGOO Smart Robot Car V4.0 integration via WebSocket bridge
- **🖨️ 3D Printer Control**: Moonraker/Klipper printer integration
- **🔒 Security**: Permission-based tool access, input validation, and audit logging
- **📊 Observability**: Comprehensive tracing, audit logs, and request tracking

## Documentation

| Document | Description |
|----------|-------------|
| [Agent Guide](AGENT_GUIDE.md) | Quick reference for AI agents |
| [Agent Onboarding](docs/agents/README.md) | Getting started for agents |
| [Architecture Guide](docs/agents/architecture.md) | System architecture details |
| [Development Workflow](docs/agents/development-workflow.md) | How to work on tasks |
| [Docker Guide](docs/docker/README.md) | Docker deployment documentation |
| [Windows Serial Port](docs/docker/WINDOWS_SERIAL_PORT.md) | Serial port setup on Windows |
| [Robot Firmware](robot/firmware/zip_robot_uno/README.md) | Arduino firmware documentation |
| [Robot Bridge](robot/bridge/zip-robot-bridge/README.md) | WebSocket bridge server |

## Quickstart

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp example-env .env
   # Edit .env and add your OPENAI_API_KEY
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Local Development

ZIP can be run as two independent services locally. This setup is useful for development and debugging.

### Prerequisites

- Node.js 18+
- npm or yarn
- `.env` file configured (see [Environment Variables](#environment-variables))
- Serial port available (if using robot bridge) or `LOOPBACK_MODE=true` for testing

### Service Architecture

1. **zip-app** (Next.js application)
   - Port: 3000
   - Health: `GET /api/health`

2. **robot-bridge** (Optional - Robot communication bridge)
   - WebSocket: 8765
   - HTTP: 8766
   - Health: `GET /health`

### Running Services

**Terminal 1 - ZIP App:**
```bash
npm run dev:local
```

**Terminal 2 - Robot Bridge (Optional):**
```bash
npm run dev:bridge
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev:local` | Start ZIP app in development mode |
| `npm run dev:bridge` | Start robot bridge in development mode |
| `npm run build:local` | Build ZIP app for production |
| `npm run build:bridge` | Build robot bridge for production |
| `npm run test:local` | Run full test suite |
| `npm run test:health` | Health check both services |
| `npm run test:integration` | Integration tests between services |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | Run ESLint |
| `npm run test:e2e` | Run Playwright E2E tests |

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

For detailed Docker documentation, see [docs/docker/README.md](docs/docker/README.md).

## Architecture Overview

### Event-Driven Architecture

ZIP uses a typed event bus system where all UI state changes flow through events:

```
User Input → Event Bus → State Reducer → UI Updates
                ↓
         Tool Executor → OpenAI API → Tool Results → Panel Updates
```

### Core Systems

| System | Location | Description |
|--------|----------|-------------|
| Event Bus | `lib/events/` | Typed event system for all UI state changes |
| State Machine | `lib/state/hudStore.ts` | HUD reducer managing Zip states |
| Tool Registry | `lib/tools/registry.ts` | Whitelisted tools with Zod schemas |
| Tool Executor | `lib/tools/executor.ts` | Executor with permissions, audit, tracing |
| AI Orchestration | `lib/orchestrators/brain.ts` | LangGraph-based orchestration system |
| Memory | `lib/memory/` | SQLite-based pinned memory |
| Observability | `lib/observability/` | Tracing and audit logging |

### OpenAI Integration

ZIP uses a two-model approach:

1. **Realtime Model**: Low-latency voice interactions via WebRTC
2. **Responses Model**: Stronger reasoning for planning and tool calling

## Tool Registry

### Permission Tiers

| Tier | Description | Example Tools |
|------|-------------|---------------|
| READ | Safe read-only operations | `get_system_stats`, `get_weather`, `web_search` |
| WRITE | Data modification | `create_note`, `ingest_document` |
| ACT | Requires user confirmation | `open_url`, `create_timer`, `robot_move` |
| ADMIN | Administrative operations | (reserved) |

### Available Tools (39 total)

**System & Info (READ)**
- `get_system_stats` - CPU, RAM, Disk usage
- `get_weather` - Weather with forecast and air quality
- `get_uptime` - System uptime and session stats

**Web & Research (READ)**
- `web_search` - Search the web for current information
- `fetch_url` - Fetch and extract content from URLs
- `summarize_sources` - Summarize multiple sources with citations

**Documents (READ/WRITE)**
- `ingest_document` - Ingest PDFs and text documents
- `doc_search` - Vector search across documents
- `doc_answer` - Answer questions from documents

**Notes & Timers (READ/WRITE/ACT)**
- `create_note`, `list_notes`, `search_notes`, `delete_note`
- `create_timer`, `cancel_timer`

**Vision (READ/ACT)**
- `analyze_image` - Analyze images using vision AI
- `set_camera_enabled` - Toggle camera state

**3D Printer (READ/ACT)** - 11 tools
- Status: `get_printer_status`, `get_printer_temperature`, `get_print_progress`, `list_printer_files`
- Control: `start_print`, `pause_print`, `resume_print`, `cancel_print`, `set_temperature`, `home_axes`, `move_axis`

**Robot Control (READ/ACT)** - 7 tools
- Status: `get_robot_status`, `get_robot_diagnostics`, `get_robot_sensors`
- Motion: `robot_move`, `robot_stop`, `robot_stream_start`, `robot_stream_stop`

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_REALTIME_MODEL` | `gpt-4o-realtime-preview-2024-12-17` | Realtime model |
| `OPENAI_RESPONSES_MODEL` | `gpt-4o` | Responses API model |
| `OPENAI_VISION_MODEL` | `gpt-4o` | Vision API model |
| `OPENAI_TTS_MODEL` | `gpt-4o-mini-tts-2025-12-15` | TTS model |
| `OPENAI_STT_MODEL` | `whisper-1` | STT model |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model |
| `ZIP_REALTIME_ENABLED` | `true` | Enable Realtime WebRTC |
| `ZIP_VOICE_FALLBACK_ENABLED` | `true` | Enable STT/TTS fallback |
| `ZIP_UPDATE_INTERVAL_MS` | `2000` | Panel update interval |
| `PRINTER_API_URL` | `http://169.254.178.90` | 3D printer API URL |
| `NEXT_PUBLIC_ROBOT_BRIDGE_WS_URL` | `ws://localhost:8765/robot` | Robot bridge WebSocket |
| `LOOPBACK_MODE` | `false` | Enable loopback mode for testing |

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

### Tools
- `POST /api/tools/web_search` - Web search
- `POST /api/tools/fetch_url` - Fetch URL content
- `POST /api/tools/vision` - Analyze image
- `POST /api/tools/docs/*` - Document operations

## Project Structure

```
zip/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   └── (hud)/             # HUD page
├── components/             # React components
│   ├── hud/               # HUD-specific components
│   └── robot/             # Robot control UI
├── hooks/                  # React hooks
├── lib/                    # Core libraries
│   ├── events/            # Event bus system
│   ├── orchestrators/     # AI orchestration
│   ├── tools/             # Tool registry and executor
│   ├── robot/             # Robot client
│   ├── memory/            # Memory management
│   └── observability/     # Tracing and audit
├── robot/                  # Robot integration
│   ├── bridge/            # WebSocket bridge server
│   └── firmware/          # Arduino firmware
├── scripts/                # Utility scripts
├── docs/                   # Documentation
│   ├── agents/            # Agent guides
│   └── docker/            # Docker documentation
└── data/                   # Runtime data (auto-created)
```

## Testing

### E2E Tests
```bash
npm run test:e2e
```

### Orchestration Tests
```bash
# Start dev server first
npm run dev

# In another terminal
npx tsx scripts/test-api-orchestration.ts
```

### Eval Harness
```bash
npx tsx scripts/eval-harness.ts
```

## Security

- **API Key Protection**: All OpenAI calls server-side
- **Input Validation**: Zod schemas for all inputs
- **Permission Tiers**: READ/WRITE/ACT/ADMIN access control
- **URL Sanitization**: Rejects unsafe protocols
- **Rate Limiting**: In-memory rate limiter (100 req/min default)
- **Audit Logging**: All tool calls logged to `./data/audit.log`

## Contributing

### For AI Agents

This project is configured for AI agent collaboration:

- **[Agent Guide](AGENT_GUIDE.md)** - Quick reference
- **[GitHub Copilot Instructions](.github/copilot-instructions.md)** - Copilot guide
- **Issue Templates** - `.github/ISSUE_TEMPLATE/`

### For Developers

1. Fork the repository
2. Create a feature branch
3. Make changes following the patterns in `.cursorrules`
4. Run `npm run typecheck` and `npm run lint`
5. Submit a pull request

## Current Status

**Version**: 0.1.0

**Features Complete**:
- ✅ Voice and text interaction
- ✅ 39 tools with permission-based access
- ✅ AI orchestration with intelligent routing
- ✅ 3D printer integration (Moonraker/Klipper)
- ✅ Robot integration (ELEGOO Smart Robot Car V4.0)
- ✅ Document intelligence with vector search
- ✅ Web research with citations
- ✅ Memory system
- ✅ Audit logging and tracing
- ✅ Docker deployment support

**In Development**:
- 🔄 ESP32-CAM integration for robot vision
- 🔄 Additional robot motion capabilities

## Technology Stack

**Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS, Three.js

**Backend**: Next.js API Routes, OpenAI API, SQLite, Zod

**AI & Orchestration**: LangGraph, LangChain, OpenAI Embeddings

**Robot**: PlatformIO, Arduino, WebSocket bridge

## License

MIT
