/**
 * Robot Bridge TypeScript Types
 * 
 * Type definitions for communication with the ZIP Robot Bridge
 * WebSocket server at ws://localhost:8765/robot
 */

// ============================================================================
// Firmware Command Types
// ============================================================================

/**
 * Firmware command structure (ELEGOO JSON protocol)
 */
export interface FirmwareCommand {
  N: number;      // Command number
  H?: string;     // Tag for response correlation
  D1?: number;    // Parameter 1 (varies by command)
  D2?: number;    // Parameter 2 (varies by command)
  T?: number;     // TTL in ms (for setpoints)
}

/**
 * Command numbers
 */
export const ROBOT_COMMANDS = {
  HELLO: 0,
  SERVO: 5,
  ULTRASONIC: 21,
  LINE_SENSOR: 22,
  BATTERY: 23,
  DIAGNOSTICS: 120,
  SETPOINT: 200,
  STOP: 201,
  MACRO_START: 210,
  MACRO_CANCEL: 211,
  DIRECT_MOTOR: 999,
} as const;

export type RobotCommandNumber = typeof ROBOT_COMMANDS[keyof typeof ROBOT_COMMANDS];

// ============================================================================
// WebSocket Message Types (Client -> Bridge)
// ============================================================================

/**
 * Send a firmware command and wait for response
 */
export interface RobotCommandMessage {
  type: "robot.command";
  id: string;
  payload: FirmwareCommand;
  expectReply?: boolean;
  timeoutMs?: number;
}

/**
 * Start setpoint streaming
 */
export interface StreamStartMessage {
  type: "robot.stream.start";
  id: string;
  rateHz?: number;  // 1-20, default 10
  ttlMs?: number;   // 100-500, default 200
  v: number;        // Forward velocity (-255 to 255)
  w: number;        // Turn rate (-255 to 255)
}

/**
 * Update setpoint during streaming
 */
export interface StreamUpdateMessage {
  type: "robot.stream.update";
  id: string;
  v: number;
  w: number;
  ttlMs?: number;
}

/**
 * Stop streaming
 */
export interface StreamStopMessage {
  type: "robot.stream.stop";
  id: string;
  hardStop?: boolean;  // Send N=201 stop command
}

export type RobotClientMessage =
  | RobotCommandMessage
  | StreamStartMessage
  | StreamUpdateMessage
  | StreamStopMessage;

// ============================================================================
// WebSocket Message Types (Bridge -> Client)
// ============================================================================

/**
 * Response to a command
 */
export interface RobotReplyMessage {
  type: "robot.reply";
  id: string;
  ok: boolean;
  replyKind: "token" | "diagnostics" | "none";
  token: string | null;
  diagnostics: string[] | null;
  timingMs: number;
  error?: string;
}

/**
 * Raw serial line received (for debugging)
 */
export interface RobotSerialRxMessage {
  type: "robot.serial.rx";
  line: string;
  ts: number;
}

/**
 * Bridge status snapshot
 */
export interface RobotStatusMessage {
  type: "robot.status";
  ready: boolean;
  port: string | null;
  baud: number;
  streaming: boolean;
  streamRateHz: number;
  rxBytes: number;
  txBytes: number;
  pending: number;
  lastReadyMsAgo: number | null;
}

/**
 * Bridge error
 */
export interface RobotErrorMessage {
  type: "robot.error";
  code: string;
  message: string;
}

export type RobotBridgeMessage =
  | RobotReplyMessage
  | RobotSerialRxMessage
  | RobotStatusMessage
  | RobotErrorMessage;

// ============================================================================
// Parsed Diagnostic State
// ============================================================================

/**
 * Motion owner states
 */
export type MotionOwner = "I" | "D" | "X";  // Idle, Direct, Stopped

export const MOTION_OWNER_LABELS: Record<MotionOwner, string> = {
  I: "Idle",
  D: "Direct",
  X: "Stopped",
};

