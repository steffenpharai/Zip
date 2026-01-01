/**
 * WebSocket Server
 */

import { WebSocketServer, WebSocket } from 'ws';
import { ProtocolEncoder, MSG_TYPE_HELLO, MSG_TYPE_SET_MODE, MSG_TYPE_DRIVE_TWIST, MSG_TYPE_DRIVE_TANK, MSG_TYPE_SERVO, MSG_TYPE_LED, MSG_TYPE_E_STOP, MSG_TYPE_CONFIG_SET, MSG_TYPE_INFO, MSG_TYPE_ACK, MSG_TYPE_TELEMETRY, MSG_TYPE_FAULT, PROTOCOL_MAX_PAYLOAD_SIZE, type DecodedMessage } from './protocol-handler.js';
import { CommandQueue } from './command-queue.js';
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

export class RobotWebSocketServer {
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();
  private commandQueue: CommandQueue;
  private serialManager: SerialManager | null = null;
  private encoder = new ProtocolEncoder();
  private events: WebSocketServerEvents;
  private robotInfo: RobotInfo | null = null;
  private latestTelemetry: RobotTelemetry | null = null;
  private startTime: number = Date.now();
  // Map protocol seq -> { ws, clientSeq, resolve, startTime } for ACK forwarding
  private seqMap = new Map<number, { 
    ws: WebSocket; 
    clientSeq: number; 
    resolve?: (value: { ok: boolean; message?: string }) => void;
    startTime?: number;
  }>();
  // Statistics tracking
  private stats: WebSocketStatistics = {
    messagesSent: 0,
    messagesReceived: 0,
    commandsSent: 0,
    commandsSucceeded: 0,
    commandsFailed: 0,
    totalResponseTime: 0,
    responseTimeCount: 0,
    errors: 0,
    lastErrorTime: null,
    uptime: 0,
  };
  
  constructor(port: number, events: WebSocketServerEvents) {
    this.wss = new WebSocketServer({ port });
    this.commandQueue = new CommandQueue();
    this.events = events;
    
    this.wss.on('connection', (ws: WebSocket) => {
      this.handleConnection(ws);
    });
    
    console.log(`[WebSocketServer] Listening on ws://localhost:${port}/robot`);
  }
  
  setSerialManager(serialManager: SerialManager): void {
    this.serialManager = serialManager;
    // Broadcast connection state change
    this.broadcastConnectionState();
  }
  
  broadcastConnectionState(): void {
    const serialConnected = this.serialManager?.getIsConnected() || false;
    this.broadcast({ 
      type: 'connection_state', 
      data: { 
        connected: serialConnected,
        serialPort: this.serialManager?.getPortPath() || null,
        baudRate: this.serialManager?.getBaudRate() || null,
      } 
    });
  }
  
  getLatestTelemetry(): RobotTelemetry | null {
    return this.latestTelemetry;
  }
  
