import { z } from "zod";
import { VRM_HUMANOID_BONES, VRM_BLEND_SHAPES, clampBoneRotation, clampBlendShapeValue } from "@/lib/vrm/vrm-knowledge";
import { commandQueues } from "@/lib/vrm/command-queue";
import { vrmStates } from "@/app/api/vrm/state/route";

// Get VRM state - access directly from shared state storage
// For server-side tools, we can access the state map directly
// We'll get the most recent state from any session
function getVRMStateFromStorage(): {
  bones: Record<string, any>;
  blendShapes: Record<string, number>;
  availableBones: string[];
  availableBlendShapes: string[];
} {
  // Get the most recent state from any session
  if (vrmStates.size === 0) {
    return {
      bones: {},
      blendShapes: {},
      availableBones: Array.from(VRM_HUMANOID_BONES),
      availableBlendShapes: Array.from(VRM_BLEND_SHAPES),
    };
  }

  // Find the most recent state
  let latestState = Array.from(vrmStates.values())[0];
  for (const state of vrmStates.values()) {
    if (state.timestamp > latestState.timestamp) {
      latestState = state;
    }
  }

  return {
    bones: latestState.bones,
    blendShapes: latestState.blendShapes,
    availableBones: latestState.availableBones.length > 0 
      ? latestState.availableBones 
      : Array.from(VRM_HUMANOID_BONES),
    availableBlendShapes: latestState.availableBlendShapes.length > 0
      ? latestState.availableBlendShapes
      : Array.from(VRM_BLEND_SHAPES),
  };
}

// Send VRM command - add directly to command queue for any active session
// We'll add to all active sessions so the client picks it up
async function sendVRMCommand(type: string, data: any): Promise<{ success: boolean; commandId?: string }> {
  try {
    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const command = {
      id: commandId,
      type: type as any,
      timestamp: Date.now(),
      data: data || {},
    };

    // Add to all active sessions (clients will poll and pick up commands)
    // In a real scenario, you might want to target a specific session
    // For now, we'll broadcast to all sessions
    let addedToAny = false;
    for (const [sessionId, queue] of commandQueues.entries()) {
      queue.push(command);
      addedToAny = true;
    }

    // If no active sessions, create a default one
    if (!addedToAny) {
      const defaultSessionId = "default";
      if (!commandQueues.has(defaultSessionId)) {
        commandQueues.set(defaultSessionId, []);
      }
      commandQueues.get(defaultSessionId)!.push(command);
    }

    return { success: true, commandId };
  } catch (error) {
    console.error("Error sending VRM command:", error);
    return { success: false };
  }
}

// Tool: Get VRM information
export const getVRMInfoSchema = z.object({});
export const getVRMInfoOutputSchema = z.object({
  availableBones: z.array(z.string()),
  availableBlendShapes: z.array(z.string()),
  currentBones: z.record(z.object({
    position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
    rotation: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  })),
  currentBlendShapes: z.record(z.number()),
  boneCount: z.number(),
  blendShapeCount: z.number(),
});

export async function getVRMInfo(): Promise<z.infer<typeof getVRMInfoOutputSchema>> {
  const state = getVRMStateFromStorage();
  
  return {
    availableBones: state.availableBones.length > 0 ? state.availableBones : Array.from(VRM_HUMANOID_BONES),
    availableBlendShapes: state.availableBlendShapes.length > 0 ? state.availableBlendShapes : Array.from(VRM_BLEND_SHAPES),
    currentBones: state.bones,
    currentBlendShapes: state.blendShapes,
    boneCount: state.availableBones.length || VRM_HUMANOID_BONES.length,
    blendShapeCount: state.availableBlendShapes.length || VRM_BLEND_SHAPES.length,
  };
}

// Tool: Set bone rotation
export const setVRMBoneSchema = z.object({
  boneName: z.enum(VRM_HUMANOID_BONES as any).describe("Name of the bone to rotate"),
  rotationX: z.number().optional().describe("Rotation around X axis in radians (or degrees if useDegrees is true)"),
  rotationY: z.number().optional().describe("Rotation around Y axis in radians (or degrees if useDegrees is true)"),
  rotationZ: z.number().optional().describe("Rotation around Z axis in radians (or degrees if useDegrees is true)"),
  useDegrees: z.boolean().optional().default(false).describe("If true, rotation values are in degrees (will be converted to radians)"),
});
export const setVRMBoneOutputSchema = z.object({
  success: z.boolean(),
  commandId: z.string().optional(),
  boneName: z.string(),
  rotation: z.object({ x: z.number(), y: z.number(), z: z.number() }),
});

