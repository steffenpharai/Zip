/**
 * Protocol Handler - Binary Protocol Encode/Decode
 */
export declare const PROTOCOL_MAX_PAYLOAD_SIZE = 64;
export declare const PROTOCOL_MAX_FRAME_SIZE: number;
export declare const MSG_TYPE_HELLO = 1;
export declare const MSG_TYPE_SET_MODE = 2;
export declare const MSG_TYPE_DRIVE_TWIST = 3;
export declare const MSG_TYPE_DRIVE_TANK = 4;
export declare const MSG_TYPE_SERVO = 5;
export declare const MSG_TYPE_LED = 6;
export declare const MSG_TYPE_E_STOP = 7;
export declare const MSG_TYPE_CONFIG_SET = 8;
export declare const MSG_TYPE_INFO = 129;
export declare const MSG_TYPE_ACK = 130;
export declare const MSG_TYPE_TELEMETRY = 131;
export declare const MSG_TYPE_FAULT = 132;
export interface DecodedMessage {
    type: number;
    seq: number;
    payload: Uint8Array;
    valid: boolean;
}
export declare class ProtocolEncoder {
    private nextSeq;
    getNextSeq(): number;
    encode(type: number, seq: number, payload: Uint8Array): Uint8Array;
}
export declare class ProtocolDecoder {
    private state;
    private buffer;
    private expectedLen;
    private expectedPayloadLen;
    private message;
    processByte(byte: number): boolean;
    private validateFrame;
    getMessage(): DecodedMessage | null;
    reset(): void;
}
//# sourceMappingURL=protocol-handler.d.ts.map