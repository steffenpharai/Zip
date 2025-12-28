"use client";

import { useEffect, useRef, useCallback } from "react";
import type { VRM } from "@pixiv/three-vrm";

export interface VRMCommand {
  id: string;
  type: string;
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

interface UseVRMControlOptions {
  vrm: VRM | null;
  enabled?: boolean;
  pollInterval?: number;
  onStateChange?: (state: {
    bones: Record<string, any>;
    blendShapes: Record<string, number>;
  }) => void;
}

export function useVRMControl({
  vrm,
  enabled = true,
  pollInterval = 500, // Poll every 500ms (reduced from 100ms to prevent flooding)
  onStateChange,
}: UseVRMControlOptions) {
  const pollTimeoutRef = useRef<number | null>(null);
  const lastStateReportRef = useRef<number>(0);
  const stateReportInterval = 2000; // Report state every 2 seconds
  const currentPollIntervalRef = useRef<number>(pollInterval);
  const isPollingRef = useRef<boolean>(false);

  // Execute a VRM command
  const executeCommand = useCallback((command: VRMCommand) => {
    if (!vrm) return false;

    try {
      const { type, data } = command;

      switch (type) {
        case "set_bone_rotation": {
          if (data.boneName && data.rotation) {
            const humanoid = vrm.humanoid;
            if (humanoid) {
              const bone = humanoid.getNormalizedBoneNode(data.boneName);
              if (bone) {
                bone.rotation.set(
                  data.rotation.x,
                  data.rotation.y,
                  data.rotation.z
                );
                return true;
              }
            }
          }
          break;
        }

        case "set_bone_position": {
          if (data.boneName && data.position) {
            const humanoid = vrm.humanoid;
            if (humanoid) {
              const bone = humanoid.getNormalizedBoneNode(data.boneName);
              if (bone) {
                bone.position.set(
                  data.position.x,
                  data.position.y,
                  data.position.z
                );
                return true;
              }
            }
          }
          break;
        }

        case "set_blend_shape": {
          if (data.blendShapeName !== undefined && data.blendShapeValue !== undefined) {
            const expressionManager = vrm.expressionManager;
            if (expressionManager) {
              expressionManager.setValue(data.blendShapeName, data.blendShapeValue);
              return true;
            }
          }
          break;
        }

        case "reset_pose": {
          const humanoid = vrm.humanoid;
          if (humanoid) {
            // Reset all bones to default rotation
            const boneNames = [
              "hips", "spine", "chest", "upperChest", "neck", "head",
              "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand",
              "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand",
              "leftUpperLeg", "leftLowerLeg", "leftFoot",
              "rightUpperLeg", "rightLowerLeg", "rightFoot"
            ];
            
            for (const boneName of boneNames) {
              const bone = humanoid.getNormalizedBoneNode(boneName);
              if (bone) {
                bone.rotation.set(0, 0, 0);
              }
            }
            return true;
          }
          break;
        }

        case "set_pose": {
          if (data.pose) {
            const humanoid = vrm.humanoid;
            if (humanoid) {
              for (const bonePose of data.pose) {
                const bone = humanoid.getNormalizedBoneNode(bonePose.boneName);
                if (bone) {
                  if (bonePose.rotation) {
                    bone.rotation.set(
                      bonePose.rotation.x,
                      bonePose.rotation.y,
                      bonePose.rotation.z
                    );
                  }
                  if (bonePose.position) {
                    bone.position.set(
                      bonePose.position.x,
                      bonePose.position.y,
                      bonePose.position.z
                    );
                  }
                }
              }
              return true;
            }
          }
          break;
        }

        case "get_state": {
          // State is reported separately via reportState
          return true;
        }

        default:
          console.warn(`Unknown VRM command type: ${type}`);
          return false;
      }
    } catch (error) {
      console.error(`Error executing VRM command ${command.id}:`, error);
      return false;
    }

    return false;
  }, [vrm]);

  // Poll for pending commands with exponential backoff
  const pollCommands = useCallback(async () => {
    // Don't poll if disabled, no VRM, or already polling
    if (!vrm || !enabled || isPollingRef.current) {
      return;
    }
    
    isPollingRef.current = true;

    try {
      const response = await fetch("/api/vrm/commands");
      if (!response.ok) {
        // On error, use longer backoff
        currentPollIntervalRef.current = Math.min(
          currentPollIntervalRef.current * 1.5,
          5000
        );
        // Don't return - let finally block handle rescheduling
      } else {
        const result = await response.json();
        if (result.success && result.commands && result.commands.length > 0) {
          // Commands found - reset to base interval for faster polling
          currentPollIntervalRef.current = pollInterval;
          for (const command of result.commands) {
            executeCommand(command);
          }
        } else {
          // No commands - exponential backoff (max 5 seconds)
          currentPollIntervalRef.current = Math.min(
            currentPollIntervalRef.current * 1.5,
            5000
          );
        }
      }
    } catch (error) {
      // Silently fail - network errors are expected
      // On error, use longer backoff
      currentPollIntervalRef.current = Math.min(
        currentPollIntervalRef.current * 1.5,
        5000
      );
    } finally {
      isPollingRef.current = false;
      
      // Always reschedule if still enabled and VRM is available
      // Clear any existing timeout first to prevent duplicates
      if (pollTimeoutRef.current !== null) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
      
      if (enabled && vrm) {
        pollTimeoutRef.current = window.setTimeout(() => {
          const timeoutId = pollTimeoutRef.current;
          pollTimeoutRef.current = null;
          if (timeoutId !== null) {
            pollCommands();
          }
        }, currentPollIntervalRef.current);
      }
    }
  }, [vrm, enabled, executeCommand, pollInterval]);

  // Report current VRM state to server
  const reportState = useCallback(async () => {
    if (!vrm || !enabled) return;

    try {
      const humanoid = vrm.humanoid;
      const expressionManager = vrm.expressionManager;

      const bones: Record<string, any> = {};
      const blendShapes: Record<string, number> = {};
      const availableBones: string[] = [];
      const availableBlendShapes: string[] = [];

      // Collect bone states
      if (humanoid) {
        const boneNames = [
          "hips", "spine", "chest", "upperChest", "neck", "head",
          "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand",
          "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand",
          "leftUpperLeg", "leftLowerLeg", "leftFoot",
          "rightUpperLeg", "rightLowerLeg", "rightFoot"
        ];

        for (const boneName of boneNames) {
          const bone = humanoid.getNormalizedBoneNode(boneName);
          if (bone) {
            availableBones.push(boneName);
            bones[boneName] = {
              position: {
                x: bone.position.x,
                y: bone.position.y,
                z: bone.position.z,
              },
              rotation: {
                x: bone.rotation.x,
                y: bone.rotation.y,
                z: bone.rotation.z,
              },
            };
          }
        }
      }

      // Collect blend shape states
      if (expressionManager) {
        // Get all available expressions
        // VRM expression manager doesn't expose a direct way to list all expressions
        // We'll use the known ones and try to get their values
        const knownBlendShapes = [
          "Blink", "Fun", "Sorrow", "Angry", "Surprised",
          "A", "aa", "O", "oh", "I", "ee", "U", "uu", "E"
        ];

        for (const name of knownBlendShapes) {
          try {
            const value = expressionManager.getValue(name);
            if (value !== undefined && value !== null) {
              availableBlendShapes.push(name);
              blendShapes[name] = value;
            }
          } catch (e) {
            // Expression doesn't exist, skip
          }
        }
      }

      // Prepare state data
      const stateData = {
        bones,
        blendShapes,
        availableBones,
        availableBlendShapes,
      };

      // Validate that we have some data to send
      const hasData = Object.keys(bones).length > 0 || 
                     Object.keys(blendShapes).length > 0 ||
                     availableBones.length > 0 ||
                     availableBlendShapes.length > 0;

      if (!hasData) {
        // No data to report yet, skip silently
        return;
      }

      // Report to server
      const response = await fetch("/api/vrm/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stateData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.warn("Failed to report VRM state:", errorData);
        return;
      }

      // Notify callback
      if (onStateChange) {
        onStateChange({ bones, blendShapes });
      }
    } catch (error) {
      // Log error but don't throw to prevent breaking the polling loop
      console.warn("Error reporting VRM state:", error);
    }
  }, [vrm, enabled, onStateChange]);

  // Set up polling with recursive setTimeout for dynamic intervals
  useEffect(() => {
    if (!enabled || !vrm) {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
      isPollingRef.current = false;
      return;
    }

    // Reset polling state and interval
    isPollingRef.current = false;
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    currentPollIntervalRef.current = pollInterval;

    // Start polling with base interval
    const startPolling = () => {
      if (pollTimeoutRef.current === null && enabled && vrm) {
        pollTimeoutRef.current = window.setTimeout(() => {
          pollTimeoutRef.current = null;
          pollCommands();
        }, currentPollIntervalRef.current);
      }
    };
    
    startPolling();

    // Report state periodically
    const stateInterval = window.setInterval(() => {
      const now = Date.now();
      if (now - lastStateReportRef.current >= stateReportInterval) {
        reportState();
        lastStateReportRef.current = now;
      }
    }, stateReportInterval);

    // Initial state report
    reportState();

    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
      isPollingRef.current = false;
      clearInterval(stateInterval);
    };
  }, [enabled, vrm, pollInterval, pollCommands, reportState]);

  return {
    executeCommand,
    reportState,
  };
}

