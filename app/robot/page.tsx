"use client";

/**
 * Robot Diagnostics Page
 * 
 * Comprehensive robot control and monitoring center.
 * Features: Connection status, motion control, motor gauges,
 * sensor display, serial console, and streaming controls.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRobot } from "@/hooks/useRobot";
import {
  MotionControl,
  SerialConsole,
  SensorDisplay,
  ConnectionStatus,
  MotorGauges,
} from "@/components/robot";
import type { RobotHealthResponse, RobotSensors } from "@/lib/robot/types";

export default function RobotPage() {
  const {
    state,
    connection,
    isReady,
    isStreaming,
    connect,
    disconnect,
    checkHealth,
    stop,
    move,
    startStreaming,
    stopStreaming,
    getDiagnostics,
    getSensors,
  } = useRobot({ autoConnect: true, diagnosticsPollingMs: 2000 });

  const [health, setHealth] = useState<RobotHealthResponse | null>(null);
  const [sensors, setSensors] = useState<RobotSensors>({
    ultrasonic: null,
    lineSensor: null,
    battery: null,
  });
  const [sensorsLoading, setSensorsLoading] = useState(false);
  const [streamSettings, setStreamSettings] = useState({
    rateHz: 10,
    ttlMs: 200,
    velocity: 100,
    turnRate: 80,
  });

  // Fetch health on mount and periodically
  useEffect(() => {
    const fetchHealth = async () => {
      const h = await checkHealth();
      setHealth(h);
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 5000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  // Handle reconnect
  const handleReconnect = useCallback(() => {
    disconnect();
    setTimeout(() => connect(), 500);
  }, [connect, disconnect]);

  // Handle motion control
  const handleMove = useCallback(async (v: number, w: number) => {
    if (isStreaming) {
      // Update streaming setpoint - no need to call any function, 
      // we just emit new values to the streaming system
      // For now, we'll use direct motor control
    }
    await move(v, w);
  }, [isStreaming, move]);

  const handleStop = useCallback(async () => {
    if (isStreaming) {
      await stopStreaming(true);
    } else {
      await stop();
    }
  }, [isStreaming, stop, stopStreaming]);

  // Handle streaming toggle
  const handleStreamingToggle = useCallback(async () => {
    if (isStreaming) {
      await stopStreaming(true);
    } else {
      await startStreaming(
        streamSettings.velocity,
        streamSettings.turnRate,
        {
          rateHz: streamSettings.rateHz,
          ttlMs: streamSettings.ttlMs,
        }
      );
    }
  }, [isStreaming, startStreaming, stopStreaming, streamSettings]);

  // Fetch sensors
  const handleRefreshSensors = useCallback(async () => {
    setSensorsLoading(true);
    try {
      const s = await getSensors();
      setSensors(s);
    } catch (error) {
      console.error("Failed to fetch sensors:", error);
    } finally {
      setSensorsLoading(false);
    }
  }, [getSensors]);

  // Fetch diagnostics
  const handleRefreshDiagnostics = useCallback(async () => {
    await getDiagnostics();
  }, [getDiagnostics]);

  return (
    <div className="min-h-screen bg-background text-text-primary">
      {/* Header */}
      <header className="bg-panel-surface border-b border-border px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-text-muted hover:text-accent-cyan transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Back to HUD</span>
            </Link>
            <div className="h-6 w-px bg-border" />
            <h1 className="text-xl font-semibold tracking-wide">
              <span className="text-accent-cyan">ZIP</span> Robot Diagnostics
            </h1>
          </div>

          {/* Emergency Stop Button */}
          <button
            onClick={handleStop}
            className="px-4 py-2 bg-red-500/20 border border-red-500 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors font-semibold"
          >
            EMERGENCY STOP
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Connection & Motion */}
          <div className="space-y-6">
            {/* Connection Status */}
            <ConnectionStatus
              connection={connection}
              health={health}
              onReconnect={handleReconnect}
            />

            {/* Motion Control */}
            <div className="bg-panel-surface border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide">
                  Motion Control
                </h4>
                <div className={`flex items-center gap-2 text-xs ${isStreaming ? "text-accent-cyan" : "text-text-muted"}`}>
                  <span className={`w-2 h-2 rounded-full ${isStreaming ? "bg-accent-cyan animate-pulse" : "bg-text-muted"}`} />
                  {isStreaming ? "Streaming" : "Manual"}
                </div>
              </div>
              <MotionControl
                onMove={handleMove}
                onStop={handleStop}
                disabled={!isReady}
                isStreaming={isStreaming}
              />
            </div>

            {/* Streaming Controls */}
            <div className="bg-panel-surface border border-border rounded-lg p-4 space-y-4">
              <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide">
                Streaming Controls
              </h4>
              
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-text-muted">Rate (Hz)</span>
                    <span className="text-text-primary font-mono">{streamSettings.rateHz}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={streamSettings.rateHz}
                    onChange={(e) => setStreamSettings(s => ({ ...s, rateHz: parseInt(e.target.value, 10) }))}
                    disabled={isStreaming}
                    className="w-full h-2 bg-panel-surface-2 rounded-lg appearance-none cursor-pointer accent-accent-cyan"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-text-muted">TTL (ms)</span>
                    <span className="text-text-primary font-mono">{streamSettings.ttlMs}</span>
                  </div>
                  <input
                    type="range"
                    min="150"
                    max="300"
                    step="10"
                    value={streamSettings.ttlMs}
                    onChange={(e) => setStreamSettings(s => ({ ...s, ttlMs: parseInt(e.target.value, 10) }))}
                    disabled={isStreaming}
                    className="w-full h-2 bg-panel-surface-2 rounded-lg appearance-none cursor-pointer accent-accent-cyan"
                  />
                </div>
              </div>

              <button
                onClick={handleStreamingToggle}
                disabled={!isReady}
                className={`w-full py-2 rounded-lg font-medium transition-colors ${
                  isStreaming
                    ? "bg-red-500/20 border border-red-500 text-red-400 hover:bg-red-500/30"
                    : "bg-accent-cyan/20 border border-accent-cyan text-accent-cyan hover:bg-accent-cyan/30"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isStreaming ? "Stop Streaming" : "Start Streaming"}
              </button>
            </div>
          </div>

          {/* Middle Column - Motor Status */}
          <div className="space-y-6">
            {/* Motor Gauges */}
            <MotorGauges
              diagnostics={state.diagnostics}
              loading={!isReady}
            />

            {/* Refresh Diagnostics */}
            <button
              onClick={handleRefreshDiagnostics}
              disabled={!isReady}
              className="w-full py-2 bg-panel-surface border border-border rounded-lg text-text-muted hover:text-accent-cyan hover:border-accent-cyan/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Refresh Diagnostics
            </button>
          </div>

          {/* Right Column - Sensors */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-text-muted text-xs font-semibold uppercase tracking-wide">
                Sensors
              </h3>
              <button
                onClick={handleRefreshSensors}
                disabled={!isReady || sensorsLoading}
                className="text-xs text-accent-cyan hover:text-accent-cyan-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sensorsLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
            <SensorDisplay
              sensors={sensors}
              loading={sensorsLoading}
            />
          </div>
        </div>

        {/* Serial Console - Full Width */}
        <div className="mt-6">
          <SerialConsole
            logs={state.serialLog}
            maxHeight={250}
          />
        </div>

        {/* Statistics Footer */}
        {health && (
          <div className="mt-6 bg-panel-surface border border-border rounded-lg p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-center">
              <div>
                <div className="text-text-muted text-xs uppercase tracking-wide">RX Bytes</div>
                <div className="text-online-green font-mono text-lg">
                  {health.rxBytes.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-text-muted text-xs uppercase tracking-wide">TX Bytes</div>
                <div className="text-accent-cyan font-mono text-lg">
                  {health.txBytes.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-text-muted text-xs uppercase tracking-wide">Pending</div>
                <div className="text-text-primary font-mono text-lg">
                  {health.pendingQueueDepth}
                </div>
              </div>
              <div>
                <div className="text-text-muted text-xs uppercase tracking-wide">Resets</div>
                <div className={`font-mono text-lg ${health.resetsSeen > 0 ? "text-yellow-500" : "text-text-primary"}`}>
                  {health.resetsSeen}
                </div>
              </div>
              <div>
                <div className="text-text-muted text-xs uppercase tracking-wide">Stream Rate</div>
                <div className={`font-mono text-lg ${health.streaming ? "text-accent-cyan" : "text-text-muted"}`}>
                  {health.streaming ? `${state.bridgeStatus?.streamRateHz ?? 0}Hz` : "Off"}
                </div>
              </div>
              <div>
                <div className="text-text-muted text-xs uppercase tracking-wide">Status</div>
                <div className={`font-mono text-lg ${health.ready ? "text-online-green" : "text-yellow-500"}`}>
                  {health.ready ? "Ready" : "Handshaking"}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

