import React, { useState } from "react";
import { Layers, Database, GitMerge, Server, FileCode, Shield, BookOpen, Copy, Check, Zap, Activity, CreditCard, Mail, Network, Download, ExternalLink, Globe, Cpu } from "lucide-react";

export default function ArchitectureDiagramsStudio() {
  const [activeTab, setActiveTab] = useState("topology");
  const [copiedSection, setCopiedSection] = useState(null);

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(key);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const tables = [
    {
      name: "users",
      badge: "AUTHENTICATION",
      badgeColor: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
      description: "User identity, role-based access control, and hashed passwords.",
      columns: [
        { name: "id", type: "INT AUTO_INCREMENT", key: "PK", desc: "Unique user identifier" },
        { name: "name", type: "VARCHAR(100)", key: "", desc: "User display name" },
        { name: "email", type: "VARCHAR(150)", key: "UNIQUE", desc: "Unique login email" },
        { name: "password", type: "VARCHAR(255)", key: "", desc: "Bcrypt hashed credential" },
        { name: "role", type: "ENUM('user','admin')", key: "", desc: "Access level" },
        { name: "status", type: "TINYINT", key: "", desc: "1 = Active, 0 = Inactive" },
        { name: "created_at", type: "TIMESTAMP", key: "", desc: "Registration timestamp" },
      ],
    },
    {
      name: "products",
      badge: "CATALOG",
      badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
      description: "Inventory items with pricing, categories, and Multer image uploads.",
      columns: [
        { name: "id", type: "INT AUTO_INCREMENT", key: "PK", desc: "Unique product ID" },
        { name: "name", type: "VARCHAR(255)", key: "", desc: "Product title" },
        { name: "category_id", type: "INT NULLABLE", key: "FK", desc: "Optional category reference" },
        { name: "price", type: "DECIMAL(10,2)", key: "", desc: "Base catalog price" },
        { name: "discount_price", type: "DECIMAL(10,2)", key: "", desc: "Promotional price" },
        { name: "stock", type: "INT", key: "", desc: "Available stock quantity" },
        { name: "sku", type: "VARCHAR(100)", key: "", desc: "Stock keeping unit" },
        { name: "image_url", type: "VARCHAR(500)", key: "", desc: "Path to uploaded media" },
      ],
    },
    {
      name: "orders",
      badge: "ACID TRANSACTIONS",
      badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
      description: "Master checkout orders with real-time status and shipping addresses.",
      columns: [
        { name: "id", type: "INT AUTO_INCREMENT", key: "PK", desc: "Order ID (Unique)" },
        { name: "user_id", type: "INT", key: "FK", desc: "References users(id) ON DELETE CASCADE" },
        { name: "total_amount", type: "DECIMAL(10,2)", key: "", desc: "Grand total after discounts" },
        { name: "status", type: "VARCHAR(50)", key: "", desc: "placed, confirmed, shipped, etc." },
        { name: "shipping_address", type: "TEXT", key: "", desc: "Customer delivery address" },
        { name: "payment_method", type: "VARCHAR(50)", key: "", desc: "stripe_card, usdc, apple_pay" },
        { name: "created_at", type: "TIMESTAMP", key: "", desc: "Order creation timestamp" },
      ],
    },
    {
      name: "order_items",
      badge: "LINE ITEMS",
      badgeColor: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
      description: "Individual products and quantities locked inside an ACID transaction.",
      columns: [
        { name: "id", type: "INT AUTO_INCREMENT", key: "PK", desc: "Line item ID" },
        { name: "order_id", type: "INT", key: "FK", desc: "References orders(id) ON DELETE CASCADE" },
        { name: "product_id", type: "INT", key: "FK", desc: "References products(id) ON DELETE RESTRICT" },
        { name: "quantity", type: "INT", key: "", desc: "Purchased quantity" },
        { name: "price", type: "DECIMAL(10,2)", key: "", desc: "Locked item price at purchase" },
      ],
    },
    {
      name: "idempotency_keys",
      badge: "DOUBLE-CHARGE DEFENSE",
      badgeColor: "bg-rose-500/20 text-rose-300 border-rose-500/30",
      description: "Client UUID keys preventing duplicate charges on rapid retries.",
      columns: [
        { name: "id", type: "INT AUTO_INCREMENT", key: "PK", desc: "Idempotency record ID" },
        { name: "idempotency_key", type: "VARCHAR(255)", key: "UNIQUE", desc: "Client-provided UUIDv4" },
        { name: "user_id", type: "INT NULLABLE", key: "", desc: "Associated user ID" },
        { name: "status", type: "ENUM('IN_PROGRESS','COMPLETED','FAILED')", key: "", desc: "Lock state" },
        { name: "response_code", type: "INT", key: "", desc: "Cached HTTP status code (200/201)" },
        { name: "response_body", type: "JSON", key: "", desc: "Cached response for fast replay" },
      ],
    },
    {
      name: "feature_flags",
      badge: "PROGRESSIVE DELIVERY",
      badgeColor: "bg-violet-500/20 text-violet-300 border-violet-500/30",
      description: "Dynamic runtime rollout rules and deterministic bucketing configurations.",
      columns: [
        { name: "flag_key", type: "VARCHAR(64)", key: "PK", desc: "Flag identifier (e.g. new_checkout_v2)" },
        { name: "name", type: "VARCHAR(100)", key: "", desc: "Human readable feature name" },
        { name: "is_active", type: "BOOLEAN", key: "", desc: "Global Kill-Switch toggle" },
        { name: "rollout_percentage", type: "INT", key: "", desc: "0-100 deterministic cohort bucket" },
        { name: "target_roles", type: "VARCHAR(50)", key: "", desc: "Target audience (all, admin, vip)" },
        { name: "whitelist_user_ids", type: "TEXT", key: "", desc: "Comma-separated override IDs" },
      ],
    },
  ];

  return (
    <div className="space-y-8 animate-fadeIn max-w-7xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-blue-950/80 via-slate-900/90 to-indigo-950/80 border border-blue-500/20 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-mono font-bold border border-blue-500/30 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                TASK 7: ARCHITECTURE & SYSTEM BLUEPRINT
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold border border-emerald-500/30">
                FINAL INTEGRATION
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              System Architecture & Integration Blueprints
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-3xl leading-relaxed">
              Complete production engineering contracts: 6-Tier Entity-Relationship (ER) Schema, End-to-End Sequence Diagrams, OpenAPI 3.0 Specifications, and Deployment Topology.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="http://localhost:5000/api-docs"
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-2 transition shadow-lg shadow-indigo-600/30 cursor-pointer"
            >
              <BookOpen className="w-4 h-4" />
              <span>Interactive Swagger Docs</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>
          </div>
        </div>
      </div>

      {/* Main Tab Navigator */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab("topology")}
          className={`px-4 py-2.5 rounded-2xl font-bold text-xs flex items-center gap-2 transition cursor-pointer shrink-0 ${
            activeTab === "topology"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
              : "bg-slate-900/80 text-slate-400 hover:text-white"
          }`}
        >
          <Server className="w-4 h-4" />
          <span>System Topology</span>
        </button>

        <button
          onClick={() => setActiveTab("er-diagram")}
          className={`px-4 py-2.5 rounded-2xl font-bold text-xs flex items-center gap-2 transition cursor-pointer shrink-0 ${
            activeTab === "er-diagram"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
              : "bg-slate-900/80 text-slate-400 hover:text-white"
          }`}
        >
          <Database className="w-4 h-4" />
          <span>MySQL ER Diagram</span>
        </button>

        <button
          onClick={() => setActiveTab("sequence-diagrams")}
          className={`px-4 py-2.5 rounded-2xl font-bold text-xs flex items-center gap-2 transition cursor-pointer shrink-0 ${
            activeTab === "sequence-diagrams"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
              : "bg-slate-900/80 text-slate-400 hover:text-white"
          }`}
        >
          <GitMerge className="w-4 h-4" />
          <span>Sequence Flows</span>
        </button>

        <button
          onClick={() => setActiveTab("api-contracts")}
          className={`px-4 py-2.5 rounded-2xl font-bold text-xs flex items-center gap-2 transition cursor-pointer shrink-0 ${
            activeTab === "api-contracts"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
              : "bg-slate-900/80 text-slate-400 hover:text-white"
          }`}
        >
          <FileCode className="w-4 h-4" />
          <span>OpenAPI 3.0 Contract</span>
        </button>
      </div>

      {/* TAB 1: SYSTEM TOPOLOGY */}
      {activeTab === "topology" && (
        <div className="space-y-6 animate-fadeIn">
          <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/80 border border-white/10 shadow-2xl space-y-6">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Server className="w-5 h-5 text-indigo-400" />
              <span>Multi-Tier Physical & Logical Topology</span>
            </h3>

            {/* Architecture Blocks Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-5 rounded-2xl bg-slate-950/80 border border-indigo-500/20 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-400 uppercase font-mono">
                  <Globe className="w-4 h-4" />
                  <span>1. Edge Ingress & Client</span>
                </div>
                <h4 className="text-base font-bold text-white">React 19 SPA + Nginx</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Single-Page Application served via Nginx Reverse Proxy with same-origin <code className="text-indigo-300">/api</code> routing, zero CORS latency, and HTTP security headers (HSTS, CSP, X-Frame-Options).
                </p>
                <div className="p-2.5 rounded-xl bg-slate-900 font-mono text-[11px] text-slate-400">
                  Port: 80 / 443 | Protocol: HTTP/2
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-slate-950/80 border border-purple-500/20 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-purple-400 uppercase font-mono">
                  <Cpu className="w-4 h-4" />
                  <span>2. Core API Cluster</span>
                </div>
                <h4 className="text-base font-bold text-white">Express.js & Socket.IO</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  High-throughput REST API with distributed APM tracing (<code className="text-purple-300">X-Trace-Id</code>), progressive feature flags, idempotent checkout handlers, and WebSocket status broadcasts.
                </p>
                <div className="p-2.5 rounded-xl bg-slate-900 font-mono text-[11px] text-slate-400">
                  Port: 5000 | Node.js v24
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-slate-950/80 border border-emerald-500/20 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase font-mono">
                  <Database className="w-4 h-4" />
                  <span>3. Persistence & Async Queue</span>
                </div>
                <h4 className="text-base font-bold text-white">MySQL 8.0 + Redis / Bull</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  ACID-compliant InnoDB storage with row-level locks for orders, idempotency tables, and asynchronous background queues for decoupled email/SMS fulfillment.
                </p>
                <div className="p-2.5 rounded-xl bg-slate-900 font-mono text-[11px] text-slate-400">
                  Port: 3306 (MySQL) / 6379 (Redis)
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MYSQL ER DIAGRAM */}
      {activeTab === "er-diagram" && (
        <div className="space-y-6 animate-fadeIn">
          <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/80 border border-white/10 shadow-2xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Database className="w-5 h-5 text-indigo-400" />
                  <span>Relational Database Schema & Entity Relationships</span>
                </h3>
                <p className="text-xs text-slate-400">
                  MySQL 8.0 InnoDB schema with foreign key cascades, unique constraints, and ACID idempotency tracking.
                </p>
              </div>

              <button
                onClick={() =>
                  copyToClipboard(
                    tables.map((t) => `-- Table: ${t.name}\n${JSON.stringify(t.columns, null, 2)}`).join("\n\n"),
                    "all_tables"
                  )
                }
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-2 transition cursor-pointer self-start sm:self-auto"
              >
                {copiedSection === "all_tables" ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied SQL Schema</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Schema</span>
                  </>
                )}
              </button>
            </div>

            {/* Tables Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {tables.map((tbl) => (
                <div key={tbl.name} className="p-5 rounded-2xl bg-slate-950/90 border border-white/10 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base font-bold text-white">{tbl.name}</span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border ${tbl.badgeColor}`}>
                        {tbl.badge}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400">{tbl.description}</p>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead>
                        <tr className="border-b border-white/10 text-slate-500 text-[11px]">
                          <th className="pb-2">Field</th>
                          <th className="pb-2">Type</th>
                          <th className="pb-2">Key</th>
                          <th className="pb-2">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {tbl.columns.map((col, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/50">
                            <td className="py-2 text-indigo-300 font-bold">{col.name}</td>
                            <td className="py-2 text-slate-400">{col.type}</td>
                            <td className="py-2">
                              {col.key && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                                  {col.key}
                                </span>
                              )}
                            </td>
                            <td className="py-2 text-slate-500 text-[11px] font-sans">{col.desc}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SEQUENCE FLOWS */}
      {activeTab === "sequence-diagrams" && (
        <div className="space-y-6 animate-fadeIn">
          <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/80 border border-white/10 shadow-2xl space-y-6">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <GitMerge className="w-5 h-5 text-indigo-400" />
              <span>Core Operational Sequence Workflows</span>
            </h3>

            {/* Workflow 1 */}
            <div className="p-6 rounded-2xl bg-slate-950/90 border border-white/10 space-y-4">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold border border-emerald-500/30">
                  WORKFLOW 1
                </span>
                <h4 className="text-base font-bold text-white">
                  Atomic Checkout with Stripe, Idempotency & Queue Notifications
                </h4>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-white/5 font-mono text-xs text-slate-300 space-y-2">
                <p className="text-indigo-400 font-bold">1. React SPA: Generates UUIDv4 Idempotency-Key & X-Trace-Id</p>
                <p className="text-slate-400 pl-4">→ Passes headers through Nginx Reverse Proxy to Express API</p>
                <p className="text-amber-400 font-bold">2. Idempotency Engine: Checks MySQL idempotency_keys</p>
                <p className="text-slate-400 pl-4">→ If key completed, returns cached 200 payload immediately</p>
                <p className="text-cyan-400 font-bold">3. MySQL InnoDB: START TRANSACTION</p>
                <p className="text-slate-400 pl-4">→ Atomic INSERT INTO orders + INSERT INTO order_items</p>
                <p className="text-emerald-400 font-bold">4. MySQL InnoDB: COMMIT TRANSACTION</p>
                <p className="text-purple-400 font-bold">5. Stripe Gateway: Confirms PaymentIntent (test mode)</p>
                <p className="text-rose-400 font-bold">6. Bull / Email Queue: Asynchronously dispatches HTML email</p>
                <p className="text-emerald-400 font-bold">7. Socket.IO: Emits real-time stage progression to client</p>
              </div>
            </div>

            {/* Workflow 2 */}
            <div className="p-6 rounded-2xl bg-slate-950/90 border border-white/10 space-y-4">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 text-[10px] font-mono font-bold border border-violet-500/30">
                  WORKFLOW 2
                </span>
                <h4 className="text-base font-bold text-white">
                  Feature Flag Progressive Rollout & Deterministic Hashing
                </h4>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-white/5 font-mono text-xs text-slate-300 space-y-2">
                <p className="text-violet-400 font-bold">1. React: Evaluates active flags via FeatureFlagContext</p>
                <p className="text-slate-400 pl-4">→ GET /api/feature-flags/evaluate?userId=4&role=customer</p>
                <p className="text-indigo-400 font-bold">2. Backend Engine: Polynomial hash on (userId + flagKey)</p>
                <p className="text-slate-400 pl-4">→ Hash("4:new_checkout_v2") % 100 &lt; rollout_percentage (50%)</p>
                <p className="text-emerald-400 font-bold">3. Sticky Assignment: Same user always receives the same UI</p>
                <p className="text-slate-400 pl-4">→ If True: Variant B (Next-Gen v2) | If False: Variant A (Legacy v1)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: API CONTRACTS */}
      {activeTab === "api-contracts" && (
        <div className="space-y-6 animate-fadeIn">
          <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/80 border border-white/10 shadow-2xl space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <FileCode className="w-5 h-5 text-indigo-400" />
                <span>OpenAPI 3.0 Contract Specification</span>
              </h3>
              <a
                href="http://localhost:5000/api/docs/openapi.json"
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1.5 transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Raw JSON Spec</span>
              </a>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 font-mono text-xs">
              <div className="p-4 rounded-2xl bg-slate-950 border border-white/5 space-y-2">
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">POST</span>
                <p className="text-white font-bold truncate">/api/orders/checkout</p>
                <p className="text-slate-400 text-[11px] font-sans">
                  ACID order placement with Idempotency-Key header protection.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-white/5 space-y-2">
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">POST</span>
                <p className="text-white font-bold truncate">/api/orders/webhook</p>
                <p className="text-slate-400 text-[11px] font-sans">
                  Stripe asynchronous payment webhook with rawBody HMAC check.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-white/5 space-y-2">
                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold text-[10px]">GET</span>
                <p className="text-white font-bold truncate">/api/feature-flags/evaluate</p>
                <p className="text-slate-400 text-[11px] font-sans">
                  Deterministic percentage bucketing and audience targeting.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-white/5 space-y-2">
                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold text-[10px]">GET</span>
                <p className="text-white font-bold truncate">/api/telemetry/traces</p>
                <p className="text-slate-400 text-[11px] font-sans">
                  Distributed trace waterfalls with category duration breakdowns.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-white/5 space-y-2">
                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold text-[10px]">GET</span>
                <p className="text-white font-bold truncate">/api/diagnostics/system-health</p>
                <p className="text-slate-400 text-[11px] font-sans">
                  Multi-tier live diagnostic probes for MySQL, Redis, and queues.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-white/5 space-y-2">
                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold text-[10px]">GET</span>
                <p className="text-white font-bold truncate">/api/topology/status</p>
                <p className="text-slate-400 text-[11px] font-sans">
                  Edge proxy headers, CDN caching policies, and runtime metrics.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
