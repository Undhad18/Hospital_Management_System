import React from "react";

export default function LoadingSpinner({
  size = "md",
  color = "sky",
  label = null,
  className = "",
}) {
  const sizeClasses = {
    sm: "w-4 h-4 border-2",
    md: "w-6 h-6 border-2",
    lg: "w-8 h-8 border-3",
  }[size] || "w-6 h-6 border-2";

  const colorClasses = {
    sky: "border-sky-600 border-t-transparent",
    white: "border-white border-t-transparent",
    slate: "border-slate-500 border-t-transparent",
    emerald: "border-emerald-600 border-t-transparent",
    rose: "border-rose-600 border-t-transparent",
  }[color] || "border-sky-600 border-t-transparent";

  return (
    <div className={`inline-flex items-center space-x-2 ${className}`}>
      <div className={`rounded-full animate-spin ${sizeClasses} ${colorClasses}`} role="status">
        <span className="sr-only">Loading...</span>
      </div>
      {label && <span className="text-xs text-slate-500 font-medium">{label}</span>}
    </div>
  );
}
