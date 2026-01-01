/**
 * Command Queue - Manages command sending with retries and timeouts
 */
import { ProtocolEncoder } from './protocol-handler.js';
export class CommandQueue {
    encoder = new ProtocolEncoder();
    pendingCommands = new Map();
    maxRetries = 3;
    timeoutMs = 2000;
    retryDelayMs = 500;
    timeoutCheckerInterval = null;
    constructor() {
        // Start timeout checker
        this.timeoutCheckerInterval = setInterval(() => this.checkTimeouts(), 100);
    }
    /**
     * Cleanup resources - clears interval and rejects pending commands
     */
    cleanup() {
        if (this.timeoutCheckerInterval) {
            clearInterval(this.timeoutCheckerInterval);
            this.timeoutCheckerInterval = null;
        }
        // Reject all pending commands
        for (const [seq, command] of this.pendingCommands.entries()) {
            command.reject(new Error('Command queue shutdown'));
        }
        this.pendingCommands.clear();
    }
    async sendCommand(type, payload, writeFn) {
        const seq = this.encoder.getNextSeq();
        const frame = this.encoder.encode(type, seq, payload);
        return new Promise((resolve, reject) => {
            const command = {
                type,
                seq,
                payload,
                frame,
                timestamp: Date.now(),
                retries: 0,
                resolve,
                reject,
            };
            this.pendingCommands.set(seq, command);
            this.sendFrame(frame, writeFn);
            // Set timeout
            setTimeout(() => {
                if (this.pendingCommands.has(seq)) {
                    this.handleTimeout(seq, writeFn);
                }
            }, this.timeoutMs);
        });
    }
    handleACK(seq, ok, errorCode) {
        const command = this.pendingCommands.get(seq);
        if (!command) {
            return; // Unknown sequence number
        }
        this.pendingCommands.delete(seq);
        if (ok) {
            command.resolve({ seq, ok: true });
        }
        else {
            command.reject(new Error(`Command failed with error code: ${errorCode || 0}`));
        }
    }
    sendFrame(frame, writeFn) {
        writeFn(frame);
    }
    handleTimeout(seq, writeFn) {
        const command = this.pendingCommands.get(seq);
        if (!command) {
            return;
        }
        if (command.retries < this.maxRetries) {
            // Retry
            command.retries++;
            command.timestamp = Date.now();
            console.log(`[CommandQueue] Retrying command seq=${seq}, attempt=${command.retries}`);
            setTimeout(() => {
                this.sendFrame(command.frame, writeFn);
            }, this.retryDelayMs);
        }
        else {
            // Max retries exceeded
            this.pendingCommands.delete(seq);
            command.reject(new Error('Command timeout: max retries exceeded'));
        }
    }
    checkTimeouts() {
        const now = Date.now();
        for (const [seq, command] of this.pendingCommands.entries()) {
            if (now - command.timestamp > this.timeoutMs) {
                // Will be handled by timeout handler
            }
        }
    }
    getPendingCount() {
        return this.pendingCommands.size;
    }
}
//# sourceMappingURL=command-queue.js.map