# Cursor Agent Context - ZIP Project

This document provides comprehensive project context for Cursor Agent when working on the ZIP project.

## Project Overview

ZIP is a production-grade, state-of-the-art (2026) Jarvis-style HUD assistant built with Next.js, TypeScript, and Tailwind CSS. It features:

- **Realtime Voice Interface**: OpenAI Realtime WebRTC with barge-in support
- **AI Brain Orchestration**: Node-based intelligent request routing
- **Multi-Modal Interaction**: Voice, text chat, and vision (webcam analysis)
- **HoloFace Display**: Advanced 3D holographic face with state-driven animations
- **Memory System**: User-controlled pinned memory with natural language commands
- **Document Intelligence**: PDF ingestion, vector search, and Q&A
- **Web Research**: Automated research pipeline with source validation
- **Comprehensive Tool Ecosystem**: 20+ tools with permission-based access

## Architecture Overview

### Event-Driven Architecture

**CRITICAL**: All UI state changes MUST flow through the typed event bus.

- **Event Bus**: `lib/events/bus.ts` - Central event system
- **Event Types**: `lib/events/types.ts` - Typed event definitions
- **Pattern**: `User Input → Event Bus → State Reducer → UI Updates`
- **Never mutate state directly** - always emit events

Key events:
- `zip.state` - Zip state changes (IDLE, LISTENING, THINKING, SPEAKING, TOOL_RUNNING, ERROR)
- `panel.update` - Panel data updates (system_stats, weather, etc.)
- `tool.card` - Tool execution results
- `conversation.message` - Chat messages

### AI Brain Orchestration

**Entry Point**: `lib/orchestrators/brain.ts` - `orchestrateConversation()`

All conversation requests route through this unified orchestration system:

1. **Input Node**: Validates input, loads pinned memory
2. **Memory Command Node**: Handles explicit memory operations
3. **Route Node**: Analyzes request intent and selects routing path
4. **Execution Nodes**: Research, workflow, or direct tool calling
5. **Response Node**: Formats final response

**Sub-Graphs**:
- **Research Graph**: `lib/orchestrators/nodes/research-graph.ts`
  - Chains: `web_search → fetch_url → summarize_sources`
  - For current information requests
- **Workflow Graph**: `lib/orchestrators/nodes/workflow-graph.ts`
  - Chains: `planner → executor → narrator`
  - For complex multi-step tasks

**State Management**: Uses `OrchestrationState` type with LangGraph StateGraph pattern

### Tool Registry Pattern

**Location**: `lib/tools/registry.ts`

All tools MUST be registered with:
- `name`: snake_case identifier
- `description`: Clear description for AI
- `inputSchema`: Zod schema for validation
- `outputSchema`: Zod schema for type safety
- `permissionTier`: READ | WRITE | ACT | ADMIN
- `execute`: Implementation function

**Tool Executor**: `lib/tools/executor.ts`
- Handles permission checks
- Automatic audit logging
- Tracing support
- Timeout protection
- Error handling

**Tool Implementations**: `lib/tools/implementations/`
- Each tool in its own file
- Exports input/output schemas
- Implements tool logic
- Uses observability.trace() for tracing

### Permission Tiers

- **READ**: Safe read-only operations
  - Examples: `get_system_stats`, `get_weather`, `web_search`
- **WRITE**: Data modification operations
  - Examples: `create_note`, `ingest_document`
- **ACT**: Actions requiring user confirmation
  - Examples: `open_url`, `create_timer`, `set_camera_enabled`
  - MUST request confirmation via chat before execution
- **ADMIN**: Administrative operations (not implemented yet)

## Key Design Decisions

1. **Event-Driven**: All state changes via typed event bus
2. **Type Safety**: TypeScript strict mode + Zod schemas
3. **Schema-First**: All tool calls use structured outputs
4. **Node-Based Orchestration**: Unified AI Brain for routing
5. **Permission-Based**: READ/WRITE/ACT/ADMIN tiers
6. **Production-Grade**: Error handling, logging, tracing, rate limiting
7. **Web-Only**: All integrations web-safe
8. **No UI Changes**: Features work behind existing UI
9. **Context Filtering**: Semantic similarity for token efficiency
10. **Modern 3D**: Procedural geometry, custom shaders, post-processing

## Technology Stack

### Frontend
- Next.js 14 (App Router)
- React 18 with TypeScript
- Tailwind CSS
- Three.js + React Three Fiber + drei + postprocessing
- Framer Motion

