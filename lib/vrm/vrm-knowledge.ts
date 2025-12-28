/**
 * VRM Knowledge Base
 * Documents all available bones, blend shapes, and safe ranges for AI control
 */

export const VRM_HUMANOID_BONES = [
  // Spine
  "hips",
  "spine",
  "chest",
  "upperChest",
  "neck",
  "head",
  // Left Arm
  "leftShoulder",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  // Right Arm
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
  // Left Leg
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  // Right Leg
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
] as const;

export type VRMBoneName = typeof VRM_HUMANOID_BONES[number];

export const VRM_BLEND_SHAPES = [
  // Eye expressions
  "Blink",
  // Emotion expressions
  "Fun",
  "Sorrow",
  "Angry",
  "Surprised",
  "Joy",
  "Neutral",
  "Relaxed",
  // Mouth shapes (phonemes)
  "A",
  "aa",
  "O",
  "oh",
  "I",
  "ee",
  "U",
  "uu",
  "E",
] as const;

export type VRMBlendShapeName = typeof VRM_BLEND_SHAPES[number];

/**
 * Bone rotation limits (in radians)
 * These are safe ranges to prevent unnatural poses
 */
export const BONE_ROTATION_LIMITS: Record<VRMBoneName, {
  x: { min: number; max: number };
  y: { min: number; max: number };
  z: { min: number; max: number };
}> = {
  hips: { x: { min: -0.5, max: 0.5 }, y: { min: -Math.PI, max: Math.PI }, z: { min: -0.5, max: 0.5 } },
  spine: { x: { min: -0.5, max: 0.5 }, y: { min: -0.5, max: 0.5 }, z: { min: -0.5, max: 0.5 } },
  chest: { x: { min: -0.5, max: 0.5 }, y: { min: -0.5, max: 0.5 }, z: { min: -0.5, max: 0.5 } },
  upperChest: { x: { min: -0.5, max: 0.5 }, y: { min: -0.5, max: 0.5 }, z: { min: -0.5, max: 0.5 } },
  neck: { x: { min: -0.8, max: 0.8 }, y: { min: -1.0, max: 1.0 }, z: { min: -0.8, max: 0.8 } },
  head: { x: { min: -0.8, max: 0.8 }, y: { min: -1.0, max: 1.0 }, z: { min: -0.8, max: 0.8 } },
  leftShoulder: { x: { min: -1.5, max: 1.5 }, y: { min: -1.5, max: 1.5 }, z: { min: -1.5, max: 1.5 } },
  leftUpperArm: { x: { min: -Math.PI, max: Math.PI }, y: { min: -Math.PI, max: Math.PI }, z: { min: -1.5, max: 1.5 } },
  leftLowerArm: { x: { min: -Math.PI, max: 0 }, y: { min: -1.5, max: 1.5 }, z: { min: -1.5, max: 1.5 } },
  leftHand: { x: { min: -1.0, max: 1.0 }, y: { min: -1.0, max: 1.0 }, z: { min: -1.0, max: 1.0 } },
  rightShoulder: { x: { min: -1.5, max: 1.5 }, y: { min: -1.5, max: 1.5 }, z: { min: -1.5, max: 1.5 } },
  rightUpperArm: { x: { min: -Math.PI, max: Math.PI }, y: { min: -Math.PI, max: Math.PI }, z: { min: -1.5, max: 1.5 } },
  rightLowerArm: { x: { min: -Math.PI, max: 0 }, y: { min: -1.5, max: 1.5 }, z: { min: -1.5, max: 1.5 } },
  rightHand: { x: { min: -1.0, max: 1.0 }, y: { min: -1.0, max: 1.0 }, z: { min: -1.0, max: 1.0 } },
  leftUpperLeg: { x: { min: -1.5, max: 1.5 }, y: { min: -1.5, max: 1.5 }, z: { min: -1.5, max: 1.5 } },
  leftLowerLeg: { x: { min: -Math.PI, max: 0 }, y: { min: -0.5, max: 0.5 }, z: { min: -0.5, max: 0.5 } },
  leftFoot: { x: { min: -1.0, max: 1.0 }, y: { min: -0.5, max: 0.5 }, z: { min: -0.5, max: 0.5 } },
  rightUpperLeg: { x: { min: -1.5, max: 1.5 }, y: { min: -1.5, max: 1.5 }, z: { min: -1.5, max: 1.5 } },
  rightLowerLeg: { x: { min: -Math.PI, max: 0 }, y: { min: -0.5, max: 0.5 }, z: { min: -0.5, max: 0.5 } },
  rightFoot: { x: { min: -1.0, max: 1.0 }, y: { min: -0.5, max: 0.5 }, z: { min: -0.5, max: 0.5 } },
};

/**
 * Clamp rotation values to safe ranges
 */
export function clampBoneRotation(
  boneName: VRMBoneName,
  rotation: { x: number; y: number; z: number }
): { x: number; y: number; z: number } {
  const limits = BONE_ROTATION_LIMITS[boneName];
  if (!limits) return rotation;

  return {
    x: Math.max(limits.x.min, Math.min(limits.x.max, rotation.x)),
    y: Math.max(limits.y.min, Math.min(limits.y.max, rotation.y)),
    z: Math.max(limits.z.min, Math.min(limits.z.max, rotation.z)),
  };
}

/**
 * Blend shape value limits (0.0 to 1.0)
 */
export function clampBlendShapeValue(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Common poses for reference
 */
export const COMMON_POSES = {
  tPose: {
    description: "T-pose (arms extended horizontally)",
    bones: {
      leftUpperArm: { x: 0, y: -Math.PI / 2, z: 0 },
      rightUpperArm: { x: 0, y: Math.PI / 2, z: 0 },
      leftLowerArm: { x: 0, y: 0, z: 0 },
      rightLowerArm: { x: 0, y: 0, z: 0 },
    },
  },
  restPose: {
    description: "Rest pose (arms at sides)",
    bones: {
      leftUpperArm: { x: 0, y: -Math.PI / 2, z: 0 },
      rightUpperArm: { x: 0, y: Math.PI / 2, z: 0 },
      leftLowerArm: { x: 0, y: 0, z: 0 },
      rightLowerArm: { x: 0, y: 0, z: 0 },
    },
  },
  wave: {
    description: "Waving pose (right arm raised)",
    bones: {
      rightUpperArm: { x: -Math.PI / 2, y: Math.PI / 4, z: 0 },
      rightLowerArm: { x: -Math.PI / 2, y: 0, z: 0 },
    },
  },
} as const;

