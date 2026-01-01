# ZIP Robot Bridge Service

Bridge service that translates between WebSocket clients and the robot's binary serial protocol.

## Features

- Binary protocol framing (CRC16 validated)
- Command queue with retries and timeouts
- Telemetry streaming
- WebSocket server for multiple clients
- HTTP health endpoints
- Loopback mode for testing without robot

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your serial port path
```

3. Build:
```bash
npm run build
```

4. Run:
```bash
npm start
```

For development with hot reload:
```bash
npm run dev
```

## Configuration

- `SERIAL_PORT`: Serial port path (e.g., `/dev/ttyUSB0` on Linux, `COM3` on Windows)
- `SERIAL_BAUD`: Baud rate (default: 115200)
- `WS_PORT`: WebSocket server port (default: 8765)
- `HTTP_PORT`: HTTP server port (default: 8766)
- `LOOPBACK_MODE`: Enable loopback mode (simulated robot)

## WebSocket API

Connect to: `ws://localhost:8765/robot`

### Sending Commands

```json
{
  "type": "command",
  "cmd": "DRIVE_TWIST",
  "payload": {"v": 100, "omega": 50},
  "seq": 1
}
```

### Receiving Telemetry

```json
{
  "type": "telemetry",
  "data": {
    "ts_ms": 12345,
    "imu": {...},
    "ultrasonic_mm": 200,
    ...
  }
}
```

## HTTP Endpoints

- `GET /health` - Service health status
- `GET /robot/info` - Robot information (if connected)
- `GET /diagnostics` - Detailed diagnostics and statistics

## Docker Deployment

The robot bridge service can be deployed using Docker. See the main project's [Docker documentation](../../../docs/docker/README.md) for comprehensive setup instructions.

### Quick Start with Docker

```bash
# From project root
docker-compose up robot-bridge

# Or using Makefile
make dev:robot
```

### Docker Configuration

The service is configured in `docker-compose.yml` with:

- **Development**: `Dockerfile.dev` with hot reloading
- **Production**: `Dockerfile` with multi-stage build
- **Serial Port Access**: Configure device mapping in docker-compose.yml
- **Health Checks**: Automatic health monitoring
- **Resource Limits**: CPU and memory constraints

### Serial Port Access in Docker

To access serial ports from Docker, configure in `docker-compose.yml`:

**Linux**:
```yaml
devices:
  - /dev/ttyUSB0:/dev/ttyUSB0
```

**Windows/WSL2**:
```yaml
devices:
  - //./COM3:/dev/ttyUSB0
```

**Alternative** (less secure):
```yaml
privileged: true
```

### Environment Variables

All environment variables can be set in `.env` file or docker-compose.yml:

- `SERIAL_PORT` - Serial port path (auto-detected if not set)
- `SERIAL_BAUD` - Baud rate (default: 115200)
- `WS_PORT` - WebSocket port (default: 8765)
- `HTTP_PORT` - HTTP port (default: 8766)
- `LOOPBACK_MODE` - Enable loopback mode (default: false)

### Testing Without Hardware

Set `LOOPBACK_MODE=true` in your `.env` file to run the bridge without a physical robot. This simulates robot telemetry for testing.

