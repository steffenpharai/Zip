/**
 * Robot Bridge WebSocket Client
 * 
 * Manages connection to the ZIP Robot Bridge at ws://localhost:8765/robot
 * Provides command sending, streaming control, and event emission.
 */

import { eventBus } from "@/lib/events/bus";
import type {
  RobotClientMessage,
  RobotBridgeMessage,
  RobotStatusMessage,
  RobotReplyMessage,
  RobotDiagnostics,
  RobotHealthResponse,
  RobotConnectionState,
  RobotState,
  FirmwareCommand,
  MotionOwner,
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
  private ws: WebSocket | null = null;
  private state: RobotState = { ...INITIAL_ROBOT_STATE };
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingCommands = new Map<string, {
    resolve: (reply: RobotReplyMessage) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private messageIdCounter = 0;
  private listeners = new Set<(state: RobotState) => void>();
  private config = DEFAULT_ROBOT_CONFIG;
  private serialLogMaxSize = 100;

  constructor() {
    // Don't auto-connect in constructor - let components call connect()
  }

  // ==========================================================================
  // Connection Management
  // ==========================================================================

  /**
   * Connect to the robot bridge
   */
  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.updateState({ connection: "connecting" });
    
    try {
      this.ws = new WebSocket(this.config.bridgeWsUrl);
      
      this.ws.onopen = () => {
        console.log("[RobotClient] Connected to bridge");
        this.reconnectAttempts = 0;
        this.updateState({ connection: "connected", lastError: null });
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as RobotBridgeMessage;
          this.handleMessage(message);
        } catch (error) {
          console.error("[RobotClient] Failed to parse message:", error);
        }
      };

      this.ws.onerror = (error) => {
        console.error("[RobotClient] WebSocket error:", error);
        this.updateState({ 
          connection: "error", 
          lastError: "WebSocket connection error" 
        });
      };

      this.ws.onclose = () => {
        console.log("[RobotClient] Disconnected from bridge");
        this.ws = null;
        this.updateState({ 
          connection: "disconnected",
          bridgeStatus: null,
        });
        
        // Reject all pending commands
        for (const [id, pending] of this.pendingCommands) {
          clearTimeout(pending.timeout);
          pending.reject(new Error("Connection closed"));
        }
        this.pendingCommands.clear();
        
        // Attempt reconnection
        this.scheduleReconnect();
      };
    } catch (error) {
      console.error("[RobotClient] Failed to create WebSocket:", error);
      this.updateState({ 
        connection: "error", 
        lastError: error instanceof Error ? error.message : "Connection failed" 
      });
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from the robot bridge
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.updateState({ connection: "disconnected" });
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.log("[RobotClient] Max reconnection attempts reached");
      this.updateState({ lastError: "Max reconnection attempts reached" });
      return;
    }

    // Exponential backoff: 2s, 4s, 8s, 16s...
    const delay = this.config.reconnectIntervalMs * Math.pow(2, Math.min(this.reconnectAttempts, 4));
    console.log(`[RobotClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  /**
   * Check if connected and ready
   */
  isReady(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.state.bridgeStatus?.ready === true;
  }

  // ==========================================================================
  // Message Handling
  // ==========================================================================

  /**
   * Handle incoming messages from the bridge
   */
  private handleMessage(message: RobotBridgeMessage): void {
    switch (message.type) {
      case "robot.status":
        this.handleStatus(message);
        break;
      case "robot.reply":
        this.handleReply(message);
        break;
      case "robot.serial.rx":
        this.handleSerialRx(message.line, message.ts);
        break;
      case "robot.error":
        console.error("[RobotClient] Bridge error:", message.code, message.message);
        this.updateState({ lastError: message.message });
        break;
    }
  }

  /**
   * Handle status updates
   */
  private handleStatus(status: RobotStatusMessage): void {
    const connection: RobotConnectionState = status.ready ? "ready" : "handshaking";
    this.updateState({ 
      bridgeStatus: status,
      connection,
    });
    
    // Emit panel update event
    eventBus.emit({
      type: "panel.update",
      panel: "robot",
      payload: {
        ...status,
        connection,
        diagnostics: this.state.diagnostics,
        sensors: this.state.sensors,
      },
      ts: Date.now(),
    });
  }

  /**
   * Handle command replies
   */
  private handleReply(reply: RobotReplyMessage): void {
    const pending = this.pendingCommands.get(reply.id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingCommands.delete(reply.id);
      
      if (reply.ok) {
        pending.resolve(reply);
      } else {
        pending.reject(new Error(reply.error || "Command failed"));
      }
    }

    // Parse diagnostics if present
    if (reply.replyKind === "diagnostics" && reply.diagnostics) {
      const diagnostics = this.parseDiagnostics(reply.diagnostics);
      if (diagnostics) {
        this.updateState({ diagnostics });
      }
    }
  }

  /**
   * Handle serial RX lines (for console log)
   */
  private handleSerialRx(line: string, ts: number): void {
    const serialLog = [...this.state.serialLog];
    serialLog.push({ direction: "rx", line, ts });
    
    // Keep log size bounded
    while (serialLog.length > this.serialLogMaxSize) {
      serialLog.shift();
    }
    
    this.updateState({ serialLog });
  }

  /**
   * Parse diagnostics response from N=120
   * Old format: {<owner><L>,<R>,<stby>,<state>,<resets>}
   *             {stats:rx=<rx>,jd=<jd>,pe=<pe>,bc=<bc>,tx=<tx>,ms=<ms>}
   * New format: {<owner><L>,<R>,<stby>,<state>,<resets>,ram:<ram>,min:<min>}
   *             {stats:rx=<rx>,jd=<jd>,pe=<pe>,tx=<tx>,ms=<ms>}
   */
  private parseDiagnostics(lines: string[]): RobotDiagnostics | null {
    try {
      if (lines.length < 2) return null;

      // Parse first line: {I100,-100,0,1,5[,ram:859,min:853]}
      const line1Match = lines[0].match(/\{([IDX])(-?\d+),(-?\d+),(\d+),(\d+),(\d+)/);
      if (!line1Match) return null;

      // Parse second line: {stats:rx=...,jd=...,pe=...,[bc=...,]tx=...,ms=...}
      const line2Match = lines[1].match(/\{stats:rx=(\d+),jd=(\d+),pe=(\d+)(?:,bc=(\d+))?,tx=(\d+),ms=(\d+)\}/);
      if (!line2Match) return null;

      return {
        owner: line1Match[1] as MotionOwner,
        motorLeft: parseInt(line1Match[2], 10),
        motorRight: parseInt(line1Match[3], 10),
        standby: line1Match[4] === "1",
        state: parseInt(line1Match[5], 10),
        resets: parseInt(line1Match[6], 10),
        stats: {
          rxBytes: parseInt(line2Match[1], 10),
          jsonDecodeErrors: parseInt(line2Match[2], 10),
          parseErrors: parseInt(line2Match[3], 10),
          badCommands: line2Match[4] ? parseInt(line2Match[4], 10) : 0,
          txBytes: parseInt(line2Match[5], 10),
          uptime: parseInt(line2Match[6], 10),
        },
      };
    } catch (error) {
      console.error("[RobotClient] Failed to parse diagnostics:", error);
      return null;
    }
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
    // Immediately call with current state
    listener(this.state);
    
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ==========================================================================
  // Command Sending
  // ==========================================================================

  /**
   * Generate unique message ID
   */
  private generateId(): string {
    return `robot_${Date.now()}_${++this.messageIdCounter}`;
  }

  /**
   * Send a message to the bridge
   */
  private send(message: RobotClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to bridge");
    }
    
    const json = JSON.stringify(message);
    this.ws.send(json);
    
    // Log TX for serial console
    if (message.type === "robot.command") {
      const serialLog = [...this.state.serialLog];
      serialLog.push({
        direction: "tx",
        line: JSON.stringify(message.payload),
        ts: Date.now(),
      });
      while (serialLog.length > this.serialLogMaxSize) {
        serialLog.shift();
      }
      this.updateState({ serialLog });
    }
  }

  /**
   * Send a command and wait for reply
   */
  async sendCommand(
    command: FirmwareCommand,
    options: { expectReply?: boolean; timeoutMs?: number } = {}
  ): Promise<RobotReplyMessage> {
    const id = this.generateId();
    const expectReply = options.expectReply ?? true;
    const timeoutMs = options.timeoutMs ?? this.config.commandTimeoutMs;

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(id);
        reject(new Error(`Command timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      // Store pending command
      if (expectReply) {
        this.pendingCommands.set(id, { resolve, reject, timeout });
      }

      // Send command
      try {
        this.send({
          type: "robot.command",
          id,
          payload: command,
          expectReply,
          timeoutMs,
        });

        // If no reply expected, resolve immediately
        if (!expectReply) {
          clearTimeout(timeout);
          resolve({
            type: "robot.reply",
            id,
            ok: true,
            replyKind: "none",
            token: null,
            diagnostics: null,
            timingMs: 0,
          });
        }
      } catch (error) {
        clearTimeout(timeout);
        this.pendingCommands.delete(id);
        reject(error);
      }
    });
  }

  // ==========================================================================
  // High-Level Commands
  // ==========================================================================

  /**
   * Send hello/ping command
   */
  async hello(): Promise<RobotReplyMessage> {
    return this.sendCommand({
      N: ROBOT_COMMANDS.HELLO,
      H: "hello",
    });
  }

  /**
   * Get diagnostics (N=120)
   * Diagnostics takes longer because the bridge collects multiple lines
   */
  async getDiagnostics(): Promise<RobotDiagnostics | null> {
    const reply = await this.sendCommand({
      N: ROBOT_COMMANDS.DIAGNOSTICS,
      H: "diag",
    }, { timeoutMs: 2000 });
    
    if (reply.diagnostics) {
      const diagnostics = this.parseDiagnostics(reply.diagnostics);
      if (diagnostics) {
        this.updateState({ diagnostics });
      }
      return diagnostics;
    }
    return null;
  }

  /**
   * Emergency stop (N=201)
   */
  async stop(): Promise<RobotReplyMessage> {
    return this.sendCommand({
      N: ROBOT_COMMANDS.STOP,
      H: "stop",
    });
  }

  /**
   * Direct motor control (N=999)
   */
  async directMotor(left: number, right: number): Promise<RobotReplyMessage> {
    return this.sendCommand({
      N: ROBOT_COMMANDS.DIRECT_MOTOR,
      H: "motor",
      D1: Math.max(-255, Math.min(255, Math.round(left))),
      D2: Math.max(-255, Math.min(255, Math.round(right))),
    });
  }

  /**
   * Set servo angle (N=5)
   */
  async setServo(angle: number): Promise<RobotReplyMessage> {
    return this.sendCommand({
      N: ROBOT_COMMANDS.SERVO,
      H: "servo",
      D1: Math.max(0, Math.min(180, Math.round(angle))),
    });
  }

  /**
   * Get ultrasonic distance (N=21)
   */
  async getUltrasonic(mode: "distance" | "obstacle" = "distance"): Promise<number | boolean> {
    const reply = await this.sendCommand({
      N: ROBOT_COMMANDS.ULTRASONIC,
      H: "ultra",
      D1: mode === "distance" ? 2 : 1,
    });
    
    if (reply.token) {
      // Parse {ultra_<value>} or {ultra_true/false}
      const match = reply.token.match(/\{[\w]+_(\w+)\}/);
      if (match) {
        if (mode === "obstacle") {
          return match[1] === "true";
        } else {
          return parseInt(match[1], 10);
        }
      }
    }
    return mode === "obstacle" ? false : 0;
  }

  /**
   * Get line sensor reading (N=22)
   */
  async getLineSensor(sensor: "left" | "middle" | "right"): Promise<number> {
    const sensorMap = { left: 0, middle: 1, right: 2 };
    const reply = await this.sendCommand({
      N: ROBOT_COMMANDS.LINE_SENSOR,
      H: "line",
      D1: sensorMap[sensor],
    });
    
    if (reply.token) {
      const match = reply.token.match(/\{[\w]+_(\d+)\}/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
    return 0;
  }

  /**
   * Get battery voltage (N=23)
   */
  async getBattery(): Promise<number> {
    const reply = await this.sendCommand({
      N: ROBOT_COMMANDS.BATTERY,
      H: "batt",
    });
    
    if (reply.token) {
      const match = reply.token.match(/\{[\w]+_(\d+)\}/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
    return 0;
  }

  // ==========================================================================
  // Streaming Control
  // ==========================================================================

  /**
   * Start setpoint streaming
   */
  async startStreaming(
    v: number,
    w: number,
    options: { rateHz?: number; ttlMs?: number } = {}
  ): Promise<void> {
    const id = this.generateId();
    this.send({
      type: "robot.stream.start",
      id,
      v: Math.max(-255, Math.min(255, Math.round(v))),
      w: Math.max(-255, Math.min(255, Math.round(w))),
      rateHz: options.rateHz ?? this.config.defaultStreamRateHz,
      ttlMs: options.ttlMs ?? this.config.defaultStreamTtlMs,
    });
  }

  /**
   * Update streaming setpoint
   */
  updateStreaming(v: number, w: number, ttlMs?: number): void {
    const id = this.generateId();
    this.send({
      type: "robot.stream.update",
      id,
      v: Math.max(-255, Math.min(255, Math.round(v))),
      w: Math.max(-255, Math.min(255, Math.round(w))),
      ttlMs,
    });
  }

  /**
   * Stop streaming
   */
  async stopStreaming(hardStop = true): Promise<void> {
    const id = this.generateId();
    this.send({
      type: "robot.stream.stop",
      id,
      hardStop,
    });
  }

  // ==========================================================================
  // Health Check (HTTP)
  // ==========================================================================

  /**
   * Check bridge health via HTTP endpoint
   * Returns null if bridge is unavailable (expected when bridge isn't running)
   */
  async checkHealth(): Promise<RobotHealthResponse | null> {
    try {
      // Use AbortController for broader browser support
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${this.config.bridgeHttpUrl}/health`, {
        method: "GET",
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        return null;
      }
      
      return await response.json() as RobotHealthResponse;
    } catch {
      // Network errors are expected when bridge isn't running - don't spam console
      return null;
    }
  }

  /**
   * Emergency stop via HTTP endpoint (backup)
   */
  async httpEmergencyStop(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${this.config.bridgeHttpUrl}/api/robot/stop`, {
        method: "POST",
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      console.error("[RobotClient] HTTP emergency stop failed:", error);
      return false;
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const robotClient = new RobotClient();

// Re-export types for convenience
export type {
  RobotState,
  RobotStatusMessage,
  RobotDiagnostics,
  RobotHealthResponse,
  RobotConnectionState,
  FirmwareCommand,
};

