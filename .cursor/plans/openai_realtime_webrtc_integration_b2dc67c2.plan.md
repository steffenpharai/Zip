---
name: OpenAI Realtime WebRTC Integration
overview: Replace the existing WebSocket-based Realtime implementation with a production-grade OpenAI Realtime WebRTC integration that bridges to the LangGraph AI Brain, supports barge-in, and includes a robust STT/TTS fallback path—all while keeping the HUD UX pixel-perfect and unchanged.
todos:
  - id: token-endpoint
    content: Update /api/realtime/token to use OpenAI SDK for ephemeral token generation with sessionId mapping
    status: completed
  - id: bridge-endpoint
    content: Create /api/realtime/bridge endpoint that calls orchestrateConversation and returns assistantText + events
    status: completed
    dependencies:
      - token-endpoint
  - id: stt-tts-libs
    content: Create lib/openai/stt.ts and lib/openai/tts.ts for fallback voice pipeline
    status: completed
  - id: voice-endpoints
    content: Create /api/voice/transcribe and /api/voice/speak endpoints for fallback mode
    status: completed
    dependencies:
      - stt-tts-libs
  - id: voice-persona
    content: Create lib/voice/voicePersona.ts with Zip persona system instructions
    status: completed
  - id: webrtc-client
    content: Implement WebRTC-based Realtime client in lib/openai/realtime_webrtc.ts (or replace realtime.ts)
    status: completed
    dependencies:
      - voice-persona
  - id: realtime-hook
    content: Rewrite hooks/useRealtime.ts to use WebRTC client, bridge integration, barge-in, and fallback
    status: completed
    dependencies:
      - webrtc-client
      - bridge-endpoint
      - voice-endpoints
  - id: event-bridge
    content: Create lib/voice/eventBridge.ts helper to convert orchestrator results to event bus events
    status: completed
    dependencies:
      - bridge-endpoint
  - id: env-docs
    content: Update .env.example and README.md with new environment variables and architecture documentation
    status: completed
    dependencies:
      - realtime-hook
  - id: tests
    content: Add test-voice-fallback.ts script and ensure all existing tests pass
    status: completed
    dependencies:
      - voice-endpoints
      - token-endpoint
---

# OpenAI Realtime WebRTC Integration Plan

## Overview

This plan implements a world-class voice integration by replacing the current WebSocket-based Realtime client with OpenAI Realtime WebRTC, creating a bridge to the LangGraph orchestration system, and adding a fallback STT/TTS pipeline—all without changing any visible UI.

## Architecture Flow

```mermaid
flowchart TD
    User[User speaks] --> Mic[Microphone]
    Mic --> Realtime[Realtime WebRTC Client]
    Realtime -->|transcript| Bridge[/api/realtime/bridge]
    Bridge -->|calls| Agent[/api/agent]
    Agent -->|orchestrates| Brain[LangGraph Brain]
    Brain -->|returns| Bridge
    Bridge -->|assistantText| Realtime
    Realtime -->|speech| Speaker[Audio Output]
    
    Realtime -.->|if fails| Fallback[STT/TTS Fallback]
    Fallback -->|transcribe| STT[/api/voice/transcribe]
    STT --> Agent
    Agent -->|speak| TTS[/api/voice/speak]
    TTS --> Speaker
```

## Implementation Tasks

### A. Server-Side: Ephemeral Token Endpoint

**File**: `app/api/realtime/token/route.ts`

- Replace current implementation with OpenAI SDK's `realtime.create()` method
- Generate server-side UUID for `sessionId`
- Return structure:
  ```typescript
  {
    sessionId: string,
    realtimeModel: string,
    expiresAt: number,
    ephemeralKey: string  // or whatever the SDK returns
  }
  ```

- Store `sessionId` mapping in in-memory Map for bridge support
- Add rate limiting (reuse existing middleware)
- Handle missing `OPENAI_API_KEY` gracefully

### B. Server-Side: Realtime Bridge Endpoint

**File**: `app/api/realtime/bridge/route.ts` (NEW)

- Accept POST with:
  ```typescript
  {
    sessionId: string,
    userTranscript: string,
    conversationSnapshot?: Array<{role, content}>,
    source: "voice"
  }
  ```

