#!/usr/bin/env python3
"""
Test Robot Commands via Serial (Direct)
Tests all robot commands directly via serial port using the binary protocol
"""

import serial
import serial.tools.list_ports
import json
import time
import sys
from typing import Optional, Tuple, Dict, Any

# Protocol constants
PROTOCOL_HEADER_0 = 0xAA
PROTOCOL_HEADER_1 = 0x55
PROTOCOL_MAX_PAYLOAD_SIZE = 64

# Message types
MSG_TYPE_HELLO = 0x01
MSG_TYPE_SET_MODE = 0x02
MSG_TYPE_DRIVE_TWIST = 0x03
MSG_TYPE_DRIVE_TANK = 0x04
MSG_TYPE_SERVO = 0x05
MSG_TYPE_LED = 0x06
MSG_TYPE_E_STOP = 0x07
MSG_TYPE_CONFIG_SET = 0x08

MSG_TYPE_INFO = 0x81
MSG_TYPE_ACK = 0x82
MSG_TYPE_TELEMETRY = 0x83
MSG_TYPE_FAULT = 0x84

# CRC16-CCITT: Polynomial 0x1021, Initial 0xFFFF
CRC16_POLYNOMIAL = 0x1021
CRC16_INITIAL = 0xFFFF

def calculate_crc16(data: bytes) -> int:
    """Calculate CRC16-CCITT checksum"""
    crc = CRC16_INITIAL
    for byte in data:
        crc ^= (byte << 8)
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ CRC16_POLYNOMIAL) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return crc

def encode_frame(msg_type: int, seq: int, payload: bytes) -> bytes:
    """Encode a protocol frame"""
    if len(payload) > PROTOCOL_MAX_PAYLOAD_SIZE:
        raise ValueError(f"Payload size {len(payload)} exceeds maximum {PROTOCOL_MAX_PAYLOAD_SIZE} bytes")
    
    # LEN = TYPE(1) + SEQ(1) + PAYLOAD
    length = 1 + 1 + len(payload)
    
    # Build frame: [0xAA 0x55][LEN][TYPE][SEQ][PAYLOAD...][CRC16_LOW][CRC16_HIGH]
    frame = bytearray()
    frame.append(PROTOCOL_HEADER_0)
    frame.append(PROTOCOL_HEADER_1)
    frame.append(length)
    frame.append(msg_type)
    frame.append(seq)
    frame.extend(payload)
    
    # Calculate CRC16 over LEN..PAYLOAD (everything after header)
    crc_data = frame[2:]  # Skip header
    crc = calculate_crc16(crc_data)
    
    # Append CRC16 (little-endian: low byte first, then high byte)
    frame.append(crc & 0xFF)
    frame.append((crc >> 8) & 0xFF)
    
    return bytes(frame)

