"use client";

import { create } from "zustand";
import { Vector3 } from "three";
import { ZIP_MODES, type ZipMode } from "@/lib/constants";

// State-based configuration type
export interface HoloConfig {
  color: Vector3;
  intensity: number;
  scanlineSpeed: number;
  opacity: number;
  pulseSpeed: number;
  bloomIntensity: number;
}

// Store state interface
export interface HoloFaceState {
  // Current mode from parent
  mode: ZipMode;
  
  // Derived config based on mode
  config: HoloConfig;
  
  // Animation parameters
  speechLevel: number;
  targetIntensity: number;
  targetScanlineSpeed: number;
  targetOpacity: number;
  
  // Eye state
  eyeBlinkProgress: number;
  eyeTargetY: number;
  
  // Head/group transforms
  headRotationY: number;
  groupScale: number;
  
  // Mouth animation
  mouthScaleY: number;
  mouthOpacity: number;
  
  // Actions
  setMode: (mode: ZipMode) => void;
  setSpeechLevel: (level: number) => void;
  updateAnimationTargets: () => void;
  setEyeBlink: (progress: number) => void;
  setHeadRotation: (y: number) => void;
  setGroupScale: (scale: number) => void;
  setMouthState: (scaleY: number, opacity: number) => void;
}

// Get state-based configuration
function getStateConfig(mode: ZipMode): HoloConfig {
  switch (mode) {
    case ZIP_MODES.IDLE:
      return {
        color: new Vector3(0.15, 0.7, 0.8),
        intensity: 0.6,
        scanlineSpeed: 0.3,
        opacity: 0.75,
        pulseSpeed: 0.5,
        bloomIntensity: 0.4,
      };
    case ZIP_MODES.LISTENING:
      return {
        color: new Vector3(0.2, 0.8, 0.9),
        intensity: 0.9,
        scanlineSpeed: 1.2,
        opacity: 0.85,
        pulseSpeed: 2.0,
        bloomIntensity: 0.6,
      };
    case ZIP_MODES.THINKING:
      return {
        color: new Vector3(0.3, 0.7, 1.0),
        intensity: 0.85,
        scanlineSpeed: 1.8,
        opacity: 0.9,
        pulseSpeed: 1.5,
        bloomIntensity: 0.55,
      };
    case ZIP_MODES.SPEAKING:
      return {
        color: new Vector3(0.25, 0.9, 1.0),
        intensity: 1.0,
        scanlineSpeed: 2.5,
        opacity: 0.95,
        pulseSpeed: 3.0,
        bloomIntensity: 0.7,
      };
    case ZIP_MODES.TOOL_RUNNING:
      return {
        color: new Vector3(0.3, 0.8, 0.95),
        intensity: 0.95,
        scanlineSpeed: 2.0,
        opacity: 0.9,
        pulseSpeed: 2.5,
        bloomIntensity: 0.6,
      };
    case ZIP_MODES.ERROR:
      return {
        color: new Vector3(1.0, 0.2, 0.2),
        intensity: 0.9,
        scanlineSpeed: 4.0,
        opacity: 0.85,
        pulseSpeed: 4.0,
        bloomIntensity: 0.65,
      };
    default:
      return {
        color: new Vector3(0.15, 0.7, 0.8),
        intensity: 0.6,
        scanlineSpeed: 0.3,
        opacity: 0.75,
        pulseSpeed: 0.5,
        bloomIntensity: 0.4,
      };
  }
}

// Default config for initial state
const defaultConfig = getStateConfig(ZIP_MODES.IDLE);

export const useHoloFaceStore = create<HoloFaceState>((set, get) => ({
  // Initial state
  mode: ZIP_MODES.IDLE,
  config: defaultConfig,
  
  // Animation parameters
  speechLevel: 0,
  targetIntensity: defaultConfig.intensity,
  targetScanlineSpeed: defaultConfig.scanlineSpeed,
  targetOpacity: defaultConfig.opacity,
  
  // Eye state
  eyeBlinkProgress: 1.0,
  eyeTargetY: 1.0,
  
  // Head/group transforms
  headRotationY: 0,
  groupScale: 1.0,
  
  // Mouth animation
  mouthScaleY: 1.0,
  mouthOpacity: defaultConfig.opacity,
  
  // Actions
  setMode: (mode: ZipMode) => {
    const config = getStateConfig(mode);
    set({
      mode,
      config,
      targetIntensity: config.intensity,
      targetScanlineSpeed: config.scanlineSpeed,
      targetOpacity: config.opacity,
    });
  },
  
  setSpeechLevel: (level: number) => {
    const { config, mode } = get();
    const mouthScaleY = mode === ZIP_MODES.SPEAKING ? 0.7 + level * 0.6 : 1.0;
    const mouthOpacity = mode === ZIP_MODES.SPEAKING 
      ? config.opacity * (0.8 + level * 0.4) 
      : config.opacity;
    
    set({
      speechLevel: level,
      mouthScaleY,
      mouthOpacity,
    });
  },
  
  updateAnimationTargets: () => {
    const { mode, config } = get();
    
    // Update targets based on mode
    if (mode === ZIP_MODES.LISTENING || mode === ZIP_MODES.SPEAKING) {
      // Will be modulated by pulse in useFrame
      set({ targetIntensity: config.intensity });
    }
  },
  
  setEyeBlink: (progress: number) => {
    set({ eyeBlinkProgress: progress, eyeTargetY: progress });
  },
  
  setHeadRotation: (y: number) => {
    set({ headRotationY: y });
  },
  
  setGroupScale: (scale: number) => {
    set({ groupScale: scale });
  },
  
  setMouthState: (scaleY: number, opacity: number) => {
    set({ mouthScaleY: scaleY, mouthOpacity: opacity });
  },
}));

// Selector hooks for optimized re-renders
export const useHoloMode = () => useHoloFaceStore((state) => state.mode);
export const useHoloConfig = () => useHoloFaceStore((state) => state.config);
export const useHoloSpeechLevel = () => useHoloFaceStore((state) => state.speechLevel);

