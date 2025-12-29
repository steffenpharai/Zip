"use client";

import { useState } from "react";
import { useHoloFaceDiagnosticStore } from "@/lib/state/holoFaceDiagnosticStore";
import { LAYOUT } from "@/lib/constants";

type Tab = "shader" | "postprocessing";

export default function HoloFaceDiagnosticPanel() {
  const [activeTab, setActiveTab] = useState<Tab>("shader");
  const store = useHoloFaceDiagnosticStore();

  return (
    <div
      className="bg-panel-surface-2 border border-border rounded-xl p-4"
      style={{ borderRadius: `${LAYOUT.CARD_RADIUS}px` }}
    >
      <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-3">
        HoloFace Diagnostics
      </h4>
      <div className="space-y-3">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setActiveTab("shader")}
          className={`px-2 py-1 text-xs font-medium transition-colors ${
            activeTab === "shader"
              ? "text-text-primary border-b-2 border-text-primary"
              : "text-text-muted hover:text-text-primary"
          }`}
        >
          Shader
        </button>
        <button
          onClick={() => setActiveTab("postprocessing")}
          className={`px-2 py-1 text-xs font-medium transition-colors ${
            activeTab === "postprocessing"
              ? "text-text-primary border-b-2 border-text-primary"
              : "text-text-muted hover:text-text-primary"
          }`}
        >
          Post-Processing
        </button>
      </div>

      {/* Shader Tab */}
      {activeTab === "shader" && (
        <div className="space-y-3">
          {/* Intensity Multiplier */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-text-muted text-xs font-medium uppercase tracking-wide">
                Intensity
              </label>
              <span className="text-text-primary text-xs font-mono">
                {store.intensityMultiplier.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="3.0"
              step="0.1"
              value={store.intensityMultiplier}
              onChange={(e) =>
                store.setIntensityMultiplier(parseFloat(e.target.value))
              }
              className="w-full h-2 bg-panel-surface rounded-lg appearance-none cursor-pointer accent-accent-cyan"
            />
          </div>

          {/* Scanline Multiplier */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-text-muted text-xs font-medium uppercase tracking-wide">
                Scanline Speed
              </label>
              <span className="text-text-primary text-xs font-mono">
                {store.scanlineMultiplier.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="5.0"
              step="0.1"
              value={store.scanlineMultiplier}
              onChange={(e) =>
                store.setScanlineMultiplier(parseFloat(e.target.value))
              }
              className="w-full h-2 bg-panel-surface rounded-lg appearance-none cursor-pointer accent-accent-cyan"
            />
          </div>

          {/* Fresnel Power */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-text-muted text-xs font-medium uppercase tracking-wide">
                Fresnel Power
              </label>
              <span className="text-text-primary text-xs font-mono">
                {store.fresnelPower.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="5.0"
              step="0.1"
              value={store.fresnelPower}
              onChange={(e) =>
                store.setFresnelPower(parseFloat(e.target.value))
              }
              className="w-full h-2 bg-panel-surface rounded-lg appearance-none cursor-pointer accent-accent-cyan"
            />
          </div>

          {/* Noise Scale */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-text-muted text-xs font-medium uppercase tracking-wide">
                Noise Scale
              </label>
              <span className="text-text-primary text-xs font-mono">
                {store.noiseScale.toFixed(3)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="0.3"
              step="0.01"
              value={store.noiseScale}
              onChange={(e) =>
                store.setNoiseScale(parseFloat(e.target.value))
              }
              className="w-full h-2 bg-panel-surface rounded-lg appearance-none cursor-pointer accent-accent-cyan"
            />
          </div>
        </div>
      )}

      {/* Post-Processing Tab */}
      {activeTab === "postprocessing" && (
        <div className="space-y-3">
          {/* Bloom Multiplier */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-text-muted text-xs font-medium uppercase tracking-wide">
                Bloom Intensity
              </label>
              <span className="text-text-primary text-xs font-mono">
                {store.bloomMultiplier.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="3.0"
              step="0.1"
              value={store.bloomMultiplier}
              onChange={(e) =>
                store.setBloomMultiplier(parseFloat(e.target.value))
              }
              className="w-full h-2 bg-panel-surface rounded-lg appearance-none cursor-pointer accent-accent-cyan"
            />
          </div>

          {/* Bloom Threshold */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-text-muted text-xs font-medium uppercase tracking-wide">
                Bloom Threshold
              </label>
              <span className="text-text-primary text-xs font-mono">
                {store.bloomThreshold.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1.0"
              step="0.05"
              value={store.bloomThreshold}
              onChange={(e) =>
                store.setBloomThreshold(parseFloat(e.target.value))
              }
              className="w-full h-2 bg-panel-surface rounded-lg appearance-none cursor-pointer accent-accent-cyan"
            />
          </div>

          {/* Chromatic Aberration */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-text-muted text-xs font-medium uppercase tracking-wide">
                Chromatic Aberration
              </label>
              <span className="text-text-primary text-xs font-mono">
                {store.chromaticAberration.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="10"
              step="0.5"
              value={store.chromaticAberration}
              onChange={(e) =>
                store.setChromaticAberration(parseFloat(e.target.value))
              }
              className="w-full h-2 bg-panel-surface rounded-lg appearance-none cursor-pointer accent-accent-cyan"
            />
          </div>
        </div>
      )}

      {/* Reset Button */}
      <div className="pt-2 border-t border-border">
        <button
          onClick={() => store.resetToDefaults()}
          className="w-full px-3 py-2 text-xs font-medium bg-panel-surface border border-border rounded-md text-text-primary hover:bg-panel-surface-2 transition-colors"
        >
          Reset to Defaults
        </button>
      </div>
      </div>
    </div>
  );
}

