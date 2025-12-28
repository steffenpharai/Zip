# VRM AI Control Integration

## Overview

The VRM avatar control system is fully integrated with the LangGraph orchestrator and frontend. The AI can now understand and control the VRM avatar through natural language commands.

## Architecture

### Command Flow

```
User Message
    ↓
LangGraph Orchestrator (brain.ts)
    ↓
Tool Calling Node (tool-calling.ts)
    ↓
VRM Tool Implementation (vrm-control.ts)
    ↓
Command Queue API (/api/vrm/command)
    ↓
Client Polling (useVRMControl hook)
    ↓
VRM Component (ZipFaceStage.tsx)
    ↓
Visual Update (Three.js/React Three Fiber)
```

### State Flow

```
VRM Component
    ↓
State Reporting (every 2 seconds)
    ↓
State API (/api/vrm/state)
    ↓
Server-side State Storage
    ↓
AI Tool Access (direct memory access)
```

## Available Tools

### 1. `get_vrm_info` (READ)
**Purpose**: Query VRM structure and current state

**Returns**:
- Available bones (20 humanoid bones)
- Available blend shapes (4 accessible: Surprised, aa, oh, ee)
- Current bone positions and rotations
- Current blend shape values

**Example Usage**:
- "What bones are available on the avatar?"
- "Show me the current VRM state"
- "What expressions can I use?"

### 2. `set_vrm_bone` (ACT)
**Purpose**: Rotate a single bone

**Parameters**:
- `boneName`: One of 20 humanoid bones
- `rotationX`, `rotationY`, `rotationZ`: Rotation values (radians or degrees)
- `useDegrees`: Optional, default false (radians)

**Example Usage**:
- "Turn the head to the left"
- "Raise the right arm"
- "Bend the left knee 45 degrees"

### 3. `set_vrm_expression` (ACT)
**Purpose**: Set facial expression or mouth shape

**Parameters**:
- `blendShapeName`: One of available expressions (Surprised, aa, oh, ee)
- `value`: 0.0 (inactive) to 1.0 (fully active)

**Example Usage**:
- "Make the avatar look surprised"
- "Open the mouth"
- "Set expression to 0.5"

### 4. `set_vrm_pose` (ACT)
**Purpose**: Create complex poses with multiple bones

**Parameters**:
- `pose`: Array of bone rotations
  - Each item: `{ boneName, rotationX, rotationY, rotationZ, useDegrees? }`

**Example Usage**:
- "Make the avatar wave"
- "Create a pointing pose"
- "Stand in a T-pose"

### 5. `reset_vrm_pose` (ACT)
**Purpose**: Reset all bones to default/neutral position

**Example Usage**:
- "Reset the avatar pose"
- "Return to neutral position"
- "Stand normally"

## Available Bones

### Spine Chain
- `hips` - Base of skeleton
- `spine` - Lower spine
- `chest` - Upper chest
- `upperChest` - Upper chest/clavicle
- `neck` - Neck base
- `head` - Head bone

### Left Arm
- `leftShoulder` - Left shoulder/clavicle
- `leftUpperArm` - Left upper arm
- `leftLowerArm` - Left forearm
- `leftHand` - Left hand/wrist

### Right Arm
- `rightShoulder` - Right shoulder/clavicle
- `rightUpperArm` - Right upper arm
- `rightLowerArm` - Right forearm
- `rightHand` - Right hand/wrist

### Left Leg
- `leftUpperLeg` - Left thigh
- `leftLowerLeg` - Left shin/calf
- `leftFoot` - Left foot/ankle

### Right Leg
- `rightUpperLeg` - Right thigh
- `rightLowerLeg` - Right shin/calf
- `rightFoot` - Right foot/ankle

## Available Expressions

- **Surprised** - Surprised facial expression (0.0-1.0)
- **aa** - Open mouth "ah" sound (0.0-1.0)
- **oh** - Round mouth "oh" sound (0.0-1.0)
- **ee** - Smile mouth "ee" sound (0.0-1.0)