/**
 * Parsed diagnostics from N=120 response
 */
export interface RobotDiagnostics {
  owner: MotionOwner;
  motorLeft: number;       // -255 to 255
  motorRight: number;      // -255 to 255
  standby: boolean;
  state: number;           // Motion controller state (0-4)
  resets: number;          // Reset counter
  stats: {
    rxBytes: number;
    jsonDecodeErrors: number;
    parseErrors: number;
    badCommands: number;
    txBytes: number;
    uptime: number;        // in ms
  };
}

// ============================================================================
// Sensor Data Types
// ============================================================================

/**
 * Ultrasonic sensor reading
 */
export interface UltrasonicReading {
  distance: number | null;    // Distance in cm (null if no echo)
  obstacle: boolean;          // True if obstacle within 20cm
  timestamp: number;
}

/**
 * Line sensor readings (3x IR sensors)
 */
export interface LineSensorReading {
  left: number;    // 0-1023 analog value
  middle: number;  // 0-1023 analog value
  right: number;   // 0-1023 analog value
  timestamp: number;
}

/**
 * Battery reading
 */
export interface BatteryReading {
  voltage: number;     // Voltage in mV
  percent: number;     // Estimated percentage (7.4V LiPo: 6.0V=0%, 8.4V=100%)
  timestamp: number;
}

/**
 * Combined sensor data
 */
export interface RobotSensors {
  ultrasonic: UltrasonicReading | null;
  lineSensor: LineSensorReading | null;
  battery: BatteryReading | null;
}

// ============================================================================
// Connection State
// ============================================================================

export type RobotConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "handshaking"
  | "ready"
  | "error";

/**
 * Complete robot state for UI consumption
 */
export interface RobotState {
  connection: RobotConnectionState;
  bridgeStatus: RobotStatusMessage | null;
  diagnostics: RobotDiagnostics | null;
  sensors: RobotSensors;
  serialLog: Array<{
    direction: "rx" | "tx";
    line: string;
    ts: number;
  }>;
  lastError: string | null;
  lastUpdated: number;
}

/**
 * Initial robot state
 */
export const INITIAL_ROBOT_STATE: RobotState = {
  connection: "disconnected",
  bridgeStatus: null,
  diagnostics: null,
  sensors: {
    ultrasonic: null,
    lineSensor: null,
    battery: null,
  },
  serialLog: [],
  lastError: null,
  lastUpdated: 0,
};

// ============================================================================
// Health Check Response
// ============================================================================

/**
 * Response from GET /health on port 8766
 */
export interface RobotHealthResponse {
  status: "ok" | "error";
  serialOpen: boolean;
  ready: boolean;
  port: string | null;
  baud: number;
  streaming: boolean;
  pendingQueueDepth: number;
  lastRxAt: number | null;
  lastTxAt: number | null;
  lastBootMarkerAt: number | null;
  resetsSeen: number;
  rxBytes: number;
  txBytes: number;
  uptime: number;
  timestamp: number;
}

// ============================================================================
// Configuration
// ============================================================================

export interface RobotConfig {
  bridgeWsUrl: string;      // Default: ws://localhost:8765/robot
  bridgeHttpUrl: string;    // Default: http://localhost:8766
  reconnectIntervalMs: number;
  maxReconnectAttempts: number;
  commandTimeoutMs: number;
  defaultStreamRateHz: number;
  defaultStreamTtlMs: number;
}

export const DEFAULT_ROBOT_CONFIG: RobotConfig = {
  bridgeWsUrl: process.env.ROBOT_BRIDGE_WS_URL || "ws://localhost:8765/robot",
  bridgeHttpUrl: process.env.ROBOT_BRIDGE_HTTP_URL || "http://localhost:8766",
  reconnectIntervalMs: 2000,
  maxReconnectAttempts: 10,
  commandTimeoutMs: 1000, // Increased from 250ms for reliability
  defaultStreamRateHz: 10,
  defaultStreamTtlMs: 200,
};

