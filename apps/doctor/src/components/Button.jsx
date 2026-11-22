import React from "react";
import LoadingSpinner from "./LoadingSpinner";

export default function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  type = "button",
  onClick,
  icon = null,
  className = "",
  ...props
}) {
  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs font-semibold rounded-lg",
    md: "px-4 py-2 text-xs sm:text-sm font-bold rounded-lg",
    lg: "px-5 py-2.5 text-sm font-bold rounded-xl",
  }[size] || "px-4 py-2 text-xs sm:text-sm font-bold rounded-lg";

  const variantClasses = {
    primary:
      "bg-sky-600 hover:bg-sky-700 text-white shadow-xs shadow-sky-600/30 border border-transparent focus:ring-2 focus:ring-sky-500",
    secondary:
      "bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 focus:ring-2 focus:ring-slate-400",
    outline:
      "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 shadow-xs focus:ring-2 focus:ring-slate-300",
    danger:
      "bg-rose-600 hover:bg-rose-700 text-white shadow-xs shadow-rose-600/30 border border-transparent focus:ring-2 focus:ring-rose-500",
    emerald:
      "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs shadow-emerald-600/30 border border-transparent focus:ring-2 focus:ring-emerald-500",
  }[variant] || "bg-sky-600 hover:bg-sky-700 text-white";

  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center space-x-1.5 transition select-none disabled:opacity-50 disabled:cursor-not-allowed font-sans ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {loading ? (
        <LoadingSpinner
          size="sm"
          color={variant === "outline" || variant === "secondary" ? "slate" : "white"}
        />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      <span>{children}</span>
    </button>
  );
}