class ProtocolDecoder:
    """Decode protocol frames from serial stream"""
    
    def __init__(self):
        self.state = 'WAIT_HEADER_0'
        self.buffer = bytearray()
        self.expected_len = 0
        self.expected_payload_len = 0
        self.message = {'type': 0, 'seq': 0, 'payload': b'', 'valid': False}
    
    def process_byte(self, byte: int) -> bool:
        """Process a single byte, return True if complete message received"""
        if self.state == 'WAIT_HEADER_0':
            if byte == PROTOCOL_HEADER_0:
                self.buffer = bytearray([byte])
                self.state = 'WAIT_HEADER_1'
        elif self.state == 'WAIT_HEADER_1':
            if byte == PROTOCOL_HEADER_1:
                self.buffer.append(byte)
                self.state = 'WAIT_LEN'
            else:
                self.reset()
        elif self.state == 'WAIT_LEN':
            self.expected_len = byte
            if self.expected_len < 2 or self.expected_len > (2 + PROTOCOL_MAX_PAYLOAD_SIZE):
                self.reset()
            else:
                self.buffer.append(byte)
                self.expected_payload_len = self.expected_len - 2  # TYPE + SEQ
                self.state = 'WAIT_TYPE'
        elif self.state == 'WAIT_TYPE':
            self.message['type'] = byte
            self.buffer.append(byte)
            self.state = 'WAIT_SEQ'
        elif self.state == 'WAIT_SEQ':
            self.message['seq'] = byte
            self.buffer.append(byte)
            if self.expected_payload_len > 0:
                self.state = 'WAIT_PAYLOAD'
                self.message['payload'] = bytearray()
            else:
                self.state = 'WAIT_CRC_0'
        elif self.state == 'WAIT_PAYLOAD':
            if len(self.message['payload']) < self.expected_payload_len:
                self.message['payload'].append(byte)
                self.buffer.append(byte)
                if len(self.message['payload']) >= self.expected_payload_len:
                    self.state = 'WAIT_CRC_0'
        elif self.state == 'WAIT_CRC_0':
            self.buffer.append(byte)
            self.state = 'WAIT_CRC_1'
        elif self.state == 'WAIT_CRC_1':
            self.buffer.append(byte)
            if self.validate_frame():
                self.message['valid'] = True
                self.message['payload'] = bytes(self.message['payload'])
                result = self.message.copy()
                self.reset()
                return True
            else:
                self.reset()
        
        return False
    
    def validate_frame(self) -> bool:
        """Validate frame CRC"""
        expected_buffer_len = 2 + 1 + self.expected_len + 2  # Header + LEN + DATA + CRC
        if len(self.buffer) != expected_buffer_len:
            return False
        
        # Calculate CRC16 over LEN..PAYLOAD
        data_len = 1 + self.expected_len  # LEN(1) + TYPE(1) + SEQ(1) + PAYLOAD
        crc_data = bytes(self.buffer[2:2 + data_len])
        calculated_crc = calculate_crc16(crc_data)
        
        # Extract received CRC (little-endian)
        crc_low = self.buffer[-2]
        crc_high = self.buffer[-1]
        received_crc = crc_low | (crc_high << 8)
        
        return calculated_crc == received_crc
    
    def reset(self):
        """Reset decoder state"""
        self.state = 'WAIT_HEADER_0'
        self.buffer = bytearray()
        self.expected_len = 0
        self.expected_payload_len = 0
        self.message = {'type': 0, 'seq': 0, 'payload': b'', 'valid': False}

def find_serial_port() -> Optional[str]:
    """Auto-detect serial port"""
    ports = serial.tools.list_ports.comports()
    
    # Prefer Arduino/robot controllers
    for port in ports:
        if any(keyword in (port.manufacturer or '').lower() for keyword in ['arduino', 'ch340', 'ftdi']):
            return port.device
    
    # Fallback to first available port
    if ports:
        return ports[0].device
    
    return None

def send_command(ser: serial.Serial, msg_type: int, payload: Dict[str, Any], seq: int) -> Optional[Dict[str, Any]]:
    """Send a command and wait for ACK"""
    # Encode payload as JSON
    payload_json = json.dumps(payload)
    payload_bytes = payload_json.encode('utf-8')
    
    # Encode frame
    frame = encode_frame(msg_type, seq, payload_bytes)
    
    # Send frame
    ser.write(frame)
    
    # Wait for ACK (with timeout)
    decoder = ProtocolDecoder()
    start_time = time.time()
    timeout = 5.0  # 5 seconds
    
    while time.time() - start_time < timeout:
        if ser.in_waiting > 0:
            byte = ser.read(1)[0]
            if decoder.process_byte(byte):
                msg = decoder.message
                if msg['type'] == MSG_TYPE_ACK:
                    # Parse ACK payload
                    try:
                        ack_data = json.loads(msg['payload'].decode('utf-8'))
                        return {
                            'ok': ack_data.get('ok', True),
                            'error': ack_data.get('err', 0),
                            'message': ack_data.get('message', ''),
                            'seq': msg['seq']
                        }
                    except:
                        return {'ok': False, 'error': 'Failed to parse ACK', 'seq': msg['seq']}
                elif msg['type'] == MSG_TYPE_INFO:
                    # Robot info received
                    try:
                        info_data = json.loads(msg['payload'].decode('utf-8'))
                        print(f"  [INFO] Robot info: {info_data}")
                    except:
                        pass
        time.sleep(0.01)  # Small delay
    
    return None  # Timeout

