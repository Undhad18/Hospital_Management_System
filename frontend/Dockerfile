# ==============================================================================
# ShopSphere Frontend - Multi-Stage Production Dockerfile
# Stage 1: Build React SPA Bundle using Vite & Node.js
# Stage 2: Serve via High-Performance Nginx Alpine Web Server
# ==============================================================================

# --- Stage 1: Build Environment ---
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first for Docker layer caching
COPY package*.json ./
RUN npm ci

# Copy shared package and frontend source code
COPY . .

# Build production bundle to /app/dist
RUN npm run build

# --- Stage 2: Production Nginx Runner ---
FROM nginx:alpine AS runner

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy built static artifacts from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose standard HTTP port
EXPOSE 80

# Run Nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
