import React from "react";
import {
  Dices,
  ShoppingBag,
  Medal,
  History,
  Sparkles,
  SlidersHorizontal,
  UserRound,
  LogIn,
} from "lucide-react";
import "../mobile-tabbar.css";

// Phones get their own layout: the logo stays in a slim top bar and the
// destinations move to a bottom tab bar, thumb-reach first. It renders in the
// DOM everywhere but only ever paints under 761px, so a resize or a rotated
// tablet never loses the navigation.
export default function MobileTabBar({
  page,
  progress,
  rebirthVisible,
  rebirthReady,
  navigate,
  openSignup,
}) {
  const tabs = [
    { id: "roll", label: "Roll", icon: Dices, go: () => navigate("roll") },
    { id: "shop", label: "Shop", icon: ShoppingBag, go: () => navigate("shop") },
    { id: "badges", label: "Badges", icon: Medal, go: () => navigate("badges") },
    {
      id: "history",
      label: "History",
      icon: History,
      go: () => navigate("history"),
    },
  ];
  if (rebirthVisible)
    tabs.push({
      id: "rebirth",
      label: "Rebirth",
      icon: Sparkles,
      ready: rebirthReady,
      go: () => navigate("rebirth"),
    });
  tabs.push(
    {
      id: "settings",
      label: "Settings",
      icon: SlidersHorizontal,
      go: () => navigate("settings"),
    },
    {
      id: "profile",
      label: progress.profile ? "Profile" : "Sign up",
      icon: progress.profile ? UserRound : LogIn,
      go: openSignup,
    },
  );
  return (
    <nav className="mobile-tabbar" aria-label="Mobile navigation">
      {tabs.map(({ id, label, icon: Icon, ready, go }) => (
        <button
          key={id}
          type="button"
          className={`${page === id ? "active" : ""} ${ready ? "is-ready" : ""}`}
          aria-current={page === id ? "page" : undefined}
          aria-label={
            id === "rebirth" && ready ? "Rebirth, ready" : undefined
          }
          onClick={go}
        >
          <span className="mobile-tabbar-icon" aria-hidden="true">
            <Icon size={20} />
            {ready && <i className="mobile-tabbar-dot" />}
          </span>
          <span className="mobile-tabbar-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
