# Production Dockerfile with multi-stage build
FROM node:20-alpine AS builder

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite \
    git

# Accept build arguments for environment variables
ARG OPENAI_API_KEY
ARG OPENAI_REALTIME_MODEL
ARG OPENAI_RESPONSES_MODEL
ARG OPENAI_VISION_MODEL
ARG OPENAI_TTS_MODEL
ARG OPENAI_STT_MODEL
ARG ZIP_REALTIME_ENABLED
ARG ZIP_VOICE_FALLBACK_ENABLED

# Set environment variables for build
ENV OPENAI_API_KEY=${OPENAI_API_KEY}
ENV OPENAI_REALTIME_MODEL=${OPENAI_REALTIME_MODEL}
ENV OPENAI_RESPONSES_MODEL=${OPENAI_RESPONSES_MODEL}
ENV OPENAI_VISION_MODEL=${OPENAI_VISION_MODEL}
ENV OPENAI_TTS_MODEL=${OPENAI_TTS_MODEL}
ENV OPENAI_STT_MODEL=${OPENAI_STT_MODEL}
ENV ZIP_REALTIME_ENABLED=${ZIP_REALTIME_ENABLED}
ENV ZIP_VOICE_FALLBACK_ENABLED=${ZIP_VOICE_FALLBACK_ENABLED}

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies (use legacy-peer-deps for React Three Fiber compatibility)
# Use npm ci for reproducible builds and clean cache
RUN npm ci --legacy-peer-deps && \
    npm cache clean --force

# Copy source code (this layer will invalidate on code changes)
COPY . .

# Build Next.js application (requires API key from build args)
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

# Install runtime dependencies (wget for health checks)
RUN apk add --no-cache \
    sqlite \
    wget \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Set environment to production
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Accept runtime environment variables
ARG OPENAI_API_KEY
ARG OPENAI_REALTIME_MODEL
ARG OPENAI_RESPONSES_MODEL
ARG OPENAI_VISION_MODEL
ARG OPENAI_TTS_MODEL
ARG OPENAI_STT_MODEL
ARG ZIP_REALTIME_ENABLED
ARG ZIP_VOICE_FALLBACK_ENABLED

# Set runtime environment variables
ENV OPENAI_API_KEY=${OPENAI_API_KEY}
ENV OPENAI_REALTIME_MODEL=${OPENAI_REALTIME_MODEL}
ENV OPENAI_RESPONSES_MODEL=${OPENAI_RESPONSES_MODEL}
ENV OPENAI_VISION_MODEL=${OPENAI_VISION_MODEL}
ENV OPENAI_TTS_MODEL=${OPENAI_TTS_MODEL}
ENV OPENAI_STT_MODEL=${OPENAI_STT_MODEL}
ENV ZIP_REALTIME_ENABLED=${ZIP_REALTIME_ENABLED}
ENV ZIP_VOICE_FALLBACK_ENABLED=${ZIP_VOICE_FALLBACK_ENABLED}

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy package files
COPY package*.json ./

# Install only production dependencies (use legacy-peer-deps for React Three Fiber compatibility)
RUN npm ci --only=production --legacy-peer-deps && \
    npm cache clean --force

# Copy built application from builder
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/next.config.js ./next.config.js
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Create data directory for SQLite databases and logs
RUN mkdir -p /app/data && \
    chown -R nextjs:nodejs /app/data

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Set port environment variable
ENV PORT=3000

# Health check
HEALTHCHECK --interval=60s --timeout=10s --start-period=60s --retries=5 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Run production server
CMD ["npm", "run", "start"]

