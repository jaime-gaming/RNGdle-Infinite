import React, { useEffect, useId, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Monitor,
  Moon,
  Square,
  Sun,
  Tag,
} from "lucide-react";
import { SALE_THEMES } from "../black-friday.js";
import { useSaleStatus } from "../use-black-friday.js";
import "../appearance.css";

const THEMES = [
  ["light", "Light", Sun],
  ["system", "System", Monitor],
  ["dark", "Dark", Moon],
];

const SALE_THEME_ICONS = { "ultra-black": Square, "red-sale": Tag };

export default function AppearanceMenu({ theme, onTheme }) {
  const [open, setOpen] = useState(false);
  const host = useRef(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  const id = useId();
  const sale = useSaleStatus();
  const options = [
    ...THEMES,
    ...(sale.active
      ? SALE_THEMES.map((entry) => [
          entry.id,
          entry.label,
          SALE_THEME_ICONS[entry.id] ?? Moon,
        ])
      : []),
  ];

  const effective = options.some(([value]) => value === theme)
    ? theme
    : SALE_THEMES.some((entry) => entry.id === theme)
      ? "dark"
      : theme;
  const [, label, Icon] =
    options.find(([value]) => value === effective) ?? options[0];

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
        data-sale-theme-option={
          SALE_THEMES.some((entry) => entry.id === theme) || undefined
        }
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
          {options.map(([value, name, ThemeIcon]) => (
            <React.Fragment key={value}>
              {value === SALE_THEMES[0]?.id && (
                <p className="appearance-temporary">TEMPORAL</p>
              )}
              <button
                type="button"
                role="menuitemradio"
                aria-checked={effective === value}
                className="appearance-option"
                onClick={() => {
                  onTheme(value);
                  close(true);
                }}
              >
                <ThemeIcon size={16} aria-hidden="true" />
                <span>{name} theme</span>
                {effective === value && <Check size={14} aria-hidden="true" />}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
