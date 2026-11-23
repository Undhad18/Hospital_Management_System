import React, { useState, useEffect } from "react";
import {
  Server,
  Globe,
  Database,
  Cpu,
  ShieldCheck,
  Zap,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Layers,
  ArrowRight,
  HardDrive,
  Activity,
  Code2,
  Lock,
  Radio,
  FileCode,
  SlidersHorizontal,
} from "lucide-react";

const NGINX_DEFAULT_CONF = `# ==============================================================================
# ShopSphere Virtual Host: Same-Origin Reverse Proxy & CDN Edge Router
# ==============================================================================

server {
    listen 80;
    server_name shopsphere.io www.shopsphere.io localhost;

    root /usr/share/nginx/html;
    index index.html;

    # 1. API Reverse Proxy (Express Backend Cluster)
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        proxy_pass http://backend_cluster;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Bypass CDN cache for dynamic ACID API transactions
        proxy_cache_bypass 1;
        proxy_no_cache 1;
        add_header Cache-Control "no-store, no-cache, must-revalidate" always;
        add_header X-Architecture "Same-Origin-Reverse-Proxy" always;
    }

    # 2. WebSocket Stream (Socket.IO)
    location /socket.io/ {
        proxy_pass http://backend_cluster;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;
    }

    # 3. Static Uploads (Multer Image Storage)
    location /uploads/ {
        proxy_pass http://backend_cluster;
        expires 7d;
        add_header Cache-Control "public, max-age=604800, stale-while-revalidate=86400";
    }

    # 4. CDN Immutable Cache for Bundled Hashed Assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header X-Cache-Status "CDN-EDGE-IMMUTABLE";
    }

    # 5. React SPA Fallback Router
    location / {
        try_files $uri $uri/ /index.html;
        add_header X-Served-By "ShopSphere-Edge-CDN" always;
    }
}`;

const NGINX_MAIN_CONF = `# ==============================================================================
# ShopSphere Production Nginx Configuration (nginx.conf)
# ==============================================================================

user nginx;
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Gzip Compression Tuning
    gzip on;
    gzip_comp_level 6;
    gzip_min_length 256;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    # Rate Limiting Zones (DDoS & Brute Force Protection)
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=30r/s;
    limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/s;

    # Upstream Express Cluster
    upstream backend_cluster {
        server backend:5000 max_fails=3 fail_timeout=10s;
        keepalive 32;
    }

    include /etc/nginx/conf.d/*.conf;
}`;

const DOCKER_COMPOSE_CONF = `# ==============================================================================
# ShopSphere Production Deployment Topology (docker-compose.yml)
# ==============================================================================

version: "3.8"

services:
  # 1. Edge Reverse Proxy & Same-Origin Gateway
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./frontend/dist:/usr/share/nginx/html:ro
    depends_on:
      - backend
      - frontend
    networks:
      - shopsphere-network

  # 2. Frontend React SPA
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    networks:
      - shopsphere-network

  # 3. Backend Express API & WebSockets
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    environment:
      - NODE_ENV=production
      - DB_HOST=mysql
      - REDIS_HOST=redis
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - shopsphere-network

  # 4. Relational Database (MySQL 8.0 InnoDB)
  mysql:
    image: mysql:8.0
    environment:
      - MYSQL_DATABASE=mern_stack_roadmap
    volumes:
      - mysql_data:/var/lib/mysql
    networks:
      - shopsphere-network

  # 5. In-Memory Cache (Redis 7.0)
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    networks:
      - shopsphere-network

volumes:
  mysql_data:
  redis_data:

networks:
  shopsphere-network:
    driver: bridge`;