# Test commands
COMMANDS = [
    {'name': 'HELLO - Request robot info', 'type': MSG_TYPE_HELLO, 'payload': {}},
    {'name': 'SET_MODE - STANDBY (mode 0)', 'type': MSG_TYPE_SET_MODE, 'payload': {'mode': 0}},
    {'name': 'SET_MODE - MANUAL (mode 1)', 'type': MSG_TYPE_SET_MODE, 'payload': {'mode': 1}},
    {'name': 'DRIVE_TWIST - Forward', 'type': MSG_TYPE_DRIVE_TWIST, 'payload': {'v': 100, 'omega': 0}},
    {'name': 'DRIVE_TWIST - Rotate', 'type': MSG_TYPE_DRIVE_TWIST, 'payload': {'v': 0, 'omega': 50}},
    {'name': 'DRIVE_TWIST - Stop', 'type': MSG_TYPE_DRIVE_TWIST, 'payload': {'v': 0, 'omega': 0}},
    {'name': 'DRIVE_TANK - Forward', 'type': MSG_TYPE_DRIVE_TANK, 'payload': {'left': 100, 'right': 100}},
    {'name': 'DRIVE_TANK - Turn left', 'type': MSG_TYPE_DRIVE_TANK, 'payload': {'left': -50, 'right': 100}},
    {'name': 'DRIVE_TANK - Turn right', 'type': MSG_TYPE_DRIVE_TANK, 'payload': {'left': 100, 'right': -50}},
    {'name': 'DRIVE_TANK - Stop', 'type': MSG_TYPE_DRIVE_TANK, 'payload': {'left': 0, 'right': 0}},
    {'name': 'SERVO - Center (90°)', 'type': MSG_TYPE_SERVO, 'payload': {'angle': 90}},
    {'name': 'SERVO - Left (0°)', 'type': MSG_TYPE_SERVO, 'payload': {'angle': 0}},
    {'name': 'SERVO - Right (180°)', 'type': MSG_TYPE_SERVO, 'payload': {'angle': 180}},
    {'name': 'LED - Red', 'type': MSG_TYPE_LED, 'payload': {'r': 255, 'g': 0, 'b': 0, 'brightness': 255}},
    {'name': 'LED - Green', 'type': MSG_TYPE_LED, 'payload': {'r': 0, 'g': 255, 'b': 0, 'brightness': 255}},
    {'name': 'LED - Blue', 'type': MSG_TYPE_LED, 'payload': {'r': 0, 'g': 0, 'b': 255, 'brightness': 255}},
    {'name': 'LED - Cyan', 'type': MSG_TYPE_LED, 'payload': {'r': 39, 'g': 180, 'b': 205, 'brightness': 255}},
    {'name': 'LED - Off', 'type': MSG_TYPE_LED, 'payload': {'r': 0, 'g': 0, 'b': 0, 'brightness': 0}},
    {'name': 'E_STOP', 'type': MSG_TYPE_E_STOP, 'payload': {}},
    {'name': 'CONFIG_SET', 'type': MSG_TYPE_CONFIG_SET, 'payload': {'key': 'test', 'value': 123}},
    {'name': 'SET_MODE - LINE_FOLLOW (mode 2)', 'type': MSG_TYPE_SET_MODE, 'payload': {'mode': 2}},
    {'name': 'SET_MODE - OBSTACLE_AVOID (mode 3)', 'type': MSG_TYPE_SET_MODE, 'payload': {'mode': 3}},
    {'name': 'SET_MODE - FOLLOW (mode 4)', 'type': MSG_TYPE_SET_MODE, 'payload': {'mode': 4}},
    {'name': 'SET_MODE - STANDBY (mode 0)', 'type': MSG_TYPE_SET_MODE, 'payload': {'mode': 0}},
]

