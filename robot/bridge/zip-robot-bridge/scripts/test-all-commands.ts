/**
 * Test All Robot Commands
 * 
 * Tests all available robot commands via WebSocket and verifies ACK responses
 */

import WebSocket from 'ws';

const WS_URL = process.env.WS_URL || 'ws://localhost:8765/robot';
const COMMAND_TIMEOUT = 5000; // 5 seconds

interface CommandTest {
  name: string;
  cmd: string;
  payload: unknown;
  expectedOk?: boolean;
}

const commands: CommandTest[] = [
  {
    name: 'HELLO - Request robot info',
    cmd: 'HELLO',
    payload: {},
    expectedOk: true,
  },
  {
    name: 'SET_MODE - Set to STANDBY (mode 0)',
    cmd: 'SET_MODE',
    payload: { mode: 0 },
    expectedOk: true,
  },
  {
    name: 'SET_MODE - Set to MANUAL (mode 1)',
    cmd: 'SET_MODE',
    payload: { mode: 1 },
    expectedOk: true,
  },
  {
    name: 'DRIVE_TWIST - Forward motion',
    cmd: 'DRIVE_TWIST',
    payload: { v: 100, omega: 0 },
    expectedOk: true,
  },
  {
    name: 'DRIVE_TWIST - Rotate in place',
    cmd: 'DRIVE_TWIST',
    payload: { v: 0, omega: 50 },
    expectedOk: true,
  },
  {
    name: 'DRIVE_TWIST - Stop',
    cmd: 'DRIVE_TWIST',
    payload: { v: 0, omega: 0 },
    expectedOk: true,
  },
  {
    name: 'DRIVE_TANK - Forward (both motors)',
    cmd: 'DRIVE_TANK',
    payload: { left: 100, right: 100 },
    expectedOk: true,
  },
  {
    name: 'DRIVE_TANK - Turn left',
    cmd: 'DRIVE_TANK',
    payload: { left: -50, right: 100 },
    expectedOk: true,
  },
  {
    name: 'DRIVE_TANK - Turn right',
    cmd: 'DRIVE_TANK',
    payload: { left: 100, right: -50 },
    expectedOk: true,
  },
  {
    name: 'DRIVE_TANK - Stop',
    cmd: 'DRIVE_TANK',
    payload: { left: 0, right: 0 },
    expectedOk: true,
  },
  {
    name: 'SERVO - Center position (90 degrees)',
    cmd: 'SERVO',
    payload: { angle: 90 },
    expectedOk: true,
  },
  {
    name: 'SERVO - Left position (0 degrees)',
    cmd: 'SERVO',
    payload: { angle: 0 },
    expectedOk: true,
  },
  {
    name: 'SERVO - Right position (180 degrees)',
    cmd: 'SERVO',
    payload: { angle: 180 },
    expectedOk: true,
  },
  {
    name: 'LED - Red color',
    cmd: 'LED',
    payload: { r: 255, g: 0, b: 0, brightness: 255 },
    expectedOk: true,
  },
  {
    name: 'LED - Green color',
    cmd: 'LED',
    payload: { r: 0, g: 255, b: 0, brightness: 255 },
    expectedOk: true,
  },
  {
    name: 'LED - Blue color',
    cmd: 'LED',
    payload: { r: 0, g: 0, b: 255, brightness: 255 },
    expectedOk: true,
  },
  {
    name: 'LED - Cyan color (ZIP theme)',
    cmd: 'LED',
    payload: { r: 39, g: 180, b: 205, brightness: 255 },
    expectedOk: true,
  },
  {
    name: 'LED - Off',
    cmd: 'LED',
    payload: { r: 0, g: 0, b: 0, brightness: 0 },
    expectedOk: true,
  },
  {
    name: 'E_STOP - Emergency stop',
    cmd: 'E_STOP',
    payload: {},
    expectedOk: true,
  },
  {
    name: 'CONFIG_SET - Example config',
    cmd: 'CONFIG_SET',
    payload: { key: 'test', value: 123 },
    expectedOk: true,
  },
  {
    name: 'SET_MODE - Set to LINE_FOLLOW (mode 2)',
    cmd: 'SET_MODE',
    payload: { mode: 2 },
    expectedOk: true,
  },
  {
    name: 'SET_MODE - Set to OBSTACLE_AVOID (mode 3)',
    cmd: 'SET_MODE',
    payload: { mode: 3 },
    expectedOk: true,
  },
  {
    name: 'SET_MODE - Set to FOLLOW (mode 4)',
    cmd: 'SET_MODE',
    payload: { mode: 4 },
    expectedOk: true,
  },
  {
    name: 'SET_MODE - Return to STANDBY (mode 0)',
    cmd: 'SET_MODE',
    payload: { mode: 0 },
    expectedOk: true,
  },
];

interface TestResult {
  command: CommandTest;
  success: boolean;
  responseTime: number;
  ackOk: boolean;
  error?: string;
}

