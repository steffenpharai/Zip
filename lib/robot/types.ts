/**
 * Robot TypeScript Types
 * 
 * Type definitions for communication with the ZIP Robot via WiFi.
 * All communication goes through HTTP to the ESP32, which forwards
 * commands to the Arduino UNO via Serial2.
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
// HTTP Response Types (ESP32 API)
// ============================================================================

/**
 * Response from POST /api/robot/command
 */
export interface RobotCommandResponse {
  ok: boolean;
  token?: string;
  diagnostics?: string[];
  error?: string;
  timingMs: number;
}

/**
 * Response from GET /api/robot/status
 */
export interface RobotStatusResponse {
  connected: boolean;
  rxBytes: number;
  txBytes: number;
  commands: number;
  errors: number;
  uptime: number;
  lastResponseMs: number;
}

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

/**
 * Simplified connection state for HTTP-based communication
 */
export type RobotConnectionState =
  | "disconnected"  // Not connected to ESP32 WiFi
  | "connected"     // Connected to ESP32 WiFi, robot responding
  | "error";        // Connection error

/**
 * Complete robot state for UI consumption
 */
export interface RobotState {
  connection: RobotConnectionState;
  esp32Status: RobotStatusResponse | null;
  diagnostics: RobotDiagnostics | null;
  sensors: RobotSensors;
  lastError: string | null;
  lastUpdated: number;
}

/**
 * Initial robot state
 */
export const INITIAL_ROBOT_STATE: RobotState = {
  connection: "disconnected",
  esp32Status: null,
  diagnostics: null,
  sensors: {
    ultrasonic: null,
    lineSensor: null,
    battery: null,
  },
  lastError: null,
  lastUpdated: 0,
};

// ============================================================================
// Configuration
// ============================================================================

/**
 * WiFi Robot Configuration
 */
export interface RobotConfig {
  /** ESP32 base URL (default: http://192.168.4.1) */
  esp32BaseUrl: string;
  /** Request timeout in ms */
  commandTimeoutMs: number;
  /** Status polling interval in ms */
  statusPollingMs: number;
  /** Diagnostics polling interval in ms */
  diagnosticsPollingMs: number;
  /** Streaming rate for motion commands */
  defaultStreamRateHz: number;
  /** TTL for motion commands */
  defaultStreamTtlMs: number;
}

export const DEFAULT_ROBOT_CONFIG: RobotConfig = {
  esp32BaseUrl: process.env.NEXT_PUBLIC_ESP32_URL || "http://192.168.4.1",
  commandTimeoutMs: 2000,
  statusPollingMs: 5000,
  diagnosticsPollingMs: 2000,
  defaultStreamRateHz: 10,
  defaultStreamTtlMs: 200,
};

// ============================================================================
// Legacy Types (for backward compatibility during migration)
// ============================================================================

/**
 * @deprecated Use RobotStatusResponse instead
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
 * @deprecated Use RobotCommandResponse instead
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
 * @deprecated No longer used with HTTP-based communication
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
