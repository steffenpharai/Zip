/**
 * Robot Client
 * 
 * Unified interface for robot control via WiFi.
 * Communicates with ESP32 via HTTP, which forwards commands to UNO via Serial2.
 * 
 * This replaces the previous WebSocket-based USB bridge approach.
 */

import { eventBus } from "@/lib/events/bus";
import {
  wifiRobotClient,
  type WiFiCommandResponse,
  type WiFiStatusResponse,
} from "./wifi-client";
import type {
  RobotDiagnostics,
  RobotState,
  RobotConnectionState,
  RobotSensors,
  RobotStatusResponse,
} from "./types";
import {
  DEFAULT_ROBOT_CONFIG,
  INITIAL_ROBOT_STATE,
  ROBOT_COMMANDS,
} from "./types";

// ============================================================================
// Singleton Client Instance
// ============================================================================

class RobotClient {
  private state: RobotState = { ...INITIAL_ROBOT_STATE };
  private listeners = new Set<(state: RobotState) => void>();
  private config = DEFAULT_ROBOT_CONFIG;
  private pollingStarted = false;
  private diagnosticsTimer: ReturnType<typeof setInterval> | null = null;
  
  // Streaming state
  private streamingTimer: ReturnType<typeof setInterval> | null = null;
  private streamingSetpoint = { v: 0, w: 0 };
  private isStreaming = false;

  constructor() {
    // Subscribe to WiFi client state changes
    wifiRobotClient.subscribe((wifiState) => {
      const connection: RobotConnectionState = wifiState.connected 
        ? "connected" 
        : wifiState.lastError 
          ? "error" 
          : "disconnected";
      
      this.updateState({
        connection,
        esp32Status: wifiState.stats,
        lastError: wifiState.lastError,
      });
    });
  }

  // ==========================================================================
  // Connection Management
  // ==========================================================================

  /**
   * Start connection monitoring (status polling)
   */
  connect(): void {
    if (this.pollingStarted) {
      return;
    }
    
    this.pollingStarted = true;
    wifiRobotClient.startPolling();
    
    // Start diagnostics polling if configured
    if (this.config.diagnosticsPollingMs > 0) {
      this.startDiagnosticsPolling();
    }
  }

  /**
   * Stop connection monitoring
   */
  disconnect(): void {
    this.pollingStarted = false;
    wifiRobotClient.stopPolling();
    this.stopDiagnosticsPolling();
    this.stopStreaming();
    this.updateState({ connection: "disconnected" });
  }