async function testCommand(
  ws: WebSocket,
  command: CommandTest,
  seq: number
): Promise<TestResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let resolved = false;

    // Set up timeout
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        // Remove message handler
        ws.removeListener('message', ackHandler);
        resolve({
          command,
          success: false,
          responseTime: COMMAND_TIMEOUT,
          ackOk: false,
          error: 'Timeout waiting for ACK',
        });
      }
    }, COMMAND_TIMEOUT);

    // Set up ACK handler - keep listening until we get the matching ACK
    const ackHandler = (data: Buffer) => {
      if (resolved) return;

      try {
        const message = JSON.parse(data.toString());
        // Debug: log all received messages
        if (message.type === 'ack') {
          console.log(`  [DEBUG] Received ACK: seq=${message.seq}, expected=${seq}, ok=${message.ok}`);
        } else {
          console.log(`  [DEBUG] Received ${message.type} message (ignoring)`);
        }
        
        // Only process ACK messages with matching sequence number
        if (message.type === 'ack' && message.seq === seq) {
          clearTimeout(timeout);
          resolved = true;
          ws.removeListener('message', ackHandler);
          const responseTime = Date.now() - startTime;
          resolve({
            command,
            success: message.ok === true,
            responseTime,
            ackOk: message.ok === true,
            error: message.message,
          });
        }
        // Ignore other message types (telemetry, info, connection_state, etc.)
      } catch (error) {
        // Invalid JSON, ignore
        console.log(`  [DEBUG] Failed to parse message: ${error}`);
      }
    };

    // Add message listener (will keep listening until ACK received or timeout)
    ws.on('message', ackHandler);

    // Send command
    const commandMessage = {
      type: 'command',
      cmd: command.cmd,
      payload: command.payload,
      seq: seq,
    };

    ws.send(JSON.stringify(commandMessage));
    console.log(`  [SENT] ${command.name} (seq=${seq})`);
  });
}

async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:8766/health');
    const data = await response.json();
    return data.status === 'ok' && data.serial?.connected === true;
  } catch (error) {
    return false;
  }
}

async function runTests(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Robot Command Test Suite');
  console.log('='.repeat(60));
  console.log(`WebSocket URL: ${WS_URL}`);
  console.log(`Total commands to test: ${commands.length}`);
  console.log('');

  // Check if bridge service is running and robot is connected
  console.log('Checking bridge service health...');
  const isHealthy = await checkHealth();
  if (!isHealthy) {
    console.error('');
    console.error('✗ Bridge service is not running or robot is not connected!');
    console.error('');
    console.error('Please ensure:');
    console.error('  1. The bridge service is running (npm run dev)');
    console.error('  2. The robot is connected via serial port');
    console.error('  3. The robot has responded to HELLO command');
    console.error('');
    console.error('You can check the health endpoint:');
    console.error('  http://localhost:8766/health');
    console.error('');
    process.exit(1);
  }
  console.log('✓ Bridge service is healthy and robot is connected');
  console.log('');

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);

    ws.on('open', async () => {
      console.log('✓ Connected to WebSocket server');
      console.log('');

      const results: TestResult[] = [];
      let seq = 1;

      // Test each command
      for (const command of commands) {
        console.log(`[${seq}/${commands.length}] Testing: ${command.name}`);

        const result = await testCommand(ws, command, seq);
        results.push(result);

        if (result.success) {
          console.log(
            `  ✓ SUCCESS (${result.responseTime}ms) - ACK: ok=${result.ackOk}`
          );
        } else {
          console.log(
            `  ✗ FAILED (${result.responseTime}ms) - ACK: ok=${result.ackOk}`
          );
          if (result.error) {
            console.log(`    Error: ${result.error}`);
          }
        }

        seq++;

        // Small delay between commands to avoid overwhelming the robot
        await new Promise((r) => setTimeout(r, 200));
      }

      // Print summary
      console.log('');
      console.log('='.repeat(60));
      console.log('Test Summary');
      console.log('='.repeat(60));

      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;
      const avgResponseTime =
        results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;

      console.log(`Total commands: ${results.length}`);
      console.log(`Successful: ${successful} (${((successful / results.length) * 100).toFixed(1)}%)`);
      console.log(`Failed: ${failed} (${((failed / results.length) * 100).toFixed(1)}%)`);
      console.log(`Average response time: ${avgResponseTime.toFixed(0)}ms`);
      console.log('');

      // List failed commands
      if (failed > 0) {
        console.log('Failed Commands:');
        results
          .filter((r) => !r.success)
          .forEach((r) => {
            console.log(`  ✗ ${r.command.name}`);
            if (r.error) {
              console.log(`    ${r.error}`);
            }
          });
        console.log('');
      }

      // List successful commands by category
      console.log('Successful Commands by Category:');
      const categories: Record<string, number> = {};
      results
        .filter((r) => r.success)
        .forEach((r) => {
          const category = r.command.cmd;
          categories[category] = (categories[category] || 0) + 1;
        });
      Object.entries(categories).forEach(([category, count]) => {
        console.log(`  ${category}: ${count} test(s)`);
      });

      ws.close();
      resolve();
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      reject(error);
    });

    ws.on('close', () => {
      console.log('WebSocket connection closed');
    });
  });
}

// Run tests
runTests()
  .then(() => {
    console.log('Test suite completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });

