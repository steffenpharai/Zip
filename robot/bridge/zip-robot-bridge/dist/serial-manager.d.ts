/**
 * Serial Manager - Handles serial port communication
 */
import { type DecodedMessage } from './protocol-handler.js';
export interface SerialManagerEvents {
    onMessage: (msg: DecodedMessage) => void;
    onError: (error: Error) => void;
    onConnect: () => void;
    onDisconnect: () => void;
}
export declare class SerialManager {
    private port;
    private decoder;
    private events;
    private portPath;
    private baudRate;
    private isConnected;
    private reconnectTimer;
    private connectionStartTime;
    constructor(portPath: string, baudRate: number, events: SerialManagerEvents);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    write(data: Uint8Array): void;
    getIsConnected(): boolean;
    getPortPath(): string;
    getBaudRate(): number;
    getConnectionStartTime(): number | null;
    getConnectionUptime(): number;
    private handleDisconnect;
    private scheduleReconnect;
}
//# sourceMappingURL=serial-manager.d.ts.map