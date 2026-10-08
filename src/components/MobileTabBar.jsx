import React, { useEffect, useRef, useState } from "react";
import {
  Dices,
  Ellipsis,
  History,
  ListChecks,
  Medal,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import "../mobile-tabbar.css";

// Phones get their own layout: the logo stays in a slim top bar, and the
// destinations live in a bottom bar of at most five buttons. Roll sits in the
// centre, Badges and Shop take the right, and everything else sits on the left
// behind one More menu. It renders in the DOM everywhere but only paints under
// 761px, so a resize or a rotated tablet never loses the navigation.
export default function MobileTabBar({
  page,
  rebirthVisible,
  rebirthReady,
  tasksReady,
  navigate,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const bar = useRef(null);
  const more = useRef(null);

  // A tap anywhere outside the bar, or Escape, closes the menu. Escape also
  // gives focus back to the button that opened it.
  useEffect(() => {
    if (!menuOpen) return undefined;
    function outside(event) {
      if (!bar.current?.contains(event.target)) setMenuOpen(false);
    }
    function key(event) {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      more.current?.focus();
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
    };
  }, [menuOpen]);

  // Moving to another page closes the menu, whatever moved us there.
  useEffect(() => {
    setMenuOpen(false);
  }, [page]);

  const moreItems = [
    {
      id: "history",
      label: "History",
      icon: History,
      go: () => navigate("history"),
    },
    ...(rebirthVisible
      ? [
          {
            id: "rebirth",
            label: "Rebirth",
            icon: Sparkles,
            ready: rebirthReady,
            go: () => navigate("rebirth"),
          },
        ]
      : []),
    {
      id: "settings",
      label: "Settings",
      icon: SlidersHorizontal,
      go: () => navigate("settings"),
    },
  ];
  const moreActive = moreItems.some((item) => item.id === page);

  function tab(id, label, Icon, go, ready = false) {
    return (
      <button
        key={id}
        type="button"
        className={`${page === id ? "active" : ""} ${ready ? "is-ready" : ""}`}
        aria-current={page === id ? "page" : undefined}
        aria-label={ready ? `${label}, ready` : undefined}
        onClick={go}
      >
        <span className="mobile-tabbar-icon" aria-hidden="true">
          <Icon size={20} />
          {ready && <i className="mobile-tabbar-dot" />}
        </span>
        <span className="mobile-tabbar-label">{label}</span>
      </button>
    );
  }

  return (
    <nav className="mobile-tabbar" aria-label="Mobile navigation" ref={bar}>
      {tab("tasks", "Tasks", ListChecks, () => navigate("tasks"), tasksReady)}
      <div className="mobile-tabbar-more">
        <button
          ref={more}
          type="button"
          className={`${moreActive || menuOpen ? "active" : ""} ${rebirthReady ? "is-ready" : ""}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls="mobile-more-menu"
          aria-label={rebirthReady ? "More, a rebirth is ready" : "More"}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="mobile-tabbar-icon" aria-hidden="true">
            <Ellipsis size={20} />
            {rebirthReady && <i className="mobile-tabbar-dot" />}
          </span>
          <span className="mobile-tabbar-label">More</span>
        </button>
        {menuOpen && (
          <div
            id="mobile-more-menu"
            className="mobile-more-menu"
            role="menu"
            aria-label="More destinations"
          >
            {moreItems.map(({ id, label, icon: Icon, ready, go }) => (
              <button
                key={id}
                type="button"
                role="menuitem"
                className={`${page === id ? "active" : ""}`}
                aria-current={page === id ? "page" : undefined}
                onClick={() => {
                  setMenuOpen(false);
                  go();
                }}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
                {ready && (
                  <i className="mobile-more-ready" aria-label="ready" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        className={`mobile-tabbar-roll ${page === "roll" ? "active" : ""}`}
        aria-current={page === "roll" ? "page" : undefined}
        onClick={() => navigate("roll")}
      >
        <span className="mobile-tabbar-disc" aria-hidden="true">
          <Dices size={24} />
        </span>
        <span className="mobile-tabbar-label">Roll</span>
      </button>
      {tab("badges", "Badges", Medal, () => navigate("badges"))}
      {tab("shop", "Shop", ShoppingBag, () => navigate("shop"))}
    </nav>
  );
}
