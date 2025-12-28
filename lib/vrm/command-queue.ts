/**
 * Shared command queue for VRM control
 * Used by both command and commands API endpoints
 */

export type VRMCommandType = 
  | "set_bone_rotation"
  | "set_bone_position"
  | "set_blend_shape"
  | "get_state"
  | "reset_pose"
  | "set_pose";

export interface VRMCommand {
  id: string;
  type: VRMCommandType;
  timestamp: number;
  data: {
    boneName?: string;
    rotation?: { x: number; y: number; z: number };
    position?: { x: number; y: number; z: number };
    blendShapeName?: string;
    blendShapeValue?: number;
    pose?: Array<{
      boneName: string;
      rotation?: { x: number; y: number; z: number };
      position?: { x: number; y: number; z: number };
    }>;
  };
}

// In-memory command queue (per session)
// In production, consider using Redis or a proper queue system
export const commandQueues = new Map<string, Array<VRMCommand>>();

