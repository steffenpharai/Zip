/**
 * ZIP Robot Bridge - Main Entry Point
 * 
 * A reliable bridge between WebSocket clients and the ZIP Robot Firmware.
 * Uses ELEGOO-style JSON protocol over serial at 115200 baud.
 */

import 'dotenv/config';
import { SerialPort } from 'serialport';
import { logger } from './logging/logger.js';
import { 
  env, 
  SERIAL_PORT, 
  SERIAL_BAUD, 
  WS_PORT, 
  HTTP_PORT, 
  LOOPBACK_MODE,
} from './config/env.js';
import { SerialTransport, type TransportState } from './serial/SerialTransport.js';
import { LoopbackEmulator } from './serial/LoopbackEmulator.js';
import { ReplyMatcher } from './protocol/ReplyMatcher.js';
import { SetpointStreamer } from './streaming/SetpointStreamer.js';
import { RobotWsServer } from './ws/RobotWsServer.js';
import { HealthServer } from './http/HealthServer.js';
import { isBootMarker } from './protocol/FirmwareJson.js';

// ============================================================================
// Auto-detect serial port
// ============================================================================

async function getSerialPort(): Promise<string> {
  if (SERIAL_PORT) {
    return SERIAL_PORT;
  }
  
  try {
    const ports = await SerialPort.list();
    
    // Prefer ports that look like Arduino/robot controllers
    const arduinoPorts = ports.filter(p => 
      p.manufacturer?.toLowerCase().includes('arduino') ||
      p.manufacturer?.toLowerCase().includes('ch340') ||
      p.manufacturer?.toLowerCase().includes('ftdi') ||
      p.path?.toUpperCase().startsWith('COM')
    );
    
    if (arduinoPorts.length > 0) {
      logger.info(`Auto-detected port: ${arduinoPorts[0].path}`);
      return arduinoPorts[0].path;
    }
    
    if (ports.length > 0) {
      logger.info(`Using first available port: ${ports[0].path}`);
      return ports[0].path;
    }
  } catch (error) {
    logger.warn('Could not auto-detect port', { 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
  
  // Platform-specific defaults
  if (process.platform === 'win32') {
    return 'COM3';
  }
  return '/dev/ttyUSB0';
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  logger.info('ZIP Robot Bridge starting...', { 
    loopback: LOOPBACK_MODE,
    wsPort: WS_PORT,
    httpPort: HTTP_PORT,
  });
  
  // Create components
  const replyMatcher = new ReplyMatcher();
  const streamer = new SetpointStreamer();
  const wsServer = new RobotWsServer(WS_PORT);
  const healthServer = new HealthServer(HTTP_PORT);
  
  // Wire up dependencies
  wsServer.setReplyMatcher(replyMatcher);
  wsServer.setStreamer(streamer);
  healthServer.setReplyMatcher(replyMatcher);
  healthServer.setStreamer(streamer);
  
  // Transport event handlers
  const transportEvents = {
    onLine: (line: string) => {
      // Check for boot marker (indicates reset)
      if (isBootMarker(line)) {
        logger.info('Boot marker received (firmware reset)');
        wsServer.broadcastStatus();
      }
      
      // Forward to reply matcher
      replyMatcher.processLine(line);
      
      // Broadcast to WS clients
      wsServer.broadcastRxLine(line);
    },
    onStateChange: (state: TransportState) => {
      logger.info(`Transport state: ${state}`);
      
      if (state === 'ready') {
        wsServer.markReady();
      }
      
      wsServer.broadcastStatus();
    },
    onError: (error: Error) => {
      logger.error('Transport error', { error: error.message });
    },
  };
  
  // Create transport (real or loopback)
  let transport: SerialTransport | LoopbackEmulator;
  
  if (LOOPBACK_MODE) {
    logger.info('Running in LOOPBACK mode (no hardware)');
    transport = new LoopbackEmulator(transportEvents);
  } else {
    const portPath = await getSerialPort();
    logger.info(`Using serial port: ${portPath} @ ${SERIAL_BAUD} baud`);
    transport = new SerialTransport(portPath, transportEvents, SERIAL_BAUD);
  }
  
  // Wire transport to other components
  wsServer.setTransport(transport as SerialTransport);
  healthServer.setTransport(transport as SerialTransport);
  
  // Set up streamer to send commands via transport
  streamer.setSendFunction((cmd) => {
    return transport.writeCommand(cmd);
  });
  
  // Open transport
  try {
    await transport.open();
  } catch (error) {
    logger.error('Failed to open transport', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    if (!LOOPBACK_MODE) {
      logger.error('Make sure the robot is connected and the port is correct');
      logger.error('Set SERIAL_PORT environment variable to override');
    }
  }
  
  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    
    // Stop streaming
    if (streamer.isStreaming()) {
      await streamer.stop(true);
    }
    
    // Cleanup
    replyMatcher.cleanup();
    streamer.cleanup();
    wsServer.close();
    healthServer.close();
    await transport.close();
    logger.close();
    
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  
  logger.info('Bridge started successfully', {
    wsEndpoint: `ws://localhost:${WS_PORT}/robot`,
    httpEndpoint: `http://localhost:${HTTP_PORT}`,
  });
}

main().catch((error) => {
  logger.error('Fatal error', { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
