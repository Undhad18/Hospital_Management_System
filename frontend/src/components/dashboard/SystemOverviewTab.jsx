import React from "react";
import { Radio, Database, Cpu } from "lucide-react";

export default function SystemOverviewTab() {
  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-indigo-950/70 via-slate-900/80 to-purple-950/70 border border-white/10 shadow-2xl">
        <div className="flex items-center gap-2 mb-2">
          <span className="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-mono font-bold border border-indigo-500/30">
            ENTERPRISE ARCHITECTURE
          </span>
        </div>
        <h2 className="text-2xl font-extrabold text-white">Full-Stack MERN System Metrics</h2>
        <p className="text-xs text-slate-400 mt-1 max-w-2xl">
          Decoupled real-time WebSocket infrastructure, MySQL InnoDB ACID row-level locking, and background worker queues.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-3xl bg-slate-900/80 border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase font-mono">Real-Time Engine</span>
            <Radio className="w-5 h-5 text-emerald-400 animate-pulse" />
          </div>
          <p className="text-xl font-extrabold text-white">Socket.IO 4.8</p>
          <p className="text-xs text-slate-400">
            Sub-millisecond WebSocket updates pushed across order rooms and admin feeds.
          </p>
        </div>

        <div className="p-6 rounded-3xl bg-slate-900/80 border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase font-mono">Persistence & ACID</span>
            <Database className="w-5 h-5 text-indigo-400" />
          </div>
          <p className="text-xl font-extrabold text-white">MySQL 8.0 InnoDB</p>
          <p className="text-xs text-slate-400">
            Transactions with <code className="text-indigo-300">SELECT ... FOR UPDATE</code> to prevent race conditions.
          </p>
        </div>

        <div className="p-6 rounded-3xl bg-slate-900/80 border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase font-mono">Background Queue</span>
            <Cpu className="w-5 h-5 text-violet-400" />
          </div>
          <p className="text-xl font-extrabold text-white">Async Worker Loop</p>
          <p className="text-xs text-slate-400">
            Non-blocking email templating and dispatch without delaying HTTP requests.
          </p>
        </div>
      </div>
    </div>
  );
}
