# ==============================================================================
# ShopSphere Backend - Production Dockerfile
# Optimized Node.js Alpine Container with Non-Root Security & Healthchecks
# ==============================================================================

FROM node:20-alpine

# Set production environment
ENV NODE_ENV=production
ENV PORT=5000

WORKDIR /app

# Install curl for container healthchecking
RUN apk add --no-cache curl

# Create non-root user and group
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code and config
COPY . .

# Ensure upload directory exists and is owned by non-root user
RUN mkdir -p uploads && chown -R nodejs:nodejs /app

# Switch to non-root user for runtime security
USER nodejs

# Expose backend port
EXPOSE 5000

# Container Healthcheck (Checks health endpoint every 30s)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

# Start production server
CMD ["node", "server.js"]
