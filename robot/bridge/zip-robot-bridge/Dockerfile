# Production Dockerfile for Robot Bridge Service
FROM node:20-alpine AS builder

# Install build dependencies for native modules (serialport)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    linux-headers

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install all dependencies (needed for build)
RUN npm ci && \
    npm cache clean --force

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

# Install runtime dependencies (wget for health checks, udev for serial port)
RUN apk add --no-cache \
    wget \
    udev \
    && rm -rf /var/cache/apk/*

# Set environment to production
ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 robotbridge

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application from builder
COPY --from=builder --chown=robotbridge:nodejs /app/dist ./dist
COPY --from=builder --chown=robotbridge:nodejs /app/package.json ./package.json

# Create logs directory
RUN mkdir -p /app/logs && \
    chown -R robotbridge:nodejs /app/logs

# Switch to non-root user
USER robotbridge

# Expose ports
EXPOSE 8765 8766

# Health check
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=5 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8766/health || exit 1

# Run production server
CMD ["npm", "start"]

