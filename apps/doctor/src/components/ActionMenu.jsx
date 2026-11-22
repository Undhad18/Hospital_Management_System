import React, { useState, useRef, useEffect } from "react";

export default function ActionMenu({ actions = [], triggerLabel = "Actions" }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!actions || actions.length === 0) return null;

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition shadow-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
      >
        <span>{triggerLabel}</span>
        <svg className="w-3.5 h-3.5 ml-1 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 z-30 mt-1.5 w-48 rounded-xl bg-white shadow-lg border border-slate-200 py-1 font-sans focus:outline-none animate-in fade-in-50 zoom-in-95 duration-100">
          {actions.map((act, idx) => (
            <button
              key={idx}
              type="button"
              disabled={act.disabled}
              title={act.tooltip || act.label}
              onClick={() => {
                setIsOpen(false);
                if (act.onClick) act.onClick();
              }}
              className={`w-full text-left px-3.5 py-2 text-xs flex items-center space-x-2 transition ${
                act.disabled
                  ? "opacity-40 cursor-not-allowed text-slate-400"
                  : act.variant === "danger"
                  ? "text-rose-600 hover:bg-rose-50"
                  : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {act.icon && <span className="w-4 h-4 shrink-0 flex items-center justify-center">{act.icon}</span>}
              <span className="font-medium">{act.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
