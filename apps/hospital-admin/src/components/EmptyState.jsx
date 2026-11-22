import React from "react";

export default function EmptyState({
  icon = null,
  title = "No records found",
  description = "There are currently no items matching your criteria.",
  actionLabel = null,
  onAction = null,
  className = "",
}) {
  return (
    <div className={`p-8 sm:p-12 text-center rounded-xl border border-dashed border-slate-200 bg-white max-w-lg mx-auto ${className}`}>
      <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 flex items-center justify-center mx-auto mb-3.5 shadow-inner">
        {icon || (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        )}
      </div>

      <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">{description}</p>

      {actionLabel && onAction && (
        <div className="mt-4">
          <button
            type="button"
            onClick={onAction}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold shadow-xs shadow-sky-600/30 transition"
          >
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}
