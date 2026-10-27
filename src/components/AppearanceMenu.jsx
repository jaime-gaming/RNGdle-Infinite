import React, { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Monitor, Moon, Sun } from "lucide-react";
import "../appearance.css";

const THEMES = [
  ["light", "Light", Sun],
  ["system", "System", Monitor],
  ["dark", "Dark", Moon],
];

export default function AppearanceMenu({ theme, onTheme }) {
  const [open, setOpen] = useState(false);
  const host = useRef(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  const id = useId();
  const [, label, Icon] =
    THEMES.find(([value]) => value === theme) ?? THEMES[0];

  const close = (restore = false) => {
    setOpen(false);
    if (restore) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector('[aria-checked="true"]')?.focus();
    const outside = (event) => {
      if (!host.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  function keydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === "Tab") {
      close();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = [
      ...menu.current.querySelectorAll('[role^="menuitem"]'),
    ].filter((item) => !item.disabled);
    const current = items.indexOf(document.activeElement);
    const index =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
            items.length;
    items[index]?.focus();
  }

  return (
    <div className="appearance-control" ref={host}>
      <button
        type="button"
        className="appearance-trigger"
        ref={trigger}
        aria-label="Appearance"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={`${label} theme`}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Icon size={16} aria-hidden="true" />
        <ChevronDown size={11} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={id}
          className="appearance-menu"
          role="menu"
          aria-label="Appearance"
          ref={menu}
          onKeyDown={keydown}
          onBlur={(event) => {
            if (!host.current?.contains(event.relatedTarget)) close();
          }}
        >
          <p className="appearance-heading">Color theme</p>
          {THEMES.map(([value, name, ThemeIcon]) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={theme === value}
              className="appearance-option"
              onClick={() => {
                onTheme(value);
                close(true);
              }}
            >
              <ThemeIcon size={16} aria-hidden="true" />
              <span>{name} theme</span>
              {theme === value && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
