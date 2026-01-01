/**
 * ZIP Robot Bridge - Main Entry Point
 */
import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SerialManager } from './serial-manager.js';
import { RobotWebSocketServer } from './websocket-server.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Auto-detect serial port
async function getSerialPort() {
    if (process.env.SERIAL_PORT) {
        return process.env.SERIAL_PORT;
    }
    // Try to auto-detect available ports
    try {
        const { SerialPort } = await import('serialport');
        const ports = await SerialPort.list();
        // Prefer ports that look like Arduino/robot controllers
        const arduinoPorts = ports.filter(p => p.manufacturer?.toLowerCase().includes('arduino') ||
            p.manufacturer?.toLowerCase().includes('ch340') ||
            p.manufacturer?.toLowerCase().includes('ftdi') ||
            p.path?.toUpperCase().startsWith('COM'));
        if (arduinoPorts.length > 0) {
            console.log(`[Bridge] Auto-detected port: ${arduinoPorts[0].path}`);
            return arduinoPorts[0].path;
        }
        // Fallback to first available port
        if (ports.length > 0) {
            console.log(`[Bridge] Using first available port: ${ports[0].path}`);
            return ports[0].path;
        }
    }
    catch (error) {
        console.warn('[Bridge] Could not auto-detect port:', error);
    }
    // Platform-specific defaults
    if (process.platform === 'win32') {
        return 'COM3'; // Windows default
    }
    return '/dev/ttyUSB0'; // Linux default
}
const SERIAL_BAUD = parseInt(process.env.SERIAL_BAUD || '115200', 10);
const WS_PORT = parseInt(process.env.WS_PORT || '8765', 10);
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '8766', 10);
const LOOPBACK_MODE = process.env.LOOPBACK_MODE === 'true';
let serialManager = null;
let wsServer = null;
// WebSocket server events
const wsEvents = {
    onTelemetry: (data) => {
        console.log('[Bridge] Telemetry received');
    },
    onRobotInfo: (info) => {
        console.log('[Bridge] Robot info:', info);
    },
    onFault: (fault) => {
        console.error('[Bridge] Fault:', fault);
    },
};
// Create WebSocket server
wsServer = new RobotWebSocketServer(WS_PORT, wsEvents);
// HTTP server for health/info endpoints and static file serving
const httpServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const url = req.url || '/';
    const method = req.method || 'GET';
    // API endpoints (check before static file serving)
    if (url === '/api/robot/command' && method === 'POST') {
        res.setHeader('Content-Type', 'application/json');
        let body = '';
        req.on('data', (chunk) => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const command = JSON.parse(body);
                // Forward to WebSocket server (would need to implement)
                res.writeHead(501);
                res.end(JSON.stringify({ error: 'REST command API not yet implemented, use WebSocket' }));
            }
            catch (error) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });
        return;
    }
    // Static file serving
    if (method === 'GET' && url.startsWith('/')) {
        // API endpoints
        if (url === '/health') {
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(200);
            const wsStats = wsServer ? wsServer.getStatistics() : null;
            res.end(JSON.stringify({
                status: 'ok',
                serial: {
                    connected: serialManager?.getIsConnected() || false,
                    port: serialManager?.getPortPath() || null,
                    baudRate: serialManager?.getBaudRate() || null,
                    uptime: serialManager?.getConnectionUptime() || 0,
                },
                websocket: {
                    clients: wsServer ? wsServer.getClientCount() : 0,
                    uptime: wsStats ? wsStats.uptime : 0,
                },
                timestamp: Date.now(),
            }));
            return;
        }
        if (url === '/api/robot/status') {
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(200);
            const wsStats = wsServer ? wsServer.getStatistics() : null;
            res.end(JSON.stringify({
                connected: serialManager?.getIsConnected() || false,
                serial: {
                    port: serialManager?.getPortPath() || null,
                    baudRate: serialManager?.getBaudRate() || null,
                    uptime: serialManager?.getConnectionUptime() || 0,
                },
                websocket: {
                    clients: wsServer ? wsServer.getClientCount() : 0,
                    uptime: wsStats ? wsStats.uptime : 0,
                    messagesSent: wsStats?.messagesSent || 0,
                    messagesReceived: wsStats?.messagesReceived || 0,
                    commandsSent: wsStats?.commandsSent || 0,
                    commandsSucceeded: wsStats?.commandsSucceeded || 0,
                    commandsFailed: wsStats?.commandsFailed || 0,
                    averageResponseTime: wsServer ? wsServer.getAverageResponseTime() : 0,
                    commandSuccessRate: wsServer ? wsServer.getCommandSuccessRate() : 0,
                },
                robot: {
                    info: wsServer ? wsServer.getRobotInfo() : null,
                },
                timestamp: Date.now(),
            }));
            return;
        }
        if (url === '/api/robot/telemetry/latest') {
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(200);
            const latestTelemetry = wsServer ? wsServer.getLatestTelemetry() : null;
            res.end(JSON.stringify({
                telemetry: latestTelemetry,
                timestamp: Date.now(),
            }));
            return;
        }
        // Serve static files from public directory
        const publicDir = path.join(__dirname, '..', 'public');
        let filePath = url === '/' ? path.join(publicDir, 'index.html') : path.join(publicDir, url);
        // Security: prevent directory traversal
        const resolvedPath = path.resolve(filePath);
        const resolvedPublic = path.resolve(publicDir);
        if (!resolvedPath.startsWith(resolvedPublic)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }
        // Determine content type
        const ext = path.extname(filePath).toLowerCase();
        const contentTypes = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
        };
        const contentType = contentTypes[ext] || 'application/octet-stream';
        fs.readFile(filePath, (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    res.writeHead(404);
                    res.end('Not found');
                }
                else {
                    res.writeHead(500);
                    res.end('Internal server error');
                }
                return;
            }
            res.setHeader('Content-Type', contentType);
            res.writeHead(200);
            res.end(data);
        });
        return;
    }
    // Legacy endpoints (for backward compatibility)
    if (method === 'GET' && url === '/diagnostics') {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        const wsStats = wsServer ? wsServer.getStatistics() : null;
        res.end(JSON.stringify({
            status: 'ok',
            serial: {
                connected: serialManager?.getIsConnected() || false,
                port: serialManager?.getPortPath() || null,
                baudRate: serialManager?.getBaudRate() || null,
                uptime: serialManager?.getConnectionUptime() || 0,
            },
            websocket: {
                clients: wsServer ? wsServer.getClientCount() : 0,
                uptime: wsStats ? wsStats.uptime : 0,
            },
            timestamp: Date.now(),
        }));
    }
    else if (req.method === 'GET' && req.url === '/diagnostics') {
        res.writeHead(200);
        const wsStats = wsServer ? wsServer.getStatistics() : null;
        const serialConnected = serialManager?.getIsConnected() || false;
        res.end(JSON.stringify({
            serial: {
                connected: serialConnected,
                port: serialManager?.getPortPath() || null,
                baudRate: serialManager?.getBaudRate() || null,
                uptime: serialManager?.getConnectionUptime() || 0,
                connectionStartTime: serialManager?.getConnectionStartTime() || null,
            },
            websocket: {
                clients: wsServer ? wsServer.getClientCount() : 0,
                uptime: wsStats ? wsStats.uptime : 0,
                messagesSent: wsStats?.messagesSent || 0,
                messagesReceived: wsStats?.messagesReceived || 0,
                commandsSent: wsStats?.commandsSent || 0,
                commandsSucceeded: wsStats?.commandsSucceeded || 0,
                commandsFailed: wsStats?.commandsFailed || 0,
                averageResponseTime: wsServer ? wsServer.getAverageResponseTime() : 0,
                commandSuccessRate: wsServer ? wsServer.getCommandSuccessRate() : 0,
                responseTimeCount: wsStats?.responseTimeCount || 0,
                errors: wsStats?.errors || 0,
                lastErrorTime: wsStats?.lastErrorTime || null,
            },
            robot: {
                info: wsServer ? wsServer.getRobotInfo() : null,
            },
            timestamp: Date.now(),
        }));
    }
    else if (method === 'GET' && url === '/robot/info') {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify({
            connected: serialManager?.getIsConnected() || false,
            info: wsServer ? wsServer.getRobotInfo() : null,
        }));
    }
});
httpServer.listen(HTTP_PORT, () => {
    console.log(`[HTTP] Server listening on http://localhost:${HTTP_PORT}`);
});
// Serial manager (or loopback mode)
if (LOOPBACK_MODE) {
    console.log('[Bridge] Running in LOOPBACK mode (no robot connection)');
    // Simulate telemetry
    setInterval(() => {
        if (wsServer) {
            const simulatedTelemetry = {
                ts_ms: Date.now(),
                imu: { ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0, yaw: 0 },
                ultrasonic_mm: 200,
                line_adc: [512, 512, 512],
                batt_mv: 7400,
                motor_state: { left: 0, right: 0 },
                mode: 0,
            };
            wsServer.handleRobotMessage({
                type: 0x83, // MSG_TYPE_TELEMETRY
                seq: 0,
                payload: new TextEncoder().encode(JSON.stringify(simulatedTelemetry)),
                valid: true,
            });
        }
    }, 100); // 10Hz telemetry
}
else {
    // Real serial connection
    const serialEvents = {
        onMessage: (msg) => {
            if (wsServer) {
                wsServer.handleRobotMessage(msg);
            }
        },
        onError: (error) => {
            console.error('[Serial] Error:', error);
        },
        onConnect: async () => {
            console.log('[Serial] Connected');
            // Broadcast connection state change
            if (wsServer) {
                wsServer.broadcastConnectionState();
            }
            // Send HELLO on connect
            if (serialManager) {
                const { ProtocolEncoder, MSG_TYPE_HELLO } = await import('./protocol-handler.js');
                const encoder = new ProtocolEncoder();
                const helloPayload = new TextEncoder().encode('{}');
                const frame = encoder.encode(MSG_TYPE_HELLO, encoder.getNextSeq(), helloPayload);
                serialManager.write(frame);
            }
        },
        onDisconnect: () => {
            console.log('[Serial] Disconnected');
            // Broadcast connection state change
            if (wsServer) {
                wsServer.broadcastConnectionState();
            }
        },
    };
    // Get serial port (async) and connect
    (async () => {
        const serialPort = await getSerialPort();
        console.log(`[Bridge] Using serial port: ${serialPort}`);
        serialManager = new SerialManager(serialPort, SERIAL_BAUD, serialEvents);
        wsServer.setSerialManager(serialManager);
        serialManager.connect().catch((error) => {
            console.error('[Bridge] Failed to connect to serial port:', error);
            console.error(`[Bridge] Port: ${serialPort}`);
            console.error('[Bridge] Make sure the robot is connected and the port is correct');
            console.error('[Bridge] You can set SERIAL_PORT environment variable to override');
        });
    })();
}
// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[Bridge] Shutting down...');
    if (serialManager) {
        serialManager.disconnect();
    }
    if (wsServer) {
        wsServer.close();
    }
    httpServer.close();
    process.exit(0);
});
console.log('[Bridge] ZIP Robot Bridge Service started');
console.log(`[Bridge] Serial: (auto-detecting...) @ ${SERIAL_BAUD} baud`);
console.log(`[Bridge] WebSocket: ws://localhost:${WS_PORT}/robot`);
console.log(`[Bridge] HTTP: http://localhost:${HTTP_PORT}`);
//# sourceMappingURL=index.js.map