- Call `orchestrateConversation()` directly (function call, not HTTP loopback)
- Pass `{ sessionId, message: userTranscript, source: "voice" }` to orchestrator
- Return:
  ```typescript
  {
    assistantText: string,
    events: Array<{type, ...}>  // for event bus
  }
  ```

- Handle confirmation gates: if `requiresConfirmation`, format assistantText as yes/no question
- Add timeout (30s default)
- Add rate limiting
- Include audit logging with transcript (redact if needed)

### C. Server-Side: Fallback STT/TTS Endpoints

**Files**:

- `app/api/voice/transcribe/route.ts` (NEW)
- `app/api/voice/speak/route.ts` (NEW)
- `lib/openai/stt.ts` (NEW)
- `lib/openai/tts.ts` (NEW)

**STT Implementation**:

- Use OpenAI `audio.transcriptions.create()` API
- Accept multipart/form-data with audio file
- Return `{ transcript: string }`
- Handle errors gracefully

**TTS Implementation**:

- Use OpenAI `audio.speech.create()` API
- Accept `{ text: string, voice?: string }`
- Return audio buffer (base64 or binary)
- Use voice persona settings

### D. Server-Side: Voice Persona

**File**: `lib/voice/voicePersona.ts` (NEW)

- Define system instructions for "Zip" persona based on JARVIS voice Iron Man.  You must try to mimic this.
  - Calm, precise, confident, warm
  - Slightly slower pace, crisp diction
  - Short confirmations, brief status narration
  - No filler words, no chain-of-thought
- Export constants for Realtime session config and TTS voice settings

### E. Client-Side: WebRTC Realtime Client

**File**: `hooks/useRealtime.ts`

**Major Changes**:

1. Replace `RealtimeClientImpl` WebSocket logic with WebRTC:

   - Use OpenAI SDK's Realtime client (if available) OR implement WebRTC manually
   - Create `RTCPeerConnection`
   - Add microphone track via `getUserMedia`
   - Create reliable data channel for control/events
   - Negotiate SDP offer/answer with OpenAI Realtime using ephemeral token

2. Audio Playback:

   - Attach remote audio track to `<audio>` element OR WebAudio pipeline
   - Ensure single playback at a time (stop previous before starting new)

3. Barge-in Implementation:

   - Detect user speech while remote audio is playing (VAD or mic level)
   - Stop playback immediately on detection
   - Signal "interrupt" to Realtime session (if supported)
   - Otherwise: stop local playback and start sending mic audio

4. Turn Detection:

   - Use Realtime built-in turn detection (preferred) OR client-side VAD
   - When turn ends, capture final transcript from Realtime events

5. Bridge Integration:

   - When user turn ends with final transcript, call `/api/realtime/bridge`
   - Dispatch returned `events[]` to event bus (panel.update, tool.card, zip.state, chat.message, toast)
   - Send returned `assistantText` back into Realtime as "assistant message" for speech generation
   - Emit user transcript as `chat.message` event

6. State Management:

   - Mic toggled on → `zip.state = LISTENING`
   - User turn ends, bridge called → `zip.state = THINKING`
   - Tools executing → `zip.state = TOOL_RUNNING` (from orchestrator events)
   - Assistant speech begins → `zip.state = SPEAKING`
   - Assistant finishes → `zip.state = IDLE` (or WAKE_LISTEN)
   - Error → `zip.state = ERROR` + toast

7. Fallback Mode:

   - If WebRTC fails to connect OR token fails:
     - Record audio blob when mic is used
     - Send to `/api/voice/transcribe`
     - Send transcription to `/api/agent`
     - Send assistantText to `/api/voice/speak`
     - Play returned audio buffer
   - Same mic button, invisible to UI

8. Unified Conversation History:

   - Voice turns append to same chat history state as typed chat
   - Use `sessionId` as common key
   - "Clear" resets both voice and text history + session mapping

### F. Client-Side: Realtime WebRTC Library

**File**: `lib/openai/realtime_webrtc.ts` (NEW) OR replace `lib/openai/realtime.ts`

- Implement WebRTC-based Realtime client
- Use OpenAI SDK's Realtime API if it supports WebRTC
- Otherwise, implement manual WebRTC connection:
  - RTCPeerConnection setup
  - SDP negotiation with OpenAI Realtime endpoint
  - Audio track management
  - Data channel for events
- Handle connection lifecycle (connect, disconnect, reconnect)
- Emit events: transcript, audio, tool calls, state changes

