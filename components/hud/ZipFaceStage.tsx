"use client";

import { useRef, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { VRM, VRMLoaderPlugin } from "@pixiv/three-vrm";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { useHudStore } from "@/lib/state/hudStore";
import { ZIP_MODES, type ZipMode } from "@/lib/constants";
import { useVRMControl } from "@/hooks/useVRMControl";

// Helper function to log to both browser console and Docker console
const logToServer = async (level: "log" | "info" | "warn" | "error", message: string, data?: any) => {
  // Always log to browser console
  const consoleMethod = console[level] || console.log;
  if (data) {
    consoleMethod(message, data);
  } else {
    consoleMethod(message);
  }

  // Also send to server (Docker console)
  try {
    await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level, message, data }),
    }).catch(() => {
      // Silently fail if server is not available
    });
  } catch (e) {
    // Ignore errors
  }
};

interface ZipFaceStageProps {
  mode: ZipMode;
}

// VRM Model Component
function VRMModel({ 
  mode, 
  isSpeakingTelemetryActive, 
  lastSpeechLevel 
}: { 
  mode: ZipMode;
  isSpeakingTelemetryActive: boolean;
  lastSpeechLevel: number;
}) {
  const vrmRef = useRef<VRM | null>(null);
  const groupRef = useRef<THREE.Group>(null!);
  const [isLoaded, setIsLoaded] = useState(false);

  // VRM control hook for AI commands
  useVRMControl({
    vrm: vrmRef.current,
    enabled: isLoaded,
    pollInterval: 100,
  });

  // Idle animation state
  const blinkTimerRef = useRef<number | null>(null);
  const nextBlinkTimeRef = useRef(0);
  const isBlinkingRef = useRef(false);
  const blinkProgressRef = useRef(0);
  const headSwayRef = useRef(0);
  const breathingRef = useRef(0);

  // Load VRM model
  useEffect(() => {
    logToServer("log", "=== VRM Loader Starting ===");
    const loader = new GLTFLoader();
    loader.register((parser) => {
      return new VRMLoaderPlugin(parser);
    });

    logToServer("log", "Loading VRM from /avatars/zip.vrm");
    loader.load(
      "/avatars/zip.vrm",
      (gltf) => {
        logToServer("log", "VRM file loaded successfully", { gltfKeys: Object.keys(gltf) });
        const vrm = gltf.userData.vrm as VRM;
        if (!vrm) {
          logToServer("error", "VRM not found in gltf.userData", { userDataKeys: Object.keys(gltf.userData || {}) });
          return;
        }
        logToServer("log", "VRM object extracted", { vrmKeys: Object.keys(vrm) });
        vrm.scene.rotation.y = Math.PI; // Face forward
        // Position model so center of body is at origin (move down by approximately half height)
        vrm.scene.position.set(0, -0.85, 0);
        
        // Log VRM structure and bone information
        logToServer("log", "=== VRM Model Loaded ===");
        logToServer("log", "VRM object loaded", { sceneName: vrm.scene.name });
        
        const humanoid = vrm.humanoid;
        if (humanoid) {
          logToServer("log", "=== Humanoid Bones ===");
          
          // List all available bone names
          const boneNames = [
            "hips", "spine", "chest", "upperChest", "neck", "head",
            "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand",
            "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand",
            "leftUpperLeg", "leftLowerLeg", "leftFoot",
            "rightUpperLeg", "rightLowerLeg", "rightFoot"
          ];
          
          const foundBones: Record<string, any> = {};
          
          for (const boneName of boneNames) {
            try {
              const bone = humanoid.getNormalizedBoneNode(boneName);
              if (bone) {
                foundBones[boneName] = {
                  name: bone.name,
                  position: bone.position.clone(),
                  rotation: bone.rotation.clone(),
                  quaternion: bone.quaternion.clone(),
                  scale: bone.scale.clone()
                };
                logToServer("log", `✓ ${boneName}`, {
                  name: bone.name,
                  position: { x: bone.position.x, y: bone.position.y, z: bone.position.z },
                  rotation: `(${bone.rotation.x.toFixed(3)}, ${bone.rotation.y.toFixed(3)}, ${bone.rotation.z.toFixed(3)})`,
                  rotationDegrees: `(${(bone.rotation.x * 180 / Math.PI).toFixed(1)}°, ${(bone.rotation.y * 180 / Math.PI).toFixed(1)}°, ${(bone.rotation.z * 180 / Math.PI).toFixed(1)}°)`
                });
              }
            } catch (e) {
              // Bone not found, skip
            }
          }
          
          logToServer("log", "All found bones", foundBones);
          
          // Reset all bones to T-pose (0 rotation = T-pose for this VRM model)
          logToServer("log", "=== Resetting to T-Pose (Initial Position) ===");
          try {
            const allBoneNames = [
              "hips", "spine", "chest", "upperChest", "neck", "head",
              "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand",
              "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand",
              "leftUpperLeg", "leftLowerLeg", "leftFoot",
              "rightUpperLeg", "rightLowerLeg", "rightFoot"
            ];
            
            for (const boneName of allBoneNames) {
              const bone = humanoid.getNormalizedBoneNode(boneName);
              if (bone) {
                const beforeRotation = {
                  x: bone.rotation.x,
                  y: bone.rotation.y,
                  z: bone.rotation.z
                };
                
                // Reset to T-pose (0 rotation = T-pose for this VRM)
                bone.rotation.set(0, 0, 0);
                
                logToServer("log", `Reset ${boneName} to T-pose`, {
                  before: `(${(beforeRotation.x * 180 / Math.PI).toFixed(1)}°, ${(beforeRotation.y * 180 / Math.PI).toFixed(1)}°, ${(beforeRotation.z * 180 / Math.PI).toFixed(1)}°)`,
                  after: "(0.0°, 0.0°, 0.0°)"
                });
              }
            }
            
            logToServer("log", "All bones reset to T-pose (initial position)");
          } catch (e) {
            logToServer("error", "Error resetting to T-pose", { error: String(e) });
          }
        } else {
          logToServer("warn", "❌ Humanoid not found in VRM");
        }
        
        // Log all available blend shapes/expressions
        logToServer("log", "=== Available Blend Shapes ===");
        const expressionManager = vrm.expressionManager;
        if (expressionManager) {
          // Try to get all expressions - VRM doesn't expose a direct list method
          // So we'll try common ones and log what's available
          const knownBlendShapes = [
            "Blink", "Fun", "Sorrow", "Angry", "Surprised",
            "A", "aa", "O", "oh", "I", "ee", "U", "uu", "E",
            "Joy", "Neutral", "Relaxed"
          ];
          
          const availableBlendShapes: string[] = [];
          for (const name of knownBlendShapes) {
            try {
              const value = expressionManager.getValue(name);
              if (value !== undefined && value !== null) {
                availableBlendShapes.push(name);
              }
            } catch (e) {
              // Expression doesn't exist, skip
            }
          }
          
          logToServer("log", "Available blend shapes", { 
            count: availableBlendShapes.length,
            names: availableBlendShapes 
          });
        } else {
          logToServer("warn", "❌ Expression manager not found in VRM");
        }

        // Also log the scene graph structure
        logToServer("log", "=== Scene Graph Structure ===");
        const logSceneGraph = (obj: THREE.Object3D, depth = 0) => {
          const indent = "  ".repeat(depth);
          const logLine = `${indent}${obj.name || "unnamed"} (${obj.type})`;
          if (obj.type === "Bone" || obj.name.toLowerCase().includes("arm")) {
            logToServer("log", logLine, {
              position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
              rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
              rotationDegrees: `(${(obj.rotation.x * 180 / Math.PI).toFixed(1)}°, ${(obj.rotation.y * 180 / Math.PI).toFixed(1)}°, ${(obj.rotation.z * 180 / Math.PI).toFixed(1)}°)`
            });
          } else {
            logToServer("log", logLine);
          }
          obj.children.forEach(child => logSceneGraph(child, depth + 1));
        };
        logSceneGraph(vrm.scene);
        
        vrmRef.current = vrm;
        setIsLoaded(true);

        // Initialize next blink time
        nextBlinkTimeRef.current = Date.now() + 3000 + Math.random() * 3000;
      },
      (progress) => {
        // Progress callback
        if (progress.total > 0) {
          const percent = (progress.loaded / progress.total) * 100;
          logToServer("info", `VRM loading progress: ${percent.toFixed(1)}%`, { loaded: progress.loaded, total: progress.total });
        }
      },
      (error) => {
        logToServer("error", "Failed to load VRM model", { error: String(error), errorMessage: error?.message, errorStack: error?.stack });
        console.error("VRM Load Error:", error);
      }
    );

    return () => {
      if (vrmRef.current) {
        if (groupRef.current && vrmRef.current.scene.parent === groupRef.current) {
          groupRef.current.remove(vrmRef.current.scene);
        }
        // VRM doesn't have a dispose method, cleanup is handled by removing from scene
        vrmRef.current = null;
      }
      if (blinkTimerRef.current) {
        clearTimeout(blinkTimerRef.current);
      }
    };
  }, []);

  // Add VRM scene to group when loaded
  useEffect(() => {
    if (isLoaded && vrmRef.current && groupRef.current) {
      groupRef.current.add(vrmRef.current.scene);
    }
  }, [isLoaded]);

  // Animation loop
  useFrame((_, delta) => {
    if (!vrmRef.current || !isLoaded) return;

    const vrm = vrmRef.current;
    const expressionManager = vrm.expressionManager;
    const scene = vrm.scene;
    const humanoid = vrm.humanoid;

    // Update VRM (required every frame)
    vrm.update(delta);
    
    // Note: Initial pose is set to T-pose (all 0 rotations) on load
    // AI commands will control the pose from here - no forced pose override

    // Idle animations (when not speaking)
    if (!isSpeakingTelemetryActive) {
      // Blinking
      const now = Date.now();
      if (now >= nextBlinkTimeRef.current && !isBlinkingRef.current) {
        isBlinkingRef.current = true;
        blinkProgressRef.current = 0;
      }

      if (isBlinkingRef.current) {
        blinkProgressRef.current += delta * 10; // ~0.15s blink duration
        if (blinkProgressRef.current >= 1) {
          isBlinkingRef.current = false;
          nextBlinkTimeRef.current = now + 3000 + Math.random() * 3000; // 3-6s interval
          blinkProgressRef.current = 0;
        }
        const blinkValue = Math.sin(blinkProgressRef.current * Math.PI);
        expressionManager?.setValue("Blink", blinkValue);
      }

      // Micro head sway (subtle)
      headSwayRef.current += delta * 0.5; // ~4s period
      const swayAmount = Math.sin(headSwayRef.current) * 0.035; // ±2 degrees
      scene.rotation.y = Math.PI + swayAmount;

      // Breathing (subtle scale)
      breathingRef.current += delta * 0.67; // ~3s period
      const breathAmount = Math.sin(breathingRef.current) * 0.01;
      scene.scale.set(1 + breathAmount, 1 + breathAmount, 1 + breathAmount);
    } else {
      // Reset idle animations when speaking
      scene.rotation.y = Math.PI;
      scene.scale.set(1, 1, 1);
      if (isBlinkingRef.current) {
        isBlinkingRef.current = false;
        blinkProgressRef.current = 0;
      }
    }

    // Lip-sync (when speaking)
    if (isSpeakingTelemetryActive && lastSpeechLevel > 0) {
      const level = lastSpeechLevel;
      const jawOpen = Math.min(level * 1.25, 1);

      // Try common VRM blendshape names
      const blendshapes = [
        { name: "A", value: jawOpen },
        { name: "aa", value: jawOpen },
        { name: "O", value: jawOpen * 0.55 },
        { name: "oh", value: jawOpen * 0.55 },
        { name: "I", value: jawOpen * 0.25 },
        { name: "ee", value: jawOpen * 0.25 },
        { name: "U", value: jawOpen * 0.15 },
        { name: "uu", value: jawOpen * 0.15 },
        { name: "E", value: jawOpen * 0.2 },
      ];

      blendshapes.forEach(({ name, value }) => {
        try {
          expressionManager?.setValue(name, value);
        } catch (e) {
          // Blendshape not found, skip
        }
      });
    } else {
      // Reset mouth when not speaking
      const mouthBlendshapes = ["A", "aa", "O", "oh", "I", "ee", "U", "uu", "E"];
      mouthBlendshapes.forEach((name) => {
        try {
          expressionManager?.setValue(name, 0);
        } catch (e) {
          // Ignore
        }
      });
    }

    // State-driven expressions (blend smoothly)
    const expressionBlendSpeed = 2.0; // How fast expressions blend

    switch (mode) {
      case ZIP_MODES.IDLE:
        // Gradually reset to neutral
        expressionManager?.setValue("Fun", 0);
        expressionManager?.setValue("Sorrow", 0);
        break;

      case ZIP_MODES.LISTENING:
        // Slight smile
        const currentFun = expressionManager?.getValue("Fun") || 0;
        const targetFun = 0.2;
        const newFun = currentFun + (targetFun - currentFun) * expressionBlendSpeed * delta;
        expressionManager?.setValue("Fun", Math.max(0, Math.min(1, newFun)));
        expressionManager?.setValue("Sorrow", 0);
        break;

      case ZIP_MODES.THINKING:
        // Neutral, reduced idle motion (handled above)
        expressionManager?.setValue("Fun", 0);
        expressionManager?.setValue("Sorrow", 0);
        break;

      case ZIP_MODES.TOOL_RUNNING:
        // Neutral
        expressionManager?.setValue("Fun", 0);
        expressionManager?.setValue("Sorrow", 0);
        break;

      case ZIP_MODES.SPEAKING:
        // Mild fun + mouth movement (handled above)
        const currentSpeakingFun = expressionManager?.getValue("Fun") || 0;
        const targetSpeakingFun = 0.3;
        const newSpeakingFun =
          currentSpeakingFun + (targetSpeakingFun - currentSpeakingFun) * expressionBlendSpeed * delta;
        expressionManager?.setValue("Fun", Math.max(0, Math.min(1, newSpeakingFun)));
        expressionManager?.setValue("Sorrow", 0);
        break;

      case ZIP_MODES.ERROR:
        // Subtle sorrow
        const currentSorrow = expressionManager?.getValue("Sorrow") || 0;
        const targetSorrow = 0.2;
        const newSorrow = currentSorrow + (targetSorrow - currentSorrow) * expressionBlendSpeed * delta;
        expressionManager?.setValue("Sorrow", Math.max(0, Math.min(1, newSorrow)));
        expressionManager?.setValue("Fun", 0);
        break;

      default:
        expressionManager?.setValue("Fun", 0);
        expressionManager?.setValue("Sorrow", 0);
    }
  });

  return <group ref={groupRef} />;
}