def main():
    print('=' * 60)
    print('Robot Command Test Suite (Direct Serial)')
    print('=' * 60)
    
    # Find serial port
    port = sys.argv[1] if len(sys.argv) > 1 else find_serial_port()
    if not port:
        print('ERROR: No serial port found')
        print('Usage: python test_robot_serial.py [PORT]')
        print('Example: python test_robot_serial.py COM3')
        sys.exit(1)
    
    baud_rate = 115200
    print(f'Serial port: {port}')
    print(f'Baud rate: {baud_rate}')
    print(f'Total commands: {len(COMMANDS)}')
    print()
    
    # Open serial port
    try:
        ser = serial.Serial(port, baud_rate, timeout=1)
        print(f'✓ Connected to {port}')
        time.sleep(2)  # Wait for connection to stabilize
        print()
    except Exception as e:
        print(f'ERROR: Failed to open serial port: {e}')
        sys.exit(1)
    
    results = []
    seq = 1
    
    try:
        # Test each command
        for cmd in COMMANDS:
            print(f'[{seq}/{len(COMMANDS)}] Testing: {cmd["name"]}')
            
            start_time = time.time()
            ack = send_command(ser, cmd['type'], cmd['payload'], seq)
            response_time = int((time.time() - start_time) * 1000)
            
            if ack:
                success = ack.get('ok', False)
                status = '✓ SUCCESS' if success else '✗ FAILED'
                print(f'  {status} ({response_time}ms) - ACK: ok={success}')
                if not success:
                    error = ack.get('error', 'Unknown error')
                    message = ack.get('message', '')
                    print(f'    Error: {error}, Message: {message}')
                results.append({'command': cmd, 'success': success, 'response_time': response_time})
            else:
                print(f'  ✗ TIMEOUT ({response_time}ms) - No ACK received')
                results.append({'command': cmd, 'success': False, 'response_time': response_time})
            
            seq += 1
            time.sleep(0.2)  # Small delay between commands
        
        # Print summary
        print()
        print('=' * 60)
        print('Test Summary')
        print('=' * 60)
        
        successful = sum(1 for r in results if r['success'])
        failed = len(results) - successful
        avg_time = sum(r['response_time'] for r in results) / len(results) if results else 0
        
        print(f'Total commands: {len(results)}')
        print(f'Successful: {successful} ({successful/len(results)*100:.1f}%)')
        print(f'Failed: {failed} ({failed/len(results)*100:.1f}%)')
        print(f'Average response time: {avg_time:.0f}ms')
        print()
        
        if failed > 0:
            print('Failed Commands:')
            for r in results:
                if not r['success']:
                    print(f'  ✗ {r["command"]["name"]}')
            print()
        
        # By category
        categories = {}
        for r in results:
            if r['success']:
                cmd_type = r['command']['type']
                categories[cmd_type] = categories.get(cmd_type, 0) + 1
        
        print('Successful Commands by Type:')
        type_names = {
            MSG_TYPE_HELLO: 'HELLO',
            MSG_TYPE_SET_MODE: 'SET_MODE',
            MSG_TYPE_DRIVE_TWIST: 'DRIVE_TWIST',
            MSG_TYPE_DRIVE_TANK: 'DRIVE_TANK',
            MSG_TYPE_SERVO: 'SERVO',
            MSG_TYPE_LED: 'LED',
            MSG_TYPE_E_STOP: 'E_STOP',
            MSG_TYPE_CONFIG_SET: 'CONFIG_SET',
        }
        for cmd_type, count in categories.items():
            print(f'  {type_names.get(cmd_type, f"0x{cmd_type:02X}")}: {count} test(s)')
    
    finally:
        ser.close()
        print()
        print('Serial port closed')

if __name__ == '__main__':
    main()

