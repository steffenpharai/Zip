/**
 * Check if robot firmware is sending any data
 */

import { SerialPort } from 'serialport';

const portPath = process.env.SERIAL_PORT || 'COM5';
const baudRate = 115200;

console.log(`Opening serial port: ${portPath} @ ${baudRate} baud...`);

const port = new SerialPort({
  path: portPath,
  baudRate: baudRate,
  autoOpen: false,
});

port.on('open', () => {
  console.log('Serial port opened. Listening for data...');
  console.log('If firmware is running, you should see initialization messages.');
  console.log('Waiting 5 seconds for data...\n');
  
  setTimeout(() => {
    port.close();
    console.log('\n=== Summary ===');
    console.log('If no data was received, the firmware is likely not running.');
    console.log('Please verify:');
    console.log('1. Firmware is compiled and uploaded to Arduino');
    console.log('2. Arduino is powered on');
    console.log('3. USB cable is connected');
    process.exit(0);
  }, 5000);
});

port.on('data', (data) => {
  // Try to decode as text first
  try {
    const text = data.toString('utf8');
    if (text.trim().length > 0) {
      console.log(`[TEXT] ${text.trim()}`);
    }
  } catch (e) {
    // Not text
  }
  
  // Also show hex
  const hex = Array.from(data).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  console.log(`[HEX] ${hex}`);
  
  // Check for protocol header
  if (data[0] === 0xAA && data[1] === 0x55) {
    console.log('  -> Protocol frame detected!');
  }
});

port.on('error', (error) => {
  console.error('Serial port error:', error);
  process.exit(1);
});

port.open((error) => {
  if (error) {
    console.error('Failed to open serial port:', error);
    process.exit(1);
  }
});