// Camera controller to ensure full body is visible
function CameraController() {
  const { camera } = useThree();
  
  useEffect(() => {
    // Position camera to show full body (50% smaller)
    // Camera at eye level looking at model center
    camera.position.set(0, 0.05, 4.0);
    camera.lookAt(0, 0, 0); // Look at model center (origin)
  }, [camera]);
  
  return null;
}

// Main component
export default function ZipFaceStage({ mode }: ZipFaceStageProps) {
  const { state } = useHudStore();
  
  return (
    <div className="relative w-64 h-[28rem]">
      <Canvas
        gl={{ antialias: true, alpha: true }}
        camera={{ position: [0, 0.05, 4.0], fov: 50 }}
        style={{ width: "100%", height: "100%" }}
      >
        <CameraController />
        {/* Lighting */}
        <ambientLight intensity={0.4} color="#ffffff" />
        <directionalLight intensity={0.6} position={[5, 5, 5]} />
        <directionalLight intensity={0.3} position={[-5, 3, -5]} />

        {/* VRM Model */}
        <VRMModel 
          mode={mode} 
          isSpeakingTelemetryActive={state.isSpeakingTelemetryActive}
          lastSpeechLevel={state.lastSpeechLevel}
        />
      </Canvas>
    </div>
  );
}

