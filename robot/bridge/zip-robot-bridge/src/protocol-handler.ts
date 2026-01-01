/**
 * Protocol Handler - Binary Protocol Encode/Decode
 */

import { calculateCRC16 } from './crc16.js';

const PROTOCOL_HEADER_0 = 0xAA;
const PROTOCOL_HEADER_1 = 0x55;

// Protocol limits (must match firmware)
export const PROTOCOL_MAX_PAYLOAD_SIZE = 64;  // Matches firmware PROTOCOL_MAX_PAYLOAD_SIZE
export const PROTOCOL_MAX_FRAME_SIZE = 4 + PROTOCOL_MAX_PAYLOAD_SIZE + 2;  // Header(2) + LEN(1) + TYPE(1) + SEQ(1) + PAYLOAD + CRC16(2)

// Message types
export const MSG_TYPE_HELLO = 0x01;
export const MSG_TYPE_SET_MODE = 0x02;
export const MSG_TYPE_DRIVE_TWIST = 0x03;
export const MSG_TYPE_DRIVE_TANK = 0x04;
export const MSG_TYPE_SERVO = 0x05;
export const MSG_TYPE_LED = 0x06;
export const MSG_TYPE_E_STOP = 0x07;
export const MSG_TYPE_CONFIG_SET = 0x08;

export const MSG_TYPE_INFO = 0x81;
export const MSG_TYPE_ACK = 0x82;
export const MSG_TYPE_TELEMETRY = 0x83;
export const MSG_TYPE_FAULT = 0x84;

export interface DecodedMessage {
  type: number;
  seq: number;
  payload: Uint8Array;
  valid: boolean;
}

export class ProtocolEncoder {
  private nextSeq = 1;
  
  getNextSeq(): number {
    const seq = this.nextSeq;
    this.nextSeq++;
    if (this.nextSeq === 0) {
      this.nextSeq = 1;
    }
    return seq;
  }
  
  encode(type: number, seq: number, payload: Uint8Array): Uint8Array {
    // Frame: [0xAA 0x55][LEN][TYPE][SEQ][PAYLOAD...][CRC16]
    // Validate payload size (must match firmware limit)
    if (payload.length > PROTOCOL_MAX_PAYLOAD_SIZE) {
      throw new Error(`Payload size ${payload.length} exceeds maximum ${PROTOCOL_MAX_PAYLOAD_SIZE} bytes`);
    }
    
    const len = 1 + 1 + payload.length; // TYPE + SEQ + PAYLOAD
    const frameSize = 2 + 1 + len + 2; // HEADER(2) + LEN(1) + DATA + CRC16(2)
    
    const frame = new Uint8Array(frameSize);
    let pos = 0;
    
    // Header
    frame[pos++] = PROTOCOL_HEADER_0;
    frame[pos++] = PROTOCOL_HEADER_1;
    
    // Length
    frame[pos++] = len;
    
    // Type and Seq
    frame[pos++] = type;
    frame[pos++] = seq;
    
    // Payload
    frame.set(payload, pos);
    pos += payload.length;
    
    // Calculate CRC16 over LEN..PAYLOAD
    const crcData = frame.slice(2, pos);
    const crc = calculateCRC16(crcData);
    
    // Append CRC16 (little-endian)
    frame[pos++] = crc & 0xFF;
    frame[pos++] = (crc >> 8) & 0xFF;
    
    return frame;
  }
}

export class ProtocolDecoder {
  private state: 'WAIT_HEADER_0' | 'WAIT_HEADER_1' | 'WAIT_LEN' | 'WAIT_TYPE' | 'WAIT_SEQ' | 'WAIT_PAYLOAD' | 'WAIT_CRC_0' | 'WAIT_CRC_1' = 'WAIT_HEADER_0';
  private buffer: number[] = [];
  private expectedLen = 0;
  private expectedPayloadLen = 0;
  private message: DecodedMessage = { type: 0, seq: 0, payload: new Uint8Array(0), valid: false };
  
