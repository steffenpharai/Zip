/**
 * Serial Manager - Handles serial port communication
 */

import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { ProtocolDecoder, type DecodedMessage, MSG_TYPE_INFO, MSG_TYPE_ACK, MSG_TYPE_TELEMETRY, MSG_TYPE_FAULT } from './protocol-handler.js';

export interface SerialManagerEvents {
  onMessage: (msg: DecodedMessage) => void;
  onError: (error: Error) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export class SerialManager {
  private port: SerialPort | null = null;
  private decoder = new ProtocolDecoder();
  private events: SerialManagerEvents;
  private portPath: string;
  private baudRate: number;
  private isConnected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectionStartTime: number | null = null;
  
  constructor(portPath: string, baudRate: number, events: SerialManagerEvents) {
    this.portPath = portPath;
    this.baudRate = baudRate;
    this.events = events;
  }
  
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }
    
    try {
      this.port = new SerialPort({
        path: this.portPath,
        baudRate: this.baudRate,
        autoOpen: false,
      });
      
      this.port.on('open', () => {
        this.isConnected = true;
        this.connectionStartTime = Date.now();
        console.log(`[SerialManager] Connected to ${this.portPath}`);
        this.events.onConnect();
      });
      
      this.port.on('error', (error) => {
        console.error('[SerialManager] Error:', error);
        this.handleDisconnect();
        this.events.onError(error);
      });
      
      this.port.on('close', () => {
        console.log('[SerialManager] Port closed');
        this.handleDisconnect();
      });
      
      // Process incoming bytes
      this.port.on('data', (data: Buffer) => {
        // Try to decode as text only for firmware initialization messages
        try {
          const text = data.toString('utf8');
          if (text.match(/[a-zA-Z0-9]/)) {  // Contains printable characters
            // Only log initialization messages, not binary data
            if (text.includes('Initialization complete') || text.includes('Ready for commands')) {
              console.log(`[SerialManager] ${text.trim()}`);
            }
          }
        } catch (e) {
          // Not text, ignore
        }
        
        // Process bytes through protocol decoder
        for (const byte of data) {
          if (this.decoder.processByte(byte)) {
            const msg = this.decoder.getMessage();
            if (msg) {
              // Only log on errors, success is handled by ProtocolDecoder if needed
              if (!msg.valid) {
                console.log(`[SerialManager] ⚠️ Invalid message: type=0x${msg.type.toString(16)}, seq=${msg.seq}`);
              }
              this.events.onMessage(msg);
            }
          }
        }
      });
      
      await new Promise<void>((resolve, reject) => {
        if (!this.port) {
          reject(new Error('Port not initialized'));
          return;
        }
        
        this.port.open((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
      
    } catch (error) {
      console.error('[SerialManager] Connection failed:', error);
      this.scheduleReconnect();
      throw error;
    }
  }
  
  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.port && this.isConnected) {
      return new Promise<void>((resolve) => {
        this.port!.close(() => {
          this.isConnected = false;
          this.events.onDisconnect();
          resolve();
        });
      });
    }
  }
  
  write(data: Uint8Array): void {
    if (this.port && this.isConnected) {
      // Log raw bytes for debugging
      const hex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ');
      console.log(`[SerialManager] Sending ${data.length} bytes: ${hex}`);
      this.port.write(Buffer.from(data));
    }
  }
  
  getIsConnected(): boolean {
    return this.isConnected;
  }
  
  getPortPath(): string {
    return this.portPath;
  }
  
  getBaudRate(): number {
    return this.baudRate;
  }
  
  getConnectionStartTime(): number | null {
    return this.connectionStartTime;
  }
  
  getConnectionUptime(): number {
    if (!this.connectionStartTime) {
      return 0;
    }
    return Date.now() - this.connectionStartTime;
  }
  
  private handleDisconnect(): void {
    this.isConnected = false;
    this.connectionStartTime = null;
    this.events.onDisconnect();
    this.scheduleReconnect();
  }
  
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return; // Already scheduled
    }
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log('[SerialManager] Attempting reconnect...');
      this.connect().catch((error) => {
        console.error('[SerialManager] Reconnect failed:', error);
      });
    }, 2000); // Retry after 2 seconds
  }
}