### Backend
- Next.js API Routes (server-side only)
- OpenAI API (Realtime, Responses, Vision, TTS, STT, Embeddings)
- SQLite (better-sqlite3)
- Zod for validation

### AI & Orchestration
- Custom node-based orchestration (LangGraph-inspired)
- Semantic similarity for context filtering
- Vector embeddings for document search

## File Structure

```
app/                    # Next.js app directory
  api/                  # API routes (one route per file)
components/             # React components
  hud/                  # HUD-specific components
hooks/                  # React hooks (use* prefix)
lib/                    # Core libraries
  events/               # Event bus system
  memory/               # Memory management
  observability/        # Tracing and audit
  openai/               # OpenAI integration
  orchestrators/        # AI Brain orchestration
    brain.ts            # Main orchestration graph
    nodes/              # Orchestration nodes
    utils/              # Utilities (context-filter, etc.)
  tools/                # Tool registry and executor
    registry.ts         # Tool registry
    executor.ts         # Tool executor
    implementations/    # Tool implementations
  voice/                # Voice system
  utils/                # Utility functions
scripts/                # Utility scripts (npx tsx scripts/...)
data/                   # Runtime data (auto-created)
```

## Common Patterns

### Adding a New Tool

1. Define schemas in `lib/tools/implementations/my-tool.ts`
2. Implement the tool function
3. Register in `lib/tools/registry.ts`
4. Create API endpoint (optional) in `app/api/tools/my_tool/route.ts`

### Event Emission

```typescript
import { eventBus } from "@/lib/events/bus";

// Emit state change
eventBus.emit("zip.state", { state: "LISTENING" });

// Emit panel update
eventBus.emit("panel.update", { panel: "system_stats", data: stats });

// Emit tool result
eventBus.emit("tool.card", { tool: "get_weather", result: weatherData });
```

### API Route Pattern

```typescript
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/middleware/rate-limit";
import { z } from "zod";

const inputSchema = z.object({ /* ... */ });

export async function POST(req: NextRequest) {
  const rateLimitResult = await rateLimit(req);
  if (!rateLimitResult.success) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const body = await req.json();
  const input = inputSchema.parse(body);

  try {
    const result = await implementation(input);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

## Security Requirements

- **Input Validation**: ALL inputs validated with Zod schemas
- **URL Sanitization**: Reject `file://`, `javascript:`, `data:` protocols
- **File Size Limits**: Documents max 1MB, content truncated at 10KB
- **Timeout Protection**: External fetches max 10s default, 30s for tools
- **API Key Protection**: NEVER expose API keys to client
- **Prompt Injection Defense**: Tool outputs are data only
- **Rate Limiting**: In-memory rate limiter (100 requests/minute per IP)

## Testing Requirements

- **Type Checking**: `npm run typecheck` must pass
- **Linting**: `npm run lint` must pass
- **E2E Tests**: `npm run test:e2e` must pass
- **Tool Tests**: Test via API endpoint if adding a tool

## Important Files

- `.cursorrules` - Comprehensive project rules
- `README.md` - Project documentation
- `lib/tools/registry.ts` - Tool registry (see existing tools)
- `lib/orchestrators/brain.ts` - Main orchestration
- `lib/events/bus.ts` - Event bus system
- `lib/tools/executor.ts` - Tool executor
- `docs/agents/README.md` - Agent onboarding
- `docs/agents/architecture.md` - Architecture details
- `docs/agents/development-workflow.md` - Development workflow

## Memory System

- **Pinned Memory**: User-controlled only (explicit "remember" commands)
- **Storage**: SQLite (`./data/memory.db`)
- **Commands**: "remember X", "forget X", "what do you remember"
- **Integration**: Automatically loaded into system prompt context
- **Audit Logged**: All memory operations logged

## Observability

- **Audit Logging**: `./data/audit.log` (JSONL format)
- **Tracing**: `./data/traces/` (daily JSONL files)
- **Request Tracking**: Request IDs and step IDs
- **Non-blocking**: Queued writes for performance

## Design Tokens

- Background: `#0B1924`
- Panel surface: `#091016`
- Border: `rgba(60,180,220,0.20)`
- Accent cyan: `#27B4CD`
- Text primary: `#A7C6D3`
- Text muted: `#6F8E9B`
- Online green: `#2EE59D`

## When Working on Tasks

1. Read task description carefully
2. Check acceptance criteria
3. Review similar implementations
4. Follow patterns described above
5. Write tests for new functionality
6. Update documentation if needed
7. Ensure all checks pass

Remember: This is a production-grade system. Always prioritize type safety, error handling, security, and observability.

