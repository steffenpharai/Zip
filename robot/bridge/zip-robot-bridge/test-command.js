/**
 * Test script to send commands via WebSocket
 */

import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:8765/robot');

ws.on('open', () => {
  console.log('Connected to bridge');
  
  // Send HELLO command
  const helloCmd = {
    type: 'command',
    cmd: 'HELLO',
    payload: {},
    seq: 1
  };
  
  console.log('Sending HELLO command...');
  ws.send(JSON.stringify(helloCmd));
  
  // Send SET_MODE to MANUAL
  setTimeout(() => {
    const modeCmd = {
      type: 'command',
      cmd: 'SET_MODE',
      payload: { mode: 1 },
      seq: 2
    };
    console.log('Sending SET_MODE command...');
    ws.send(JSON.stringify(modeCmd));
  }, 1000);
  
  // Send a tank drive command
  setTimeout(() => {
    const tankCmd = {
      type: 'command',
      cmd: 'DRIVE_TANK',
      payload: { left: 100, right: 100 },
      seq: 3
    };
    console.log('Sending DRIVE_TANK command...');
    ws.send(JSON.stringify(tankCmd));
  }, 2000);
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('Received:', JSON.stringify(message, null, 2));
  
  if (message.type === 'telemetry') {
    console.log('✓ Telemetry received - robot is communicating!');
  }
  if (message.type === 'ack') {
    console.log(`✓ ACK received: ok=${message.ok}, seq=${message.seq}`);
  }
  if (message.type === 'info') {
    console.log('✓ Robot info received:', message.data);
  }
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('close', () => {
  console.log('WebSocket closed');
  process.exit(0);
});

// Wait longer to see if robot responds
setTimeout(() => {
  console.log('\n=== Summary ===');
  console.log('If no ACKs were received, the robot may not be responding.');
  console.log('Check:');
  console.log('1. Is the robot firmware running?');
  console.log('2. Is the serial port correct? (COM5)');
  console.log('3. Are there any errors in the bridge service logs?');
  ws.close();
}, 10000);

