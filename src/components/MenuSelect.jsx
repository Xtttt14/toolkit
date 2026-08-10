import React, { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export default function MenuSelect({ value, options, onChange, className = "", disabled = false, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const selected = options.find(option => String(option.value) === String(value)) || options[0];

  useEffect(() => {
    const close = event => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = event => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div className={`menu-select ${className}`} ref={root}>
      <button
        type="button"
        className="menu-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(current => !current)}
      >
        <span>{selected?.label}</span><ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && (
        <div className="menu-select-popover" role="listbox" aria-label={ariaLabel}>
          {options.map(option => (
            <button
              type="button"
              role="option"
              aria-selected={String(option.value) === String(value)}
              key={String(option.value)}
              disabled={option.disabled}
              onClick={() => { onChange(option.value); setOpen(false); }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
