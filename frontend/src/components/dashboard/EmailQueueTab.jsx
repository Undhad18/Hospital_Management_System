import React from "react";
import { Mail } from "lucide-react";

export default function EmailQueueTab({ onOpenInspector }) {
  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="p-6 rounded-3xl bg-slate-900/80 border border-white/10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Mail className="w-5 h-5 text-violet-400" />
            Background Email Worker Telemetry
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Orders respond in &lt;15ms; email templating and delivery run asynchronously in the background.
          </p>
        </div>

        {onOpenInspector && (
          <button
            onClick={onOpenInspector}
            className="px-4 py-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-violet-600/30 transition cursor-pointer"
          >
            Open Full Inspector Modal
          </button>
        )}
      </div>

      <div className="p-6 rounded-3xl bg-slate-900/80 border border-white/10 space-y-4">
        <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>Recent Dispatched Email Jobs</span>
          <span className="text-emerald-400">● Live Stream Listening</span>
        </div>

        <div className="text-center py-12 border border-dashed border-white/10 rounded-2xl">
          <Mail className="w-10 h-10 text-violet-400 mx-auto mb-2 animate-bounce" />
          <p className="text-sm font-bold text-white">Interactive Queue Telemetry Ready</p>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Click "Open Full Inspector Modal" to view enqueued jobs, average worker latency, and rendered HTML email receipts.
          </p>
        </div>
      </div>
    </div>
  );
}