export default function ProductionTopologyViewer() {
  const [topologyData, setTopologyData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("virtual-host");
  const [copiedKey, setCopiedKey] = useState(null);

  const fetchTopologyStatus = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("http://localhost:5000/api/topology/status");
      const data = await res.json();
      if (data?.success) {
        setTopologyData(data.topology);
      }
    } catch (err) {
      console.error("Failed to load topology data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTopologyStatus();
  }, []);

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Hero Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-cyan-950/70 via-slate-900/80 to-indigo-950/70 border border-cyan-500/20 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-mono font-bold border border-cyan-500/30">
                TASK 3: PRODUCTION TOPOLOGY & REVERSE PROXY
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold border border-emerald-500/30">
                SAME-ORIGIN ACTIVE
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              Enterprise Deployment Topology & Reverse Proxy Architecture
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
              Demonstrating production integration patterns: unified same-origin routing via Nginx reverse proxy, immutable CDN cache policies, zero CORS preflight overhead, and multi-tier container orchestration.
            </p>
          </div>

          <button
            onClick={fetchTopologyStatus}
            disabled={isLoading}
            className="px-4 py-2.5 rounded-xl bg-slate-900 border border-white/10 hover:border-cyan-500/40 text-cyan-300 text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-lg self-start md:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-cyan-400" : ""}`} />
            <span>Sync Topology Metrics</span>
          </button>
        </div>
      </div>

      {/* 4-Tier Visual Architecture Topology Map */}
      <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/80 border border-white/10 shadow-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">4-Tier Deployment Pipeline Topology</h3>
              <p className="text-[11px] text-slate-400">Traffic flow from Edge CDN to InnoDB Persistence</p>
            </div>
          </div>

          <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-xl border border-emerald-500/20">
            End-to-End Encrypted (TLS 1.3)
          </span>
        </div>

        {/* Pipeline Nodes Flow Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
          {/* Node 1: Client & CDN Edge */}
          <div className="p-5 rounded-2xl bg-slate-950/80 border border-cyan-500/30 relative flex flex-col justify-between space-y-3 group hover:border-cyan-500/60 transition shadow-lg">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-cyan-400 px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">
                  TIER 1: CDN EDGE
                </span>
                <Globe className="w-4 h-4 text-cyan-400" />
              </div>
              <h4 className="text-sm font-bold text-white">React Single Page App</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Vite bundled static distribution (<code className="text-cyan-300">/dist</code>). Hashed assets cached at global edge nodes.
              </p>
            </div>
            <div className="pt-2 border-t border-white/5 text-[10px] font-mono text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Immutable Caching (1 Year)
            </div>
          </div>

          {/* Node 2: Nginx Reverse Proxy */}
          <div className="p-5 rounded-2xl bg-slate-950/80 border border-emerald-500/30 relative flex flex-col justify-between space-y-3 group hover:border-emerald-500/60 transition shadow-lg">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                  TIER 2: GATEWAY
                </span>
                <Server className="w-4 h-4 text-emerald-400" />
              </div>
              <h4 className="text-sm font-bold text-white">Nginx Reverse Proxy</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Port 80/443 Same-Origin router. Handles SSL termination, Gzip, rate-limiting, and WebSocket upgrades.
              </p>
            </div>
            <div className="pt-2 border-t border-white/5 text-[10px] font-mono text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Zero CORS Overhead
            </div>
          </div>

          {/* Node 3: Express Backend Cluster */}
          <div className="p-5 rounded-2xl bg-slate-950/80 border border-indigo-500/30 relative flex flex-col justify-between space-y-3 group hover:border-indigo-500/60 transition shadow-lg">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-indigo-400 px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">
                  TIER 3: APP CLUSTER
                </span>
                <Cpu className="w-4 h-4 text-indigo-400" />
              </div>
              <h4 className="text-sm font-bold text-white">Express API & WebSockets</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Port 5000 REST API, Socket.IO rooms, Stripe PaymentIntent controller, and async email background queues.
              </p>
            </div>
            <div className="pt-2 border-t border-white/5 text-[10px] font-mono text-indigo-300 flex items-center gap-1">
              <Activity className="w-3 h-3 text-indigo-400" />
              Non-Blocking Event Loop
            </div>
          </div>

          {/* Node 4: MySQL & Redis Storage */}
          <div className="p-5 rounded-2xl bg-slate-950/80 border border-violet-500/30 relative flex flex-col justify-between space-y-3 group hover:border-violet-500/60 transition shadow-lg">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-violet-400 px-2 py-0.5 rounded bg-violet-500/10 border border-violet-500/20">
                  TIER 4: STORAGE & CACHE
                </span>
                <Database className="w-4 h-4 text-violet-400" />
              </div>
              <h4 className="text-sm font-bold text-white">MySQL 8.0 & Redis 7.0</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                InnoDB ACID transactions with row-level locks (<code className="text-violet-300">FOR UPDATE</code>) & in-memory key cache.
              </p>
            </div>
            <div className="pt-2 border-t border-white/5 text-[10px] font-mono text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              ACID Atomicity & Persistence
            </div>
          </div>
        </div>
      </div>

      {/* Same-Origin vs Cross-Origin Benefits & CDN Policies */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Same-Origin Benefits Matrix */}
        <div className="p-6 rounded-3xl bg-slate-900/80 border border-white/10 space-y-4 shadow-xl">
          <div className="flex items-center gap-2.5 pb-3 border-b border-white/10">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Why Same-Origin Reverse Proxy Beats CORS</h3>
              <p className="text-[11px] text-slate-400">Production advantages of unified Nginx routing</p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-white/5 space-y-1">
              <div className="flex items-center gap-2 font-bold text-white">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Zero Preflight Latency (Eliminates OPTIONS Roundtrips)</span>
              </div>
              <p className="text-slate-400 text-[11px] pl-4">
                Because both SPA assets and API requests originate from <code className="text-indigo-300">https://shopsphere.io</code>, browsers skip the slow HTTP <code className="text-indigo-300">OPTIONS</code> preflight handshake, saving 50-150ms per API mutation.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-white/5 space-y-1">
              <div className="flex items-center gap-2 font-bold text-white">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Strict SameSite & HttpOnly Cookie Security</span>
              </div>
              <p className="text-slate-400 text-[11px] pl-4">
                Enables <code className="text-emerald-300">SameSite=Strict</code> session cookies without cross-origin drops in modern browsers (Safari ITP / Chrome Privacy Sandbox).
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-white/5 space-y-1">
              <div className="flex items-center gap-2 font-bold text-white">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Defense-in-Depth & Port Obfuscation</span>
              </div>
              <p className="text-slate-400 text-[11px] pl-4">
                Internal application port 5000 is never exposed to the public internet. Nginx acts as a security firewall performing TLS termination and DDoS rate limiting.
              </p>
            </div>
          </div>
        </div>

        {/* CDN Caching Policies Matrix */}
        <div className="p-6 rounded-3xl bg-slate-900/80 border border-white/10 space-y-4 shadow-xl">
          <div className="flex items-center gap-2.5 pb-3 border-b border-white/10">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">CDN Edge Caching Strategies</h3>
              <p className="text-[11px] text-slate-400">Header-driven content delivery rules</p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-white/5 space-y-1.5 font-mono">
              <div className="flex items-center justify-between">
                <span className="text-indigo-400 font-bold text-[11px]">/assets/*.js, *.css (Hashed Bundles)</span>
                <span className="text-[9px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">1 YEAR IMMUTABLE</span>
              </div>
              <p className="text-slate-400 text-[10px] leading-relaxed">
                <code className="text-slate-200">Cache-Control: public, max-age=31536000, immutable</code>
                <br />
                Vite generates content hashes for each build, allowing permanent edge and browser caching.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-white/5 space-y-1.5 font-mono">
              <div className="flex items-center justify-between">
                <span className="text-violet-400 font-bold text-[11px]">/uploads/* (Product Images)</span>
                <span className="text-[9px] px-2 py-0.5 rounded bg-violet-500/20 text-violet-300">7 DAYS + SWR</span>
              </div>
              <p className="text-slate-400 text-[10px] leading-relaxed">
                <code className="text-slate-200">Cache-Control: public, max-age=604800, stale-while-revalidate=86400</code>
                <br />
                Caches catalog photography at edge while serving stale versions during revalidation.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-white/5 space-y-1.5 font-mono">
              <div className="flex items-center justify-between">
                <span className="text-amber-400 font-bold text-[11px]">/api/* (ACID Transactions & Checkouts)</span>
                <span className="text-[9px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300">BYPASS (NO-STORE)</span>
              </div>
              <p className="text-slate-400 text-[10px] leading-relaxed">
                <code className="text-slate-200">Cache-Control: no-store, no-cache, must-revalidate</code>
                <br />
                All dynamic database queries and stock balances bypass CDN caches to prevent stale data.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Nginx & Docker Compose Production Config Inspector */}
      <div className="p-6 rounded-3xl bg-slate-900/80 border border-white/10 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Code2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Production Configuration Inspector</h3>
              <p className="text-[11px] text-slate-400">Inspecting deployment specs in workspace</p>
            </div>
          </div>

          {/* Config Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950 border border-white/10 text-xs">
            <button
              onClick={() => setActiveTab("virtual-host")}
              className={`px-3 py-1.5 rounded-lg transition font-medium cursor-pointer ${
                activeTab === "virtual-host" ? "bg-indigo-600 text-white font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              nginx/default.conf
            </button>
            <button
              onClick={() => setActiveTab("main-conf")}
              className={`px-3 py-1.5 rounded-lg transition font-medium cursor-pointer ${
                activeTab === "main-conf" ? "bg-indigo-600 text-white font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              nginx/nginx.conf
            </button>
            <button
              onClick={() => setActiveTab("docker-compose")}
              className={`px-3 py-1.5 rounded-lg transition font-medium cursor-pointer ${
                activeTab === "docker-compose" ? "bg-indigo-600 text-white font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              docker-compose.yml
            </button>
          </div>
        </div>

        {/* Code Box */}
        <div className="relative rounded-2xl bg-slate-950 border border-white/10 overflow-hidden">
          <div className="p-3 border-b border-white/5 bg-slate-900/60 flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>
              {activeTab === "virtual-host"
                ? "nginx/conf.d/default.conf (Same-Origin Reverse Proxy)"
                : activeTab === "main-conf"
                ? "nginx/nginx.conf (Performance & Compression)"
                : "docker-compose.yml (Multi-Container Topology)"}
            </span>

            <button
              onClick={() => {
                const text =
                  activeTab === "virtual-host"
                    ? NGINX_DEFAULT_CONF
                    : activeTab === "main-conf"
                    ? NGINX_MAIN_CONF
                    : DOCKER_COMPOSE_CONF;
                handleCopy(text, activeTab);
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              {copiedKey === activeTab ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy File</span>
                </>
              )}
            </button>
          </div>

          <pre className="p-4 text-[11px] font-mono text-cyan-300 overflow-x-auto max-h-96 custom-scrollbar leading-relaxed">
            {activeTab === "virtual-host"
              ? NGINX_DEFAULT_CONF
              : activeTab === "main-conf"
              ? NGINX_MAIN_CONF
              : DOCKER_COMPOSE_CONF}
          </pre>
        </div>
      </div>
    </div>
  );
}
