FROM node:20-alpine

# Install required tools for CLIProxy binary extraction
RUN apk add --no-cache tar gzip curl

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production=false

# Copy source files
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# Create data directories
RUN mkdir -p /app/data/cliproxy/auth /app/data/cliproxy/bin

# Expose ports
# 8318 - CCS Remote API server
# 8317 - CLIProxy (internal)
EXPOSE 8318 8317

# Environment variables with defaults
ENV CCS_PORT=8318
ENV CCS_HOST=0.0.0.0
ENV CCS_DATA_DIR=/app/data
ENV CCS_API_KEY=ccs-remote-key
ENV CCS_MANAGEMENT_KEY=ccs-remote-mgmt
ENV CCS_CLIPROXY_PORT=8317
ENV CCS_CORS_ORIGINS=*

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8318/api/health || exit 1

# Start server
CMD ["node", "dist/server.js"]

