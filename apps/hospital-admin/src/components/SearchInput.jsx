import React, { useState, useEffect } from "react";

export default function SearchInput({
  value: initialValue = "",
  onChange,
  placeholder = "Search records...",
  className = "",
  debounceMs = 300,
}) {
  const [innerValue, setInnerValue] = useState(initialValue);

  useEffect(() => {
    setInnerValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (innerValue !== initialValue && onChange) {
        onChange(innerValue);
      }
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [innerValue, debounceMs]);

  return (
    <div className={`relative ${className}`}>
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      <input
        type="text"
        value={innerValue}
        onChange={(e) => setInnerValue(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 focus:bg-white transition"
      />

      {innerValue && (
        <button
          type="button"
          onClick={() => {
            setInnerValue("");
            if (onChange) onChange("");
          }}
          className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 font-bold text-xs"
        >
          ✕
        </button>
      )}
    </div>
  );
}