  /**
   * Check if connected and ready
   */
  isReady(): boolean {
    return this.state.connection === "connected";
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  /**
   * Update state and notify listeners
   */
  private updateState(updates: Partial<RobotState>): void {
    this.state = {
      ...this.state,
      ...updates,
      lastUpdated: Date.now(),
    };

    // Notify all listeners
    for (const listener of this.listeners) {
      listener(this.state);
    }

    // Emit panel update event
    eventBus.emit({
      type: "panel.update",
      panel: "robot",
      payload: {
        connection: this.state.connection,
        esp32Status: this.state.esp32Status,
        diagnostics: this.state.diagnostics,
        sensors: this.state.sensors,
      },
      ts: Date.now(),
    });
  }

  /**
   * Get current state
   */
  getState(): RobotState {
    return this.state;
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: RobotState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  // ==========================================================================
  // Diagnostics Polling
  // ==========================================================================

  private startDiagnosticsPolling(): void {
    if (this.diagnosticsTimer) {
      return;
    }

    this.diagnosticsTimer = setInterval(async () => {
      if (this.state.connection === "connected") {
        await this.getDiagnostics();
      }
    }, this.config.diagnosticsPollingMs);
  }

  private stopDiagnosticsPolling(): void {
    if (this.diagnosticsTimer) {
      clearInterval(this.diagnosticsTimer);
      this.diagnosticsTimer = null;
    }
  }

  // ==========================================================================
  // High-Level Commands
  // ==========================================================================

  /**
   * Send hello/ping command
   */
  async hello(): Promise<WiFiCommandResponse> {
    return wifiRobotClient.hello();
  }

  /**
   * Get diagnostics (N=120)
   */
  async getDiagnostics(): Promise<RobotDiagnostics | null> {
    const diagnostics = await wifiRobotClient.getDiagnostics();
    if (diagnostics) {
      this.updateState({ diagnostics });
    }
    return diagnostics;
  }

  /**
   * Emergency stop (N=201)
   */
  async stop(): Promise<WiFiCommandResponse> {
    // Stop streaming first
    if (this.isStreaming) {
      this.stopStreaming();
    }
    return wifiRobotClient.stop();
  }

  /**
   * Direct motor control (N=999)
   */
  async directMotor(left: number, right: number): Promise<WiFiCommandResponse> {
    return wifiRobotClient.directMotor(left, right);
  }

  /**
   * Set servo angle (N=5)
   */
  async setServo(angle: number): Promise<WiFiCommandResponse> {
    return wifiRobotClient.setServo(angle);
  }

  /**
   * Get ultrasonic distance (N=21)
   */
  async getUltrasonic(mode: "distance" | "obstacle" = "distance"): Promise<number | boolean> {
    return wifiRobotClient.getUltrasonic(mode);
  }

  /**
   * Get line sensor reading (N=22)
   */
  async getLineSensor(sensor: "left" | "middle" | "right"): Promise<number> {
    return wifiRobotClient.getLineSensor(sensor);
  }

  /**
   * Get battery voltage (N=23)
   */
  async getBattery(): Promise<number> {
    return wifiRobotClient.getBattery();
  }

  // ==========================================================================
  // Streaming Control (HTTP-based)
  // ==========================================================================

  /**
   * Start motion streaming
   * Sends periodic motor commands at the specified rate
   */
  startStreaming(
    v: number,
    w: number,
    options: { rateHz?: number; ttlMs?: number } = {}
  ): void {
    const rateHz = options.rateHz ?? this.config.defaultStreamRateHz;
    const intervalMs = Math.floor(1000 / rateHz);

    this.streamingSetpoint = { v, w };
    this.isStreaming = true;

    // Stop any existing streaming
    if (this.streamingTimer) {
      clearInterval(this.streamingTimer);
    }

    // Start periodic command sending
    this.streamingTimer = setInterval(async () => {
      if (!this.isStreaming) {
        return;
      }

      // Convert v (velocity) and w (turn rate) to left/right motor values
      const left = Math.max(-255, Math.min(255, this.streamingSetpoint.v + this.streamingSetpoint.w));
      const right = Math.max(-255, Math.min(255, this.streamingSetpoint.v - this.streamingSetpoint.w));

      try {
        await wifiRobotClient.directMotor(left, right);
      } catch {
        // Ignore errors during streaming - next iteration will try again
      }
    }, intervalMs);
  }

  /**
   * Update streaming setpoint
   */
  updateStreaming(v: number, w: number): void {
    this.streamingSetpoint = { v, w };
  }

  /**
   * Stop streaming
   */
  stopStreaming(hardStop = true): void {
    this.isStreaming = false;

    if (this.streamingTimer) {
      clearInterval(this.streamingTimer);
      this.streamingTimer = null;
    }

    if (hardStop) {
      wifiRobotClient.stop().catch(() => {
        // Ignore stop errors
      });
    }
  }

  /**
   * Check if streaming is active
   */
  getStreamingState(): boolean {
    return this.isStreaming;
  }

  // ==========================================================================
  // Health Check
  // ==========================================================================

  /**
   * Check ESP32 status
   */
  async checkHealth(): Promise<WiFiStatusResponse | null> {
    return wifiRobotClient.checkStatus();
  }

  /**
   * Get all sensor readings
   */
  async getSensors(): Promise<RobotSensors> {
    const now = Date.now();

    // Fetch all sensors in parallel
    const [distance, left, middle, right, battery] = await Promise.all([
      wifiRobotClient.getUltrasonic("distance").catch(() => 0),
      wifiRobotClient.getLineSensor("left").catch(() => 0),
      wifiRobotClient.getLineSensor("middle").catch(() => 0),
      wifiRobotClient.getLineSensor("right").catch(() => 0),
      wifiRobotClient.getBattery().catch(() => 0),
    ]);

    // Calculate battery percentage (7.4V 2S LiPo: 6.0V=0%, 8.4V=100%)
    const batteryVoltage = battery as number;
    const batteryPercent = Math.max(0, Math.min(100,
      ((batteryVoltage - 6000) / (8400 - 6000)) * 100
    ));

    const sensors: RobotSensors = {
      ultrasonic: {
        distance: distance as number,
        obstacle: (distance as number) > 0 && (distance as number) <= 20,
        timestamp: now,
      },
      lineSensor: {
        left: left as number,
        middle: middle as number,
        right: right as number,
        timestamp: now,
      },
      battery: {
        voltage: batteryVoltage,
        percent: batteryPercent,
        timestamp: now,
      },
    };

    this.updateState({ sensors });
    return sensors;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const robotClient = new RobotClient();

// Re-export types for convenience
export type {
  RobotState,
  RobotDiagnostics,
  RobotConnectionState,
  RobotSensors,
  RobotStatusResponse,
};
