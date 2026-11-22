import React, { useEffect } from "react";

export default function ToastNotification({
  type = "info",
  message,
  onClose,
  duration = 4500,
}) {
  useEffect(() => {
    if (!duration || !onClose) return;
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!message) return null;

  const styles = {
    success: {
      bg: "bg-white border-emerald-200 text-emerald-900",
      icon: (
        <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      ),
    },
    error: {
      bg: "bg-white border-rose-200 text-rose-900",
      icon: (
        <div className="w-5 h-5 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      ),
    },
    warning: {
      bg: "bg-white border-amber-200 text-amber-900",
      icon: (
        <div className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
      ),
    },
    info: {
      bg: "bg-white border-sky-200 text-sky-900",
      icon: (
        <div className="w-5 h-5 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      ),
    },
  }[type] || styles?.info;

  return (
    <div
      role="alert"
      className={`fixed top-5 right-5 z-50 max-w-sm sm:max-w-md p-3.5 rounded-xl shadow-xl border flex items-start space-x-3 text-xs font-semibold animate-in fade-in slide-in-from-top-4 duration-200 ${styles?.bg}`}
    >
      {styles?.icon}
      <div className="flex-1 leading-relaxed pt-0.5">{message}</div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 font-bold ml-2 text-sm"
        >
          ✕
        </button>
      )}
    </div>
  );
}
