/**
 * Command Queue - Manages command sending with retries and timeouts
 */

import { ProtocolEncoder } from './protocol-handler.js';

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

export class CommandQueue {
  private encoder = new ProtocolEncoder();
  private pendingCommands = new Map<number, PendingCommand>();
  private maxRetries = 3;
  private timeoutMs = 2000;
  private retryDelayMs = 500;
  private timeoutCheckerInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    // Start timeout checker
    this.timeoutCheckerInterval = setInterval(() => this.checkTimeouts(), 100);
  }
  
  /**
   * Cleanup resources - clears interval and rejects pending commands
   */
  cleanup(): void {
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
  
  async sendCommand(
    type: number,
    payload: Uint8Array,
    writeFn: (data: Uint8Array) => void
  ): Promise<CommandResult> {
    const seq = this.encoder.getNextSeq();
    const frame = this.encoder.encode(type, seq, payload);
    
    return new Promise((resolve, reject) => {
      const command: PendingCommand = {
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
  
  handleACK(seq: number, ok: boolean, errorCode?: number): void {
    const command = this.pendingCommands.get(seq);
    if (!command) {
      return; // Unknown sequence number
    }
    
    this.pendingCommands.delete(seq);
    
    if (ok) {
      command.resolve({ seq, ok: true });
    } else {
      command.reject(new Error(`Command failed with error code: ${errorCode || 0}`));
    }
  }
  
  private sendFrame(frame: Uint8Array, writeFn: (data: Uint8Array) => void): void {
    writeFn(frame);
  }
  
  private handleTimeout(seq: number, writeFn: (data: Uint8Array) => void): void {
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
    } else {
      // Max retries exceeded
      this.pendingCommands.delete(seq);
      command.reject(new Error('Command timeout: max retries exceeded'));
    }
  }
  
  private checkTimeouts(): void {
    const now = Date.now();
    for (const [seq, command] of this.pendingCommands.entries()) {
      if (now - command.timestamp > this.timeoutMs) {
        // Will be handled by timeout handler
      }
    }
  }
  
  getPendingCount(): number {
    return this.pendingCommands.size;
  }
}

