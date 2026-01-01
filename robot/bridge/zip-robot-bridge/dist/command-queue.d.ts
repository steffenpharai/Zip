/**
 * Command Queue - Manages command sending with retries and timeouts
 */
export interface CommandResult {
    seq: number;
    ok: boolean;
}
export interface PendingCommand {
    type: number;
    seq: number;
    payload: Uint8Array;
    frame: Uint8Array;
    timestamp: number;
    retries: number;
    resolve: (value: CommandResult) => void;
    reject: (error: Error) => void;
}
export declare class CommandQueue {
    private encoder;
    private pendingCommands;
    private maxRetries;
    private timeoutMs;
    private retryDelayMs;
    private timeoutCheckerInterval;
    constructor();
    /**
     * Cleanup resources - clears interval and rejects pending commands
     */
    cleanup(): void;
    sendCommand(type: number, payload: Uint8Array, writeFn: (data: Uint8Array) => void): Promise<CommandResult>;
    handleACK(seq: number, ok: boolean, errorCode?: number): void;
    private sendFrame;
    private handleTimeout;
    private checkTimeouts;
    getPendingCount(): number;
}
//# sourceMappingURL=command-queue.d.ts.map