## Rotation System

### Coordinate System
- **X-axis**: Pitch (nodding up/down)
- **Y-axis**: Yaw (turning left/right)
- **Z-axis**: Roll (tilting left/right)

### Units
- **Default**: Radians
- **Degrees**: Set `useDegrees: true` in tool call

### Rotation Limits
All rotations are automatically clamped to safe ranges to prevent unnatural poses. See `lib/vrm/vrm-knowledge.ts` for specific limits per bone.

## Example Commands

### Simple Movements
- "Turn your head to the right"
- "Raise your left arm"
- "Look up"
- "Bend your right knee"

### Complex Poses
- "Wave with your right hand"
- "Point forward with your right arm"
- "Stand in a T-pose"
- "Put your hands on your hips"

### Expressions
- "Look surprised"
- "Open your mouth"
- "Make an 'oh' expression"

### Queries
- "What bones can you move?"
- "What's your current pose?"
- "Show me available expressions"

## Frontend Integration

### Visual Feedback
- **Activity Tracker**: Shows "Moving avatar bone", "Setting avatar expression", etc.
- **Toast Notifications**: Success/error messages for VRM tool execution
- **Real-time Updates**: VRM responds immediately to commands

### State Reporting
- VRM component reports state every 2 seconds
- State includes all bone positions/rotations and blend shape values
- AI can query current state via `get_vrm_info`

## Technical Details

### Command Queue
- Commands stored in-memory per session
- Client polls every 100ms for new commands
- Commands expire after 30 seconds
- Automatic cleanup of old sessions

### State Storage
- State stored in-memory per session
- State persists for 5 minutes
- Latest state accessible to AI tools
- Automatic cleanup of old states

### Session Management
- Session ID generated from IP + User-Agent
- Multiple sessions supported (future: multi-user)
- Each session has independent command queue and state

## Testing

### Manual Testing
1. Open the application in browser
2. Type a VRM control command in chat
3. Observe:
   - Activity message updates
   - VRM avatar movement
   - Toast notification (if applicable)
   - Tool result in response

### Example Test Commands
```
"Get VRM info"
"Turn your head 30 degrees to the right"
"Raise your right arm"
"Make a surprised expression"
"Reset your pose"
```

## Integration Points

### LangGraph Orchestrator
- **File**: `lib/orchestrators/brain.ts`
- **Node**: `directToolNode` → `toolCallingNode`
- **Tools**: Automatically loaded from `toolRegistry`

### Tool Registry
- **File**: `lib/tools/registry.ts`
- **VRM Tools**: Lines 304-347
- **Access**: Via `getAllTools()` in tool-calling node

### Frontend
- **Component**: `components/hud/ZipFaceStage.tsx`
- **Hook**: `hooks/useVRMControl.ts`
- **API**: `/api/vrm/command`, `/api/vrm/commands`, `/api/vrm/state`

### System Prompt
- **File**: `lib/openai/prompts.ts`
- **Section**: VRM Avatar Control (lines 52-62)
- **Purpose**: Instructs AI on VRM tool usage

## Error Handling

- Invalid bone names: Tool returns error, AI can retry with correct name
- Invalid rotation values: Automatically clamped to safe ranges
- Invalid expression values: Clamped to 0.0-1.0 range
- Missing VRM state: Returns default/empty state
- Command timeout: Commands expire after 30 seconds

## Future Enhancements

- Multi-user support (session-based command queues)
- Animation sequences (chained poses over time)
- Gesture recognition (trigger poses from voice commands)
- Physics-based movement (natural motion interpolation)
- Expression blending (smooth transitions between expressions)

## Documentation

- **VRM Structure**: `docs/VRM_STRUCTURE.md` - Complete bone/expression documentation
- **VRM Knowledge**: `lib/vrm/vrm-knowledge.ts` - Rotation limits and safe ranges
- **Tool Implementation**: `lib/tools/implementations/vrm-control.ts` - Tool logic