  processByte(byte: number): boolean {
    switch (this.state) {
      case 'WAIT_HEADER_0':
        if (byte === PROTOCOL_HEADER_0) {
          this.buffer = [byte];
          this.state = 'WAIT_HEADER_1';
        }
        break;
        
      case 'WAIT_HEADER_1':
        if (byte === PROTOCOL_HEADER_1) {
          this.buffer.push(byte);
          this.state = 'WAIT_LEN';
        } else {
          this.reset();
        }
        break;
        
      case 'WAIT_LEN':
        this.expectedLen = byte;
        // Validate length: min 2 (TYPE + SEQ), max matches firmware limit
        // LEN = TYPE(1) + SEQ(1) + PAYLOAD, so max LEN = 2 + PROTOCOL_MAX_PAYLOAD_SIZE
        if (this.expectedLen < 2 || this.expectedLen > (2 + PROTOCOL_MAX_PAYLOAD_SIZE)) {
          this.reset();
          break;
        }
        this.buffer.push(byte);
        this.expectedPayloadLen = this.expectedLen - 2; // TYPE + SEQ
        this.state = 'WAIT_TYPE';
        break;
        
      case 'WAIT_TYPE':
        this.message.type = byte;
        this.buffer.push(byte);
        this.state = 'WAIT_SEQ';
        break;
        
      case 'WAIT_SEQ':
        this.message.seq = byte;
        this.buffer.push(byte);
        if (this.expectedPayloadLen > 0) {
          this.state = 'WAIT_PAYLOAD';
          this.message.payload = new Uint8Array(0); // Start with empty payload, grow as bytes arrive
        } else {
          this.state = 'WAIT_CRC_0';
        }
        break;
        
      case 'WAIT_PAYLOAD':
        if (this.message.payload.length < this.expectedPayloadLen) {
          // Add byte to payload
          const newPayload = new Uint8Array(this.message.payload.length + 1);
          newPayload.set(this.message.payload);
          newPayload[this.message.payload.length] = byte;
          this.message.payload = newPayload;
          this.buffer.push(byte);
          
          // Check if payload is now complete
          if (this.message.payload.length >= this.expectedPayloadLen) {
            // Payload complete, transition to CRC state
            // Next byte will be processed as CRC low byte
            this.state = 'WAIT_CRC_0';
          }
        } else {
          // Payload length >= expectedPayloadLen but we're still in WAIT_PAYLOAD
          // This means the state didn't transition properly, or we received an extra byte
          // This byte is likely the first CRC byte - transition to CRC state and process it
          // Silently recover - this can happen with split frames
          this.buffer.push(byte);
          this.state = 'WAIT_CRC_1';
          // Next byte will be processed as CRC high byte
        }
        break;
        
      case 'WAIT_CRC_0':
        this.buffer.push(byte);
        this.state = 'WAIT_CRC_1';
        break;
        
      case 'WAIT_CRC_1':
        this.buffer.push(byte);
        
        // Validate frame
        if (this.validateFrame()) {
          this.message.valid = true;
          const result = { ...this.message };
          // Only log errors, not every successful decode (too verbose)
          this.reset();
          return true;
        } else {
          // validateFrame() already logs detailed debug info
          console.log(`[ProtocolDecoder] ❌ CRC validation failed: len=${this.expectedLen}, type=0x${this.message.type.toString(16)}, seq=${this.message.seq}`);
          this.reset();
        }
        break;
    }
    
    // Check for buffer overflow
    if (this.buffer.length >= 256) {
      this.reset();
    }
    
    return false;
  }
  
  private validateFrame(): boolean {
    // Frame structure: [0xAA 0x55][LEN][TYPE][SEQ][PAYLOAD...][CRC_LOW][CRC_HIGH]
    // Buffer should be: header(2) + LEN(1) + TYPE(1) + SEQ(1) + PAYLOAD + CRC(2)
    // Expected buffer length: 2 + 1 + expectedLen + 2 = 5 + expectedLen
    
    const expectedBufferLen = 2 + 1 + this.expectedLen + 2; // Header + LEN + DATA + CRC
    if (this.buffer.length !== expectedBufferLen) {
      console.log(`[ProtocolDecoder] ⚠️ Buffer length mismatch: expected ${expectedBufferLen}, got ${this.buffer.length}, len=${this.expectedLen}`);
      return false;
    }
    
    // Calculate CRC16 over LEN..PAYLOAD (everything after header, before CRC)
    // CRC covers: LEN + TYPE + SEQ + PAYLOAD
    const dataLen = 1 + this.expectedLen; // LEN(1) + TYPE(1) + SEQ(1) + PAYLOAD
    const crcData = new Uint8Array(this.buffer.slice(2, 2 + dataLen));
    const calculatedCRC = calculateCRC16(crcData);
    
    // Extract received CRC (little-endian: low byte first, then high byte)
    const crcLow = this.buffer[this.buffer.length - 2];
    const crcHigh = this.buffer[this.buffer.length - 1];
    const receivedCRC = crcLow | (crcHigh << 8);
    
    // Debug: log buffer structure for failed CRCs
    if (calculatedCRC !== receivedCRC) {
      const bufferHex = Array.from(this.buffer)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
      console.log(`[ProtocolDecoder] 🔍 Frame debug: buffer=[${bufferHex}]`);
      console.log(`[ProtocolDecoder] 🔍 CRC data (${dataLen} bytes): [${Array.from(crcData).map(b => b.toString(16).padStart(2, '0')).join(' ')}]`);
      console.log(`[ProtocolDecoder] 🔍 CRC bytes: low=0x${crcLow.toString(16)}, high=0x${crcHigh.toString(16)}`);
      console.log(`[ProtocolDecoder] 🔍 Payload length: ${this.message.payload.length}, expected: ${this.expectedPayloadLen}`);
    }
    
    return calculatedCRC === receivedCRC;
  }
  
  getMessage(): DecodedMessage | null {
    if (this.message.valid) {
      const result = { ...this.message };
      this.message.valid = false;
      return result;
    }
    return null;
  }
  
  reset(): void {
    this.state = 'WAIT_HEADER_0';
    this.buffer = [];
    this.expectedLen = 0;
    this.expectedPayloadLen = 0;
    this.message = { type: 0, seq: 0, payload: new Uint8Array(0), valid: false };
  }
}

