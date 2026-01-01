/**
 * Serial Manager - Handles serial port communication
 */
import { SerialPort } from 'serialport';
import { ProtocolDecoder } from './protocol-handler.js';
export class SerialManager {
    port = null;
    decoder = new ProtocolDecoder();
    events;
    portPath;
    baudRate;
    isConnected = false;
    reconnectTimer = null;
    connectionStartTime = null;
    constructor(portPath, baudRate, events) {
        this.portPath = portPath;
        this.baudRate = baudRate;
        this.events = events;
    }
    async connect() {
        if (this.isConnected) {
            return;
        }
        try {
            this.port = new SerialPort({
                path: this.portPath,
                baudRate: this.baudRate,
                autoOpen: false,
            });
            this.port.on('open', () => {
                this.isConnected = true;
                this.connectionStartTime = Date.now();
                console.log(`[SerialManager] Connected to ${this.portPath}`);
                this.events.onConnect();
            });
            this.port.on('error', (error) => {
                console.error('[SerialManager] Error:', error);
                this.handleDisconnect();
                this.events.onError(error);
            });
            this.port.on('close', () => {
                console.log('[SerialManager] Port closed');
                this.handleDisconnect();
            });
            // Process incoming bytes
            this.port.on('data', (data) => {
                // Check for protocol header (0xAA 0x55) in received data
                for (let i = 0; i < data.length - 1; i++) {
                    if (data[i] === 0xAA && data[i + 1] === 0x55) {
                        const hex = Array.from(data.slice(i, Math.min(i + 20, data.length)))
                            .map(b => b.toString(16).padStart(2, '0')).join(' ');
                        console.log(`[SerialManager] Protocol frame detected at offset ${i}: ${hex}...`);
                        break;
                    }
                }
                // Log raw bytes for debugging (only if no protocol header found, to reduce spam)
                if (data.length > 0 && !data.includes(0xAA)) {
                    // Only log if it's not obviously text (to reduce spam from initialization messages)
                    const isText = data.every(b => (b >= 32 && b <= 126) || b === 0x0A || b === 0x0D);
                    if (!isText) {
                        const hex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ');
                        console.log(`[SerialManager] Received ${data.length} bytes: ${hex}`);
                    }
                }
                // Also try to decode as text (for firmware initialization messages)
                try {
                    const text = data.toString('utf8');
                    if (text.match(/[a-zA-Z0-9]/)) { // Contains printable characters
                        // Only log if it's not a repeated initialization message
                        if (!text.includes('Initialization complete') && !text.includes('Ready for commands')) {
                            console.log(`[SerialManager] Text data: ${text.trim()}`);
                        }
                    }
                }
                catch (e) {
                    // Not text, ignore
                }
                for (const byte of data) {
                    if (this.decoder.processByte(byte)) {
                        const msg = this.decoder.getMessage();
                        if (msg) {
                            console.log(`[SerialManager] ✅ Decoded message: type=0x${msg.type.toString(16)}, seq=${msg.seq}, valid=${msg.valid}`);
                            this.events.onMessage(msg);
                        }
                    }
                }
            });
            await new Promise((resolve, reject) => {
                if (!this.port) {
                    reject(new Error('Port not initialized'));
                    return;
                }
                this.port.open((error) => {
                    if (error) {
                        reject(error);
                    }
                    else {
                        resolve();
                    }
                });
            });
        }
        catch (error) {
            console.error('[SerialManager] Connection failed:', error);
            this.scheduleReconnect();
            throw error;
        }
    }
    async disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.port && this.isConnected) {
            return new Promise((resolve) => {
                this.port.close(() => {
                    this.isConnected = false;
                    this.events.onDisconnect();
                    resolve();
                });
            });
        }
    }
    write(data) {
        if (this.port && this.isConnected) {
            // Log raw bytes for debugging
            const hex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ');
            console.log(`[SerialManager] Sending ${data.length} bytes: ${hex}`);
            this.port.write(Buffer.from(data));
        }
    }
    getIsConnected() {
        return this.isConnected;
    }
    getPortPath() {
        return this.portPath;
    }
    getBaudRate() {
        return this.baudRate;
    }
    getConnectionStartTime() {
        return this.connectionStartTime;
    }
    getConnectionUptime() {
        if (!this.connectionStartTime) {
            return 0;
        }
        return Date.now() - this.connectionStartTime;
    }
    handleDisconnect() {
        this.isConnected = false;
        this.connectionStartTime = null;
        this.events.onDisconnect();
        this.scheduleReconnect();
    }
    scheduleReconnect() {
        if (this.reconnectTimer) {
            return; // Already scheduled
        }
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            console.log('[SerialManager] Attempting reconnect...');
            this.connect().catch((error) => {
                console.error('[SerialManager] Reconnect failed:', error);
            });
        }, 2000); // Retry after 2 seconds
    }
}
//# sourceMappingURL=serial-manager.js.map