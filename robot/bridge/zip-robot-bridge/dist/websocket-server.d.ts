/**
 * WebSocket Server
 */
import { type DecodedMessage } from './protocol-handler.js';
import { SerialManager } from './serial-manager.js';
export interface RobotTelemetry {
    ts_ms: number;
    imu: {
        ax: number;
        ay: number;
        az: number;
        gx: number;
        gy: number;
        gz: number;
        yaw: number;
    };
    ultrasonic_mm: number;
    line_adc: number[];
    batt_mv: number;
    motor_state: {
        left: number;
        right: number;
    };
    mode: number;
}
export interface RobotInfo {
    fw_version: string;
    caps: number;
    pinmap_hash: number;
}
export interface RobotFault {
    fault_code: number;
    detail: string;
}
export interface WebSocketServerEvents {
    onTelemetry: (data: RobotTelemetry) => void;
    onRobotInfo: (info: RobotInfo) => void;
    onFault: (fault: RobotFault) => void;
}
export interface WebSocketStatistics {
    messagesSent: number;
    messagesReceived: number;
    commandsSent: number;
    commandsSucceeded: number;
    commandsFailed: number;
    totalResponseTime: number;
    responseTimeCount: number;
    errors: number;
    lastErrorTime: number | null;
    uptime: number;
}
export declare class RobotWebSocketServer {
    private wss;
    private clients;
    private commandQueue;
    private serialManager;
    private encoder;
    private events;
    private robotInfo;
    private latestTelemetry;
    private startTime;
    private seqMap;
    private stats;
    constructor(port: number, events: WebSocketServerEvents);
    setSerialManager(serialManager: SerialManager): void;
    broadcastConnectionState(): void;
    getLatestTelemetry(): RobotTelemetry | null;
    private handleConnection;
    private handleMessage;
    handleRobotMessage(msg: DecodedMessage): void;
    private handleInfo;
    private handleACK;
    private handleTelemetry;
    private handleFault;
    private broadcast;
    getClientCount(): number;
    getRobotInfo(): RobotInfo | null;
    getStatistics(): WebSocketStatistics;
    getAverageResponseTime(): number;
    getCommandSuccessRate(): number;
    close(): void;
}
//# sourceMappingURL=websocket-server.d.ts.map