  private handleConnection(ws: WebSocket): void {
    this.clients.add(ws);
    console.log(`[WebSocketServer] Client connected (${this.clients.size} total)`);
    
    // Send robot info if available
    if (this.robotInfo) {
      ws.send(JSON.stringify({ type: 'info', data: this.robotInfo }));
    }
    
    // Send latest telemetry if available
    if (this.latestTelemetry) {
      ws.send(JSON.stringify({ type: 'telemetry', data: this.latestTelemetry }));
    }
    
    // Send connection state
    const serialConnected = this.serialManager?.getIsConnected() || false;
    ws.send(JSON.stringify({ 
      type: 'connection_state', 
      data: { 
        connected: serialConnected,
        serialPort: this.serialManager?.getPortPath() || null,
        baudRate: this.serialManager?.getBaudRate() || null,
      } 
    }));
    
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(ws, message);
      } catch (error) {
        console.error('[WebSocketServer] Invalid message:', error);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      }
    });
    
    ws.on('close', () => {
      this.clients.delete(ws);
      console.log(`[WebSocketServer] Client disconnected (${this.clients.size} total)`);
    });
    
    ws.on('error', (error: Error) => {
      console.error('[WebSocketServer] WebSocket error:', error);
    });
  }
  
  private async handleMessage(ws: WebSocket, message: { type: string; cmd?: string; payload?: unknown; seq?: number }): Promise<void> {
    if (message.type !== 'command') {
      return;
    }
    
    if (!this.serialManager || !this.serialManager.getIsConnected()) {
      ws.send(JSON.stringify({ type: 'ack', seq: message.seq, ok: false, message: 'Robot not connected' }));
      return;
    }
    
    try {
      // Convert command to protocol message
      const { cmd, payload, seq: clientSeq } = message;
      const payloadJson = JSON.stringify(payload);
      const payloadBytes = new TextEncoder().encode(payloadJson);
      
      // Validate payload size (must match firmware limit of 64 bytes)
      if (payloadBytes.length > PROTOCOL_MAX_PAYLOAD_SIZE) {
        ws.send(JSON.stringify({ 
          type: 'ack', 
          seq: clientSeq, 
          ok: false, 
          message: `Payload size ${payloadBytes.length} exceeds maximum ${PROTOCOL_MAX_PAYLOAD_SIZE} bytes` 
        }));
        return;
      }
      
      let msgType: number;
      switch (cmd) {
        case 'HELLO':
          msgType = MSG_TYPE_HELLO;
          break;
        case 'SET_MODE':
          msgType = MSG_TYPE_SET_MODE;
          break;
        case 'DRIVE_TWIST':
          msgType = MSG_TYPE_DRIVE_TWIST;
          break;
        case 'DRIVE_TANK':
          msgType = MSG_TYPE_DRIVE_TANK;
          break;
        case 'SERVO':
          msgType = MSG_TYPE_SERVO;
          break;
        case 'LED':
          msgType = MSG_TYPE_LED;
          break;
        case 'E_STOP':
          msgType = MSG_TYPE_E_STOP;
          break;
        case 'CONFIG_SET':
          msgType = MSG_TYPE_CONFIG_SET;
          break;
        default:
          ws.send(JSON.stringify({ type: 'ack', seq: clientSeq, ok: false, message: `Unknown command: ${cmd}` }));
          return;
      }
      
      // Track command statistics
      this.stats.commandsSent++;
      const commandStartTime = Date.now();
      
      // Send command via queue and wait for robot ACK
      // The queue will generate its own protocol seq
      let protocolSeq: number | null = null;
      let ackResolver: ((value: { ok: boolean; message?: string }) => void) | null = null;
      
      // Create promise that resolves when robot ACK arrives
      const ackPromise = new Promise<{ ok: boolean; message?: string }>((resolve) => {
        ackResolver = resolve;
      });
      
      // Send command via queue
      const queuePromise = this.commandQueue.sendCommand(
        msgType,
        payloadBytes,
        (data) => {
          // Extract protocol seq from frame (SEQ is at index 4: after 0xAA, 0x55, LEN, TYPE)
          if (data.length >= 5 && protocolSeq === null) {
            protocolSeq = data[4];
            console.log(`[WebSocketServer] Sending command: protocolSeq=${protocolSeq}, clientSeq=${clientSeq || 0}, cmd=${cmd}`);
            // Map protocol seq to client seq and resolver
            this.seqMap.set(protocolSeq, { 
              ws, 
              clientSeq: clientSeq || 0,
              resolve: ackResolver!,
              startTime: commandStartTime,
            });
            this.stats.messagesSent++;
          }
          this.serialManager!.write(data);
        }
      ).catch((error) => {
        // If command queue fails (e.g., serial error), resolve ackPromise with error
        console.error(`[WebSocketServer] Command queue error:`, error);
        if (ackResolver) {
          ackResolver({ ok: false, message: error instanceof Error ? error.message : String(error) });
        }
        throw error; // Re-throw to maintain error propagation
      });
      
      // Wait for either ackPromise (which resolves when ACK is forwarded to client)
      // or timeout
      const timeoutPromise = new Promise<{ ok: boolean; message: string }>((resolve) => {
        setTimeout(() => {
          if (protocolSeq !== null) {
            console.log(`[WebSocketServer] Command timeout: protocolSeq=${protocolSeq}`);
            const mapping = this.seqMap.get(protocolSeq);
            if (mapping && mapping.resolve) {
              mapping.resolve({ ok: false, message: 'Command timeout' });
            }
            this.seqMap.delete(protocolSeq);
          }
          resolve({ ok: false, message: 'Command timeout' });
        }, 5000);
      });
      
      try {
        // Wait for ackPromise to resolve (which happens when handleACK forwards ACK to client)
        // This ensures the ACK message is sent to the WebSocket client before we continue
        const result = await Promise.race([ackPromise, timeoutPromise]);
        
        // If we got here from timeoutPromise and ACK wasn't sent yet, send error ACK
        if (protocolSeq !== null && this.seqMap.has(protocolSeq)) {
          // Timeout occurred, send error ACK if not already sent
          console.log(`[WebSocketServer] Command timeout for client: cmd=${cmd}, protocolSeq=${protocolSeq}, clientSeq=${clientSeq}`);
          this.stats.commandsFailed++;
          ws.send(JSON.stringify({ 
            type: 'ack', 
            seq: clientSeq || 0, 
            ok: false,
            message: 'Command timeout - robot did not respond'
          }));
          this.seqMap.delete(protocolSeq);
        }
        // Otherwise, handleACK already sent the ACK via ackPromise resolution
      } catch (error) {
        console.error(`[WebSocketServer] Command error:`, error);
        if (protocolSeq !== null) {
          this.seqMap.delete(protocolSeq);
        }
        ws.send(JSON.stringify({ 
          type: 'ack', 
          seq: clientSeq || 0, 
          ok: false,
          message: error instanceof Error ? error.message : String(error)
        }));
      }
      
    } catch (error) {
      console.error('[WebSocketServer] Command error:', error);
      const clientSeq = message.seq || 0;
      ws.send(JSON.stringify({ 
        type: 'ack', 
        seq: clientSeq, 
        ok: false, 
        message: error instanceof Error ? error.message : String(error) 
      }));
    }
  }
  
  handleRobotMessage(msg: DecodedMessage): void {
    switch (msg.type) {
      case MSG_TYPE_INFO:
        this.handleInfo(msg);
        break;
      case MSG_TYPE_ACK:
        this.handleACK(msg);
        break;
      case MSG_TYPE_TELEMETRY:
        this.handleTelemetry(msg);
        break;
      case MSG_TYPE_FAULT:
        this.handleFault(msg);
        break;
    }
  }
  
  private handleInfo(msg: DecodedMessage): void {
    try {
      const json = new TextDecoder().decode(msg.payload);
      this.robotInfo = JSON.parse(json) as RobotInfo;
      
      // Track statistics
      this.stats.messagesReceived++;
      
      // Call event handler with non-null info
      if (this.robotInfo) {
        this.events.onRobotInfo(this.robotInfo);
        // Broadcast to all clients
        this.broadcast({ type: 'info', data: this.robotInfo });
      }
    } catch (error) {
      console.error('[WebSocketServer] Failed to parse INFO:', error);
      this.stats.errors++;
      this.stats.lastErrorTime = Date.now();
    }
  }
  
  private handleACK(msg: DecodedMessage): void {
    try {
      const json = new TextDecoder().decode(msg.payload);
      const ack = JSON.parse(json);
      
      console.log(`[WebSocketServer] Received ACK from robot: seq=${msg.seq}, ok=${ack.ok}, err=${ack.err || 0}`);
      
      // Track statistics
      const seqMapping = this.seqMap.get(msg.seq);
      if (seqMapping && seqMapping.startTime) {
        const responseTime = Date.now() - seqMapping.startTime;
        this.stats.totalResponseTime += responseTime;
        this.stats.responseTimeCount++;
        
        if (ack.ok !== false) {
          this.stats.commandsSucceeded++;
        } else {
          this.stats.commandsFailed++;
          console.log(`[WebSocketServer] Command failed: seq=${msg.seq}, error=${ack.err || 0}, message=${ack.message || 'none'}`);
        }
      }
      
      // First, handle in command queue (this resolves the queue's promise)
      this.commandQueue.handleACK(msg.seq, ack.ok, ack.err);
      
      // Then forward ACK to WebSocket client if we have a mapping
      if (seqMapping) {
        console.log(`[WebSocketServer] Forwarding ACK to WebSocket: protocolSeq=${msg.seq}, clientSeq=${seqMapping.clientSeq}`);
        
        // Send ACK to WebSocket client FIRST (before resolving promise)
        if (seqMapping.ws.readyState === WebSocket.OPEN) {
          seqMapping.ws.send(JSON.stringify({
            type: 'ack',
            seq: seqMapping.clientSeq,
            ok: ack.ok !== false,
            message: ack.message
          }));
        }
        
        // Then resolve the promise (this unblocks the await in handleMessage)
        if (seqMapping.resolve) {
          seqMapping.resolve({ ok: ack.ok !== false, message: ack.message });
        }
        
        // Clean up mapping
        this.seqMap.delete(msg.seq);
      } else {
        console.log(`[WebSocketServer] No WebSocket mapping for protocol seq=${msg.seq} (command may have been sent directly)`);
      }
    } catch (error) {
      console.error('[WebSocketServer] Failed to parse ACK:', error);
      this.stats.errors++;
      this.stats.lastErrorTime = Date.now();
    }
  }
  
  private handleTelemetry(msg: DecodedMessage): void {
    try {
      const json = new TextDecoder().decode(msg.payload);
      const data = JSON.parse(json) as RobotTelemetry;
      this.latestTelemetry = data;
      this.events.onTelemetry(data);
      
      // Track statistics
      this.stats.messagesReceived++;
      
      // Broadcast to all clients
      this.broadcast({ type: 'telemetry', data });
    } catch (error) {
      console.error('[WebSocketServer] Failed to parse TELEMETRY:', error);
      this.stats.errors++;
      this.stats.lastErrorTime = Date.now();
    }
  }
  
  private handleFault(msg: DecodedMessage): void {
    try {
      const json = new TextDecoder().decode(msg.payload);
      const fault = JSON.parse(json);
      this.events.onFault(fault);
      
      // Track statistics
      this.stats.messagesReceived++;
      this.stats.errors++;
      this.stats.lastErrorTime = Date.now();
      
      // Broadcast to all clients
      this.broadcast({ type: 'fault', data: fault });
    } catch (error) {
      console.error('[WebSocketServer] Failed to parse FAULT:', error);
      this.stats.errors++;
      this.stats.lastErrorTime = Date.now();
    }
  }
  
  private broadcast(message: { type: string; data?: unknown; seq?: number; ok?: boolean; message?: string }): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }
  
  getClientCount(): number {
    return this.clients.size;
  }
  
  getRobotInfo(): RobotInfo | null {
    return this.robotInfo;
  }
  
  getStatistics(): WebSocketStatistics {
    this.stats.uptime = Date.now() - this.startTime;
    return { ...this.stats };
  }
  
  getAverageResponseTime(): number {
    if (this.stats.responseTimeCount === 0) {
      return 0;
    }
    return Math.round(this.stats.totalResponseTime / this.stats.responseTimeCount);
  }
  
  getCommandSuccessRate(): number {
    if (this.stats.commandsSent === 0) {
      return 0;
    }
    return Math.round((this.stats.commandsSucceeded / this.stats.commandsSent) * 100);
  }
  
  close(): void {
    // Cleanup command queue
    this.commandQueue.cleanup();
    
    // Close all WebSocket connections
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.close();
      }
    }
    this.clients.clear();
    
    // Close WebSocket server
    this.wss.close();
  }
}

