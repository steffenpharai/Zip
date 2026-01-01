/**
 * Test protocol encoding to verify frame format
 */

import { ProtocolEncoder, MSG_TYPE_HELLO, MSG_TYPE_SET_MODE, MSG_TYPE_DRIVE_TANK } from './dist/protocol-handler.js';

const encoder = new ProtocolEncoder();

console.log('Testing protocol encoding...\n');

// Test HELLO command
const helloPayload = new TextEncoder().encode('{}');
const helloFrame = encoder.encode(MSG_TYPE_HELLO, encoder.getNextSeq(), helloPayload);
console.log('HELLO frame:');
console.log('  Length:', helloFrame.length, 'bytes');
console.log('  Hex:', Array.from(helloFrame).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '));
console.log('  Expected format: [AA 55][LEN][TYPE=01][SEQ][PAYLOAD={}][CRC16]');
console.log('');

// Test SET_MODE command
const modePayload = new TextEncoder().encode('{"mode":1}');
const modeFrame = encoder.encode(MSG_TYPE_SET_MODE, encoder.getNextSeq(), modePayload);
console.log('SET_MODE frame:');
console.log('  Length:', modeFrame.length, 'bytes');
console.log('  Hex:', Array.from(modeFrame).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '));
console.log('  Payload:', new TextDecoder().decode(modePayload));
console.log('');

// Test DRIVE_TANK command
const tankPayload = new TextEncoder().encode('{"left":100,"right":100}');
const tankFrame = encoder.encode(MSG_TYPE_DRIVE_TANK, encoder.getNextSeq(), tankPayload);
console.log('DRIVE_TANK frame:');
console.log('  Length:', tankFrame.length, 'bytes');
console.log('  Hex:', Array.from(tankFrame).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '));
console.log('  Payload:', new TextDecoder().decode(tankPayload));
console.log('');

console.log('Protocol encoding test complete.');
console.log('\nIf the robot is not responding, check:');
console.log('1. Is the robot firmware loaded and running?');
console.log('2. Does the firmware use the same protocol (0xAA 0x55 header)?');
console.log('3. Is the baud rate correct (115200)?');
console.log('4. Is the serial port correct (COM5)?');

