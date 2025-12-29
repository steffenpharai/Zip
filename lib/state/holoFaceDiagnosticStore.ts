"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

// Default debug values matching HoloFace.tsx
const DEFAULT_DEBUG = {
  intensityMultiplier: 1.0,
  scanlineMultiplier: 1.0,
  fresnelPower: 2.5,
  noiseScale: 0.08,
  bloomMultiplier: 1.0,
  bloomThreshold: 0.1,
  chromaticAberration: 0,
} as const;

export interface HoloFaceDiagnosticState {
  // Shader controls
  intensityMultiplier: number;
  scanlineMultiplier: number;
  fresnelPower: number;
  noiseScale: number;
  
  // Post-processing controls
  bloomMultiplier: number;
  bloomThreshold: number;
  chromaticAberration: number;
  
  // Actions
  setIntensityMultiplier: (value: number) => void;
  setScanlineMultiplier: (value: number) => void;
  setFresnelPower: (value: number) => void;
  setNoiseScale: (value: number) => void;
  setBloomMultiplier: (value: number) => void;
  setBloomThreshold: (value: number) => void;
  setChromaticAberration: (value: number) => void;
  resetToDefaults: () => void;
}

export const useHoloFaceDiagnosticStore = create<HoloFaceDiagnosticState>()(
  persist(
    (set) => ({
      // Initial state with defaults
      ...DEFAULT_DEBUG,
      
      // Actions
      setIntensityMultiplier: (value: number) =>
        set({ intensityMultiplier: Math.max(0.1, Math.min(3.0, value)) }),
      
      setScanlineMultiplier: (value: number) =>
        set({ scanlineMultiplier: Math.max(0.1, Math.min(5.0, value)) }),
      
      setFresnelPower: (value: number) =>
        set({ fresnelPower: Math.max(0.5, Math.min(5.0, value)) }),
      
      setNoiseScale: (value: number) =>
        set({ noiseScale: Math.max(0, Math.min(0.3, value)) }),
      
      setBloomMultiplier: (value: number) =>
        set({ bloomMultiplier: Math.max(0.1, Math.min(3.0, value)) }),
      
      setBloomThreshold: (value: number) =>
        set({ bloomThreshold: Math.max(0, Math.min(1.0, value)) }),
      
      setChromaticAberration: (value: number) =>
        set({ chromaticAberration: Math.max(0, Math.min(10, value)) }),
      
      resetToDefaults: () => set(DEFAULT_DEBUG),
    }),
    {
      name: "holoface-diagnostic-storage",
      version: 1,
    }
  )
);

// Selector hooks for optimized re-renders
export const useHoloFaceDiagnostic = () => useHoloFaceDiagnosticStore();