### G. Event Bridge Helper

**File**: `lib/voice/eventBridge.ts` (NEW) - Optional helper

- Utility to convert orchestrator results to event bus events
- Map tool results to `panel.update` and `tool.card` events
- Handle different tool types (system stats, weather, research, etc.)

### H. Environment Variables

**Update**: `.env.example` (if exists) or document in README

Add:

- `OPENAI_REALTIME_MODEL` (default: `gpt-4o-realtime-preview-2024-12-17`)
- `OPENAI_RESPONSES_MODEL` (already exists)
- `OPENAI_TTS_MODEL` (optional, default: `tts-1`)
- `OPENAI_STT_MODEL` (optional, default: `whisper-1`)
- `ZIP_REALTIME_ENABLED=true/false` (feature flag)
- `ZIP_VOICE_FALLBACK_ENABLED=true/false` (feature flag)

### I. README Updates

**File**: `README.md`

- Update "Realtime WebRTC" section to accurately describe WebRTC implementation
- Document `/api/realtime/token` as "ephemeral token provider for WebRTC"
- Document `/api/realtime/bridge` endpoint
- Document fallback STT/TTS endpoints
- Update environment variables section
- Keep all other content unchanged

### J. Testing

**Files**:

- `scripts/test-voice-fallback.ts` (NEW) - Optional but preferred

**Test Requirements**:

1. `/api/voice/transcribe` test:

   - Call with small audio fixture
   - Returns string OR structured "not configured" error if keys missing

2. `/api/realtime/token` test:

   - Returns `{ sessionId, realtimeModel, expiresAt, ephemeralKey }` when `OPENAI_API_KEY` present
   - Returns error when key missing

3. Existing tests must still pass:

   - `npm run typecheck`
   - `npm run lint`
   - Playwright HUD test

## Key Implementation Notes

1. **WebRTC vs WebSocket**: The user specifically wants WebRTC. OpenAI's Realtime API may use WebSocket under the hood, but we should use the official SDK's Realtime client which abstracts the connection. If the SDK doesn't support WebRTC directly, we'll need to implement WebRTC manually using RTCPeerConnection and negotiate with OpenAI's Realtime endpoint.

2. **Bridge Pattern**: The bridge endpoint ensures Realtime never bypasses orchestration. All voice requests go: Realtime → Bridge → LangGraph → Bridge → Realtime.

3. **Event Emission**: The bridge must return events that the client can dispatch to the existing event bus. This maintains UI consistency.

4. **State Mapping**: All state transitions must match existing Zip states exactly to preserve HUD animations.

5. **No UI Changes**: Absolutely no changes to components, styling, layout, or design tokens.

6. **Production Quality**: Proper error handling, timeouts, rate limiting, audit logging, and graceful fallbacks.

## Files to Create

- `app/api/realtime/bridge/route.ts`
- `app/api/voice/transcribe/route.ts`
- `app/api/voice/speak/route.ts`
- `lib/openai/stt.ts`
- `lib/openai/tts.ts`
- `lib/openai/realtime_webrtc.ts` (or replace `lib/openai/realtime.ts`)
- `lib/voice/voicePersona.ts`
- `lib/voice/eventBridge.ts` (optional helper)
- `scripts/test-voice-fallback.ts` (optional)

## Files to Modify

- `hooks/useRealtime.ts` (major rewrite for WebRTC + bridge + fallback)
- `app/api/realtime/token/route.ts` (real ephemeral token using SDK)
- `README.md` (update Realtime section, add new endpoints, env vars)

## Files NOT to Modify

- Any HUD layout components
- Design tokens
- Event types (except adding optional fields without breaking consumers)
- State machine structure (only state transitions)
- UI styling or layout

## Acceptance Criteria

- [ ] Voice uses WebRTC-based Realtime when enabled
- [ ] End-to-end flow works: mic → speech → transcript → bridge → LangGraph → assistantText → spoken reply
- [ ] Barge-in works (interrupt while Zip is speaking)
- [ ] Tools invoked by voice work with same confirmation gates and emit same events
- [ ] If Realtime fails, fallback STT/TTS works seamlessly using same mic button
- [ ] No UI changes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] Existing Playwright HUD test passes
- [ ] Voice fallback test passes
- [ ] Realtime token test passes
- [ ] README accurately describes new architecture