export async function setVRMBone(
  input: z.infer<typeof setVRMBoneSchema>
): Promise<z.infer<typeof setVRMBoneOutputSchema>> {
  const { boneName, rotationX = 0, rotationY = 0, rotationZ = 0, useDegrees = false } = input;
  
  // Convert degrees to radians if needed
  const toRad = useDegrees ? (val: number) => (val * Math.PI) / 180 : (val: number) => val;
  
  let rotation = {
    x: toRad(rotationX),
    y: toRad(rotationY),
    z: toRad(rotationZ),
  };
  
  // Clamp to safe ranges
  rotation = clampBoneRotation(boneName, rotation);
  
  const result = await sendVRMCommand("set_bone_rotation", {
    boneName,
    rotation,
  });
  
  return {
    success: result.success,
    commandId: result.commandId,
    boneName,
    rotation,
  };
}

// Tool: Set blend shape
export const setVRMExpressionSchema = z.object({
  blendShapeName: z.string().describe("Name of the blend shape/expression (e.g., 'Blink', 'Fun', 'A', 'O')"),
  value: z.number().min(0).max(1).describe("Blend shape value from 0.0 to 1.0"),
});
export const setVRMExpressionOutputSchema = z.object({
  success: z.boolean(),
  commandId: z.string().optional(),
  blendShapeName: z.string(),
  value: z.number(),
});

export async function setVRMExpression(
  input: z.infer<typeof setVRMExpressionSchema>
): Promise<z.infer<typeof setVRMExpressionOutputSchema>> {
  const { blendShapeName, value } = input;
  
  const clampedValue = clampBlendShapeValue(value);
  
  const result = await sendVRMCommand("set_blend_shape", {
    blendShapeName,
    blendShapeValue: clampedValue,
  });
  
  return {
    success: result.success,
    commandId: result.commandId,
    blendShapeName,
    value: clampedValue,
  };
}

// Tool: Set pose (multiple bones at once)
export const setVRMPoseSchema = z.object({
  bones: z.array(z.object({
    boneName: z.enum(VRM_HUMANOID_BONES as any),
    rotationX: z.number().optional(),
    rotationY: z.number().optional(),
    rotationZ: z.number().optional(),
    useDegrees: z.boolean().optional().default(false),
  })).describe("Array of bone rotations to set"),
});
export const setVRMPoseOutputSchema = z.object({
  success: z.boolean(),
  commandId: z.string().optional(),
  boneCount: z.number(),
});

export async function setVRMPose(
  input: z.infer<typeof setVRMPoseSchema>
): Promise<z.infer<typeof setVRMPoseOutputSchema>> {
  const { bones } = input;
  
  const pose = bones.map(({ boneName, rotationX = 0, rotationY = 0, rotationZ = 0, useDegrees = false }) => {
    const toRad = useDegrees ? (val: number) => (val * Math.PI) / 180 : (val: number) => val;
    
    let rotation = {
      x: toRad(rotationX),
      y: toRad(rotationY),
      z: toRad(rotationZ),
    };
    
    rotation = clampBoneRotation(boneName, rotation);
    
    return {
      boneName,
      rotation,
    };
  });
  
  const result = await sendVRMCommand("set_pose", { pose });
  
  return {
    success: result.success,
    commandId: result.commandId,
    boneCount: bones.length,
  };
}

// Tool: Reset pose
export const resetVRMPoseSchema = z.object({});
export const resetVRMPoseOutputSchema = z.object({
  success: z.boolean(),
  commandId: z.string().optional(),
});

export async function resetVRMPose(): Promise<z.infer<typeof resetVRMPoseOutputSchema>> {
  const result = await sendVRMCommand("reset_pose", {});
  
  return {
    success: result.success,
    commandId: result.commandId,
  };
}

