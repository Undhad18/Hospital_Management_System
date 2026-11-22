import { useState, useRef, useEffect, useMemo } from "react";

/**
 * CustomDropdown
 * Standardized premium dropdown component matching the system design.
 * Features:
 * - Clean downward-floating panel with box-shadow and border
 * - Search filter ("Type to filter...") when options > 5 or searchable=true
 * - Highlighted active/selected state in sky-50 with sky-800 typography
 * - Smooth hover and focus transitions
 * - Support for status badges, sublabels, and disabled states
 * - Click-outside detection to auto-close
 */
export default function CustomDropdown({
  value,
  options = [],
  onChange,
  placeholder = "-- Select --",
  searchable = true,
  filterPlaceholder = "Type to filter...",
  className = "",
  buttonClassName = "",
  disabled = false,
  name = "",
  id = "",
  required = false,
  maxHeight = "max-h-36",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef(null);

  // Normalize options into uniform { id, label, value, sublabel, disabled, status }
  const normalizedOptions = useMemo(() => {
    if (!Array.isArray(options)) return [];
    return options.map((opt) => {
      if (opt === null || opt === undefined) {
        return { id: "", value: "", label: "" };
      }
      if (typeof opt === "object") {
        const val = opt.value !== undefined ? opt.value : opt.id !== undefined ? opt.id : opt.name || "";
        const lbl = opt.label !== undefined ? opt.label : opt.name !== undefined ? opt.name : String(val);
        return {
          id: String(val),
          value: val,
          label: lbl,
          sublabel: opt.sublabel || opt.code || (opt.code ? `(#${opt.code})` : null),
          disabled: Boolean(opt.disabled),
          status: opt.status,
        };
      }
      return {
        id: String(opt),
        value: opt,
        label: String(opt),
      };
    });
  }, [options]);

  // Find currently selected option
  const selectedOpt = useMemo(() => {
    if (value === undefined || value === null || value === "") return null;
    return normalizedOptions.find((o) => String(o.value) === String(value) || String(o.id) === String(value)) || null;
  }, [normalizedOptions, value]);

  // Handle outside click to close
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Filter options by search term
  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return normalizedOptions;
    const q = searchTerm.toLowerCase().trim();
    return normalizedOptions.filter(
      (o) =>
        o.label?.toLowerCase().includes(q) ||
        (o.sublabel && String(o.sublabel).toLowerCase().includes(q))
    );
  }, [normalizedOptions, searchTerm]);

  const isSearchable = searchable !== false;

  const handleSelect = (opt) => {
    if (opt.disabled) return;
    setIsOpen(false);
    setSearchTerm("");
    if (typeof onChange === "function") {
      const selectedValue = opt.value;
      const syntheticEvent = {
        target: { name: name || id, value: selectedValue },
        currentTarget: { name: name || id, value: selectedValue },
        value: selectedValue,
      };
      onChange(selectedValue, syntheticEvent);
    }
  };

  return (
    <div className={`relative ${className || "w-full"}`} ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setIsOpen((prev) => !prev);
          setSearchTerm("");
        }}
        className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded border border-slate-200 bg-white text-left hover:border-slate-300 focus:outline-hidden focus:border-sky-500 cursor-pointer shadow-2xs transition ${disabled ? "opacity-50 cursor-not-allowed bg-slate-50" : ""
          } ${buttonClassName}`}
      >
        <span className="truncate font-medium text-slate-800">
          {selectedOpt ? (
            <>
              {selectedOpt.label}
              {selectedOpt.sublabel && (
                <span className="ml-1.5 text-[10px] font-mono text-slate-500">
                  {selectedOpt.sublabel}
                </span>
              )}
              {selectedOpt.status && selectedOpt.status !== "active" ? (
                <span className="ml-1.5 text-[10px] text-rose-500 font-mono">(Inactive)</span>
              ) : null}
            </>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-slate-400 ml-1.5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""
            }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-xl z-50 overflow-hidden">
          {isSearchable && (
            <div className="p-2 border-b border-slate-100 bg-slate-50/50">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={filterPlaceholder}
                className="w-full px-2.5 py-1 text-xs border border-slate-200 rounded bg-white text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-sky-500"
                onClick={(e) => e.stopPropagation()}
                autoFocus
              />
            </div>
          )}

          <div className={`${maxHeight} overflow-y-auto custom-scrollbar divide-y divide-slate-50`}>
            {filteredOptions.length === 0 ? (
              <div className="p-2.5 text-center text-xs text-slate-400">
                No matching options found
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = selectedOpt && (String(selectedOpt.value) === String(opt.value) || String(selectedOpt.id) === String(opt.id));
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => handleSelect(opt)}
                    className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between transition ${opt.disabled
                        ? "opacity-50 cursor-not-allowed bg-slate-50 text-slate-400"
                        : isSelected
                          ? "bg-sky-50 font-semibold text-sky-800 cursor-pointer"
                          : "hover:bg-sky-50 text-slate-700 cursor-pointer"
                      }`}
                  >
                    <div className="min-w-0 pr-2 truncate">
                      <span className="truncate">{opt.label}</span>
                      {opt.sublabel && (
                        <span className="ml-1.5 text-[10px] font-mono text-slate-500">
                          {opt.sublabel}
                        </span>
                      )}
                    </div>
                    {isSelected ? (
                      <span className="text-[10px] text-sky-600 font-semibold shrink-0 ml-1">Selected</span>
                    ) : opt.status && opt.status !== "active" ? (
                      <span className="text-[10px] text-rose-500 font-mono shrink-0 ml-1">Inactive</span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
