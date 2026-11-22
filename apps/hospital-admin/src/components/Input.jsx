import React from "react";

export default function Input({
  label,
  error = null,
  helperText = null,
  required = false,
  type = "text",
  value,
  onChange,
  placeholder,
  disabled = false,
  className = "",
  id,
  ...props
}) {
  const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);

  return (
    <div className={`w-full space-y-1 font-sans ${className}`}>
      {label && (
        <label htmlFor={inputId} className="block text-xs font-bold text-slate-700">
          {label}
          {required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
      )}

      <input
        id={inputId}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        className={`w-full px-3.5 py-2 border rounded-lg text-sm transition focus:outline-none focus:ring-2 ${
          error
            ? "border-rose-300 bg-rose-50/30 text-rose-900 focus:ring-rose-400 focus:border-rose-400"
            : "border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:ring-sky-500 focus:border-sky-500"
        } ${disabled ? "bg-slate-50 text-slate-400 cursor-not-allowed" : ""}`}
        {...props}
      />

      {error ? (
        <p className="text-[11px] font-semibold text-rose-600 flex items-center space-x-1 mt-1" role="alert">
          <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>{error}</span>
        </p>
      ) : helperText ? (
        <p className="text-[11px] text-slate-400 mt-0.5">{helperText}</p>
      ) : null}
    </div>
  );
}
