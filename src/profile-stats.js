// CLEANUP Nov 4, 2026: drop the RNGWEEN_PET special cases (companion count
// and lookup) once the pet is out of the catalogue.
import {
  BADGE_TOTAL,
  cycleEarnedEp,
  discoveredCount,
  prestigeShown,
} from "./rebirth.js";
import { RNGWEEN_PET } from "./rngween-limited.js";
import { PETS } from "./pets.js";
import { SKILLS, skillSlots } from "./skills.js";
import { LATEST_VERSION } from "./changelog.js";
import { BOOKMARK_LIMIT, isCycleMarker } from "./history-log.js";
import { favoriteTier, mergeTallies, tallyEntries } from "./history-tally.js";
import { productById } from "./shop-data.js";

// How far you have come, in numbers.
//
// Every figure here is derived from the saved game, its activity log, and the
// totals of the entries that have since left that log (see history-tally.js).
// Nothing is stored twice, and clearing history never lowers a figure. A
// rebirth restarts the run, not the account: the log keeps every cycle, so
// these are the figures for the whole account.
export function accountStats(progress = {}) {
  const total = allTimeTally(progress);
  return {
    rolls: total.rolls,
    onlineRolls: total.rolls - total.offlineRolls,
    offlineRolls: total.offlineRolls,
    favoriteTier: favoriteTier(total),
    bestRoll: bestRollOf(total),
    totalEarned: progress.totalEarned ?? 0,
    balance: progress.balance ?? 0,
    spent: total.spent,
    uniqueBadges: total.badges.length,
    badgesNow: discoveredCount(progress),
    badgesTotal: BADGE_TOTAL,
    companions: (progress.pets ?? []).length,
    companionsFound: total.companions,
    companionsTotal:
      PETS.length + ((progress.pets ?? []).includes(RNGWEEN_PET.id) ? 1 : 0),
    skills: (progress.skills ?? []).length,
    skillsTotal: SKILLS.length,
    skillSlots: skillSlots(progress.owned),
    skillsUsed: total.skills,
    boostsUsed: total.boosts,
    rebirths: progress.rebirths ?? 0,
    ultraRebirths: progress.ultraRebirths ?? 0,
    rollbacks: progress.rollbacks ?? 0,
    freshStarts: progress.freshStarts ?? 0,
    firstEventAt: total.first,
    lastEventAt: total.last,
  };
}

// The current cycle in numbers: everything since the last rebirth (or since
// the account began, for a first cycle). It reads the same log as the account
// summary, so the rebirth page and the profile can never disagree about what
// this run has done.
export function cycleStats(progress = {}) {
  const history = Array.isArray(progress.history) ? progress.history : [];
  const start = history.findLastIndex(isCycleMarker);
  const events = start >= 0 ? history.slice(start + 1) : history;
  // The cycle in play comes after every marker the log holds, so that is the
  // number its removed entries were filed under.
  const cycle = history.filter(isCycleMarker).length;
  const tally = cycleTally(progress, events, cycle);
  return {
    startedAt:
      start >= 0
        ? history[start].at
        : (progress.profile?.createdAt ?? tally.first ?? null),
    rebirths: progress.rebirths ?? 0,
    rolls: tally.rolls,
    // The gate a rebirth reads: EP this cycle scored, straight from the log.
    earned: cycleEarnedEp(progress),
    spent: tally.spent,
    badges: tally.discovered.length,
    bestRoll: bestRollOf(tally),
  };
}

// What a profile is proud of: the best roll, the rolls it pinned, what it is
// wearing. Read from the save and the log, never stored on their own.
export function profileHighlights(progress = {}) {
  const history = Array.isArray(progress.history) ? progress.history : [];
  const stats = accountStats(progress);
  const rolls = new Map(
    history
      .filter((entry) => entry?.type === "roll")
      .map((entry) => [entry.id, entry]),
  );
  const pinned = (progress.bookmarks ?? [])
    .map((id) => rolls.get(id))
    .filter(Boolean)
    .map((entry) => ({
      id: entry.id,
      number: entry.number,
      ep: entry.ep,
      tier: entry.tier,
      at: entry.at,
    }));
  const aura =
    progress.equipped && progress.equipped !== "none"
      ? (productById.get(progress.equipped) ?? null)
      : null;
  const petId =
    progress.activePet && progress.activePet !== "none"
      ? progress.activePet
      : null;
  const pet = petId
    ? ([...PETS, RNGWEEN_PET].find((item) => item.id === petId) ?? null)
    : null;
  return {
    bestRoll: stats.bestRoll,
    pinned,
    favoriteTier: stats.favoriteTier,
    aura: aura ? { id: aura.id, name: aura.name } : null,
    companion: pet ? { id: pet.id, name: pet.name } : null,
  };
}

function removedTotalsOf(progress) {
  return Array.isArray(progress.removedTotals) ? progress.removedTotals : [];
}

// Every entry the log has ever held: the ones still in it, and the totals of
// the ones that have left it.
export function allTimeTally(progress) {
  const history = Array.isArray(progress.history) ? progress.history : [];
  return removedTotalsOf(progress).reduce(
    (sum, tally) => (tally ? mergeTallies(sum, tally) : sum),
    tallyEntries(history),
  );
}

// One cycle's figures: its entries still in the log, and those that left it.
function cycleTally(progress, events, cycle) {
  const tally = tallyEntries(events);
  const removed = removedTotalsOf(progress)[cycle];
  return removed ? mergeTallies(tally, removed) : tally;
}

function bestRollOf(tally) {
  return tally.best ? { ...tally.best } : null;
}

// The game's dark number-box palette, so a roll on the card looks like the
// roll on screen. Values mirror src/number-box-palettes.css (dark theme).
const CARD_TIERS = {
  trash: {
    bg: ["rgba(123, 51, 6, 0.6)", "#27272a", "rgba(123, 51, 6, 0.6)"],
    border: "#973c00",
    ink: "#ffd230",
  },
  common: {
    bg: ["rgba(63, 63, 70, 0.5)", "#27272a", "rgba(63, 63, 70, 0.5)"],
    border: "#52525c",
    ink: "#d1d5dc",
  },
  uncommon: {
    bg: ["rgba(0, 79, 59, 0.6)", "#27272a", "rgba(0, 79, 59, 0.6)"],
    border: "#006045",
    ink: "#00d492",
  },
  rare: {
    bg: ["rgba(28, 57, 142, 0.6)", "#27272a", "rgba(28, 57, 142, 0.6)"],
    border: "#193cb8",
    ink: "#51a2ff",
  },
  epic: {
    bg: ["rgba(89, 22, 139, 0.6)", "#27272a", "rgba(89, 22, 139, 0.6)"],
    border: "#6e11b0",
    ink: "#c27aff",
  },
  anomaly: {
    bg: ["rgba(126, 42, 12, 0.6)", "#27272a", "rgba(126, 42, 12, 0.6)"],
    border: "#9f2d00",
    ink: "#ff8904",
  },
  mythic: {
    bg: [
      "rgba(139, 8, 54, 0.55)",
      "rgba(89, 22, 139, 0.45)",
      "rgba(16, 78, 100, 0.55)",
    ],
    border: "#a3004c",
    ink: "#f3f4f6",
  },
  godly: {
    bg: ["#fde68a", "#fffbeb", "#fde68a"],
    border: "#f59e0b",
    ink: "#78350f",
  },
  neutral: {
    bg: ["#1d1f28", "#23252f", "#1d1f28"],
    border: "#3a3d4b",
    ink: "#8d8a84",
  },
};

const MONO = '"Space Mono", monospace';
const SANS = '"Plus Jakarta Sans Variable", system-ui, sans-serif';

function formatCardEP(value = 0) {
  return Math.round(value ?? 0).toLocaleString("en-US");
}

function cardDate(at) {
  if (!at) return "";
  return new Date(at).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// The export is a read-only PNG snapshot of the account's key information,
// username and biggest roll. It exists to be looked at or shared — nothing in
// the game reads a card back, so a downloaded file can never overwrite a live
// game.
export function exportPayload(progress = {}) {
  const stats = accountStats(progress);
  return {
    app: "RNGdle Infinite",
    format: "png",
    accountName: progress.profile?.username ?? "Guest",
    biggestRoll: stats.bestRoll,
    highlights: profileHighlights(progress),
    saveVersion: progress.version ?? 1,
    appVersion: LATEST_VERSION,
    exportedAt: new Date().toISOString(),
    profile: progress.profile ?? null,
    stats,
    save: {
      balance: progress.balance ?? 0,
      totalEarned: progress.totalEarned ?? 0,
      discovered: progress.discovered ?? [],
      owned: progress.owned ?? [],
      equipped: progress.equipped ?? "none",
      pets: progress.pets ?? [],
      activePet: progress.activePet ?? "none",
      skills: progress.skills ?? [],
      equippedSkills: progress.equippedSkills ?? [],
      skillCharge: progress.skillCharge ?? {},
      flywheelCharge: progress.flywheelCharge ?? 0,
      rebirths: stats.rebirths,
      ultraRebirths: stats.ultraRebirths,
      rollbacks: stats.rollbacks,
      freshStarts: stats.freshStarts,
      goalId: progress.goalId ?? null,
      history: progress.history ?? [],
    },
  };
}

export function exportFileName(progress = {}) {
  const name = (progress.profile?.username ?? "guest")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
  const stamp = new Date().toISOString().slice(0, 10);
  return `rngdle-infinite-${name || "guest"}-${stamp}.png`;
}

// The account logo is already a data URL, so the card can carry it without
// touching the network. A picture that fails to decode simply leaves the card
// without a logo rather than failing the export.
function loadAvatar(avatar) {
  if (typeof Image === "undefined" || !avatar) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = avatar;
  });
}

// The canvas paints before the web fonts finish loading, so glyphs fall back
// to a generic sans-serif and the layout shifts. Wait for the exact faces the
// card uses — and cap the wait so a blocked font never stalls the export.
async function waitForExportFonts() {
  if (typeof document === "undefined" || !document.fonts?.ready) return;
  try {
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch {}
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A number box as the game draws it: tier gradient, tier border, the digits
// in the tier's ink. `scale` sizes the whole box; digits shrink to fit.
function drawNumberBox(ctx, roll, x, y, w, h, { label = "" } = {}) {
  const tier = CARD_TIERS[roll?.tier] ?? CARD_TIERS.neutral;
  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  tier.bg.forEach((stop, index) =>
    grad.addColorStop(index / (tier.bg.length - 1), stop),
  );
  ctx.save();
  ctx.shadowColor = tier.border;
  ctx.shadowBlur = roll ? Math.max(10, h * 0.18) : 0;
  ctx.fillStyle = grad;
  drawRoundedRect(ctx, x, y, w, h, Math.max(10, h * 0.12));
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = tier.border;
  ctx.lineWidth = Math.max(2, h * 0.03);
  drawRoundedRect(ctx, x, y, w, h, Math.max(10, h * 0.12));
  ctx.stroke();
  // A soft top highlight, like the inset shadow on screen.
  ctx.save();
  drawRoundedRect(ctx, x, y, w, h, Math.max(10, h * 0.12));
  ctx.clip();
  const sheen = ctx.createLinearGradient(x, y, x, y + h * 0.5);
  sheen.addColorStop(0, "rgba(255, 255, 255, 0.14)");
  sheen.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(x, y, w, h * 0.5);
  ctx.restore();
  const text = roll ? String(roll.number) : "??????";
  const size = Math.min(h * 0.5, (w * 0.86) / Math.max(1, text.length * 0.62));
  ctx.fillStyle = tier.ink;
  ctx.font = `700 ${Math.round(size)}px ${MONO}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + w / 2, y + h / 2 + (label ? -h * 0.04 : 0));
  if (label) {
    ctx.font = `700 ${Math.round(Math.max(10, h * 0.11))}px ${MONO}`;
    ctx.fillStyle = tier.ink;
    ctx.globalAlpha = 0.85;
    ctx.fillText(label, x + w / 2, y + h - h * 0.14);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

export const EXPORT_CARD_SIZE = { width: 1200, height: 760, scale: 2 };

export function drawExportCardToCanvas(canvas, progress = {}, logo = null) {
  const payload = exportPayload(progress);
  const { stats, accountName, biggestRoll, highlights } = payload;
  const { width, height, scale } = EXPORT_CARD_SIZE;
  // Painted at twice the layout size so the PNG stays crisp when zoomed or
  // shared; every coordinate below is in layout pixels.
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return payload;
  ctx.scale?.(scale, scale);

  // Background: deep slate with a faint tier-coloured glow behind the hero.
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#111218");
  bg.addColorStop(1, "#1a1c25");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  const heroTier = CARD_TIERS[biggestRoll?.tier] ?? CARD_TIERS.neutral;
  if (ctx.createRadialGradient) {
    const glow = ctx.createRadialGradient(880, 250, 20, 880, 250, 460);
    glow.addColorStop(0, `${heroTier.border}55`);
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }

  // Frame: gold once the account has prestiged.
  ctx.strokeStyle =
    stats.ultraRebirths > 0 || stats.rollbacks > 0 ? "#d9a441" : "#2e313d";
  ctx.lineWidth = 3;
  drawRoundedRect(ctx, 18, 18, width - 36, height - 36, 22);
  ctx.stroke();

  // Header line.
  ctx.fillStyle = "#89c4a8";
  ctx.font = `700 15px ${MONO}`;
  ctx.fillText(
    `RNGDLE ∞ INFINITE · ${String(payload.appVersion).replace(/^v?/, "v")}`,
    54,
    66,
  );
  ctx.fillStyle = "#8d8a84";
  ctx.font = `600 13px ${MONO}`;
  ctx.textAlign = "right";
  ctx.fillText(`SNAPSHOT · ${payload.exportedAt.slice(0, 10)}`, width - 54, 66);
  ctx.textAlign = "left";

  // Identity: logo, name, standing.
  const left = 54;
  let nameX = left;
  if (logo) {
    const size = 72;
    ctx.save();
    ctx.beginPath();
    ctx.arc(left + size / 2, 134, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(logo, left, 134 - size / 2, size, size);
    ctx.restore();
    ctx.strokeStyle = "#3a3d4b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(left + size / 2, 134, size / 2, 0, Math.PI * 2);
    ctx.stroke();
    nameX = left + size + 20;
  }
  ctx.fillStyle = "#eeece8";
  ctx.font = `700 46px ${SANS}`;
  ctx.fillText(accountName, nameX, 134 + 12);
  if (stats.ultraRebirths > 0 || stats.rollbacks > 0) {
    ctx.fillStyle = "#d9a441";
    ctx.font = `700 14px ${MONO}`;
    ctx.fillText(
      stats.rollbacks > 0
        ? `✦ ROLLBACK ×${stats.rollbacks}${stats.ultraRebirths > 0 ? ` · PRESTIGE ×${stats.ultraRebirths}` : ""}`
        : `✦ PRESTIGE ×${stats.ultraRebirths}`,
      nameX,
      176,
    );
  } else {
    ctx.fillStyle = "#9d9a93";
    ctx.font = `500 14px ${SANS}`;
    ctx.fillText(
      stats.rebirths > 0
        ? `Rebirth Rung #${stats.rebirths} · +${stats.rebirths * 2}% permanent EP`
        : "Original Cycle · Local Account Record",
      nameX,
      176,
    );
  }

  // Key figures: four tiles under the name.
  const tiles = [
    {
      label: "ALL-TIME EP EARNED",
      value: `${formatCardEP(stats.totalEarned)} EP`,
      sub: `Balance ${formatCardEP(stats.balance)} EP`,
    },
    {
      label: "TOTAL ROLLS",
      value: stats.rolls.toLocaleString("en-US"),
      sub: stats.favoriteTier
        ? `Most often ${stats.favoriteTier.toUpperCase()}`
        : "No rolls yet",
    },
    {
      label: "BADGES DISCOVERED",
      value: `${stats.uniqueBadges} / ${stats.badgesTotal}`,
      sub: `${Math.round((stats.uniqueBadges / Math.max(1, stats.badgesTotal)) * 100)}% of the collection`,
    },
    {
      label: prestigeShown(stats) ? "REBIRTHS & PRESTIGE" : "REBIRTHS",
      value: prestigeShown(stats)
        ? `${stats.rebirths} · ${stats.ultraRebirths}`
        : `${stats.rebirths} / 6`,
      sub: prestigeShown(stats)
        ? `${stats.ultraRebirths} Prestige${stats.rollbacks > 0 ? " · Rollback" : ""} · +${progress.surplusBanked ?? 0}% surplus`
        : `+${progress.surplusBanked ?? 0}% surplus banked`,
    },
  ];
  const tileW = 300;
  const tileH = 96;
  const tileGap = 16;
  tiles.forEach((tile, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const tx = left + col * (tileW + tileGap);
    const ty = 212 + row * (tileH + tileGap);
    ctx.fillStyle = "#181a22";
    drawRoundedRect(ctx, tx, ty, tileW, tileH, 12);
    ctx.fill();
    ctx.strokeStyle = "#292c37";
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, tx, ty, tileW, tileH, 12);
    ctx.stroke();
    ctx.fillStyle = "#8d8a84";
    ctx.font = `700 11px ${MONO}`;
    ctx.fillText(tile.label, tx + 18, ty + 27);
    ctx.fillStyle = "#eeece8";
    ctx.font = `700 24px ${MONO}`;
    ctx.fillText(tile.value, tx + 18, ty + 60);
    ctx.fillStyle = "#89c4a8";
    ctx.font = `500 12px ${SANS}`;
    ctx.fillText(tile.sub, tx + 18, ty + 82);
  });

  // Hero: the biggest roll, as a real number box.
  const heroX = 714;
  const heroY = 104;
  const heroW = 432;
  const heroH = 196;
  ctx.fillStyle = "#89c4a8";
  ctx.font = `700 13px ${MONO}`;
  ctx.fillText("BIGGEST ROLL", heroX, heroY - 14);
  drawNumberBox(ctx, biggestRoll, heroX, heroY, heroW, heroH);
  if (biggestRoll) {
    ctx.fillStyle = heroTier.ink === "#78350f" ? "#f59e0b" : heroTier.ink;
    ctx.font = `700 17px ${MONO}`;
    ctx.fillText(
      `${biggestRoll.tier.toUpperCase()} TIER · +${formatCardEP(biggestRoll.ep)} EP`,
      heroX,
      heroY + heroH + 30,
    );
    ctx.fillStyle = "#8d8a84";
    ctx.font = `500 12px ${SANS}`;
    ctx.fillText(cardDate(biggestRoll.at), heroX, heroY + heroH + 52);
  } else {
    ctx.fillStyle = "#8d8a84";
    ctx.font = `700 16px ${MONO}`;
    ctx.fillText("No rolls recorded yet", heroX, heroY + heroH + 30);
  }

  // Pinned rolls: the bookmarks, as small boxes.
  const pinY = 452;
  ctx.fillStyle = "#89c4a8";
  ctx.font = `700 13px ${MONO}`;
  ctx.fillText("PINNED ROLLS", left, pinY);
  if (highlights.pinned.length) {
    // Up to ten boxes in two rows of five, the same width as the tiles above.
    const perRow = 5;
    const gap = 12;
    const boxW = (2 * tileW + tileGap - gap * (perRow - 1)) / perRow;
    const boxH = 74;
    highlights.pinned.slice(0, BOOKMARK_LIMIT).forEach((roll, index) => {
      const px = left + (index % perRow) * (boxW + gap);
      const py = pinY + 14 + Math.floor(index / perRow) * (boxH + gap);
      drawNumberBox(ctx, roll, px, py, boxW, boxH, {
        label: `+${formatCardEP(roll.ep)} EP`,
      });
    });
  } else {
    ctx.fillStyle = "#6e6b65";
    ctx.font = `500 13px ${SANS}`;
    ctx.fillText(
      `Nothing pinned yet. Bookmark up to ${BOOKMARK_LIMIT} rolls in History.`,
      left,
      pinY + 40,
    );
  }

  // Wearing: aura and companion, bottom right.
  ctx.fillStyle = "#89c4a8";
  ctx.font = `700 13px ${MONO}`;
  ctx.fillText("WEARING", heroX, pinY);
  ctx.fillStyle = "#eeece8";
  ctx.font = `600 18px ${SANS}`;
  ctx.fillText(
    highlights.aura?.name ?? "Original appearance",
    heroX,
    pinY + 40,
  );
  ctx.fillStyle = "#9d9a93";
  ctx.font = `500 13px ${SANS}`;
  ctx.fillText(
    highlights.companion
      ? `with ${highlights.companion.name} · ${stats.companions} companion${stats.companions === 1 ? "" : "s"}`
      : stats.companions
        ? `${stats.companions} companion${stats.companions === 1 ? "" : "s"}, none active`
        : "No companion yet",
    heroX,
    pinY + 64,
  );

  // Footer
  ctx.fillStyle = "#6e6b65";
  ctx.font = `500 12px ${MONO}`;
  ctx.fillText("RNGdle Infinite · Read-only PNG account card", 54, height - 34);
  ctx.textAlign = "right";
  ctx.fillText(
    "jaime-gaming.github.io/RNGdle-Infinite",
    width - 54,
    height - 34,
  );
  ctx.textAlign = "left";

  return payload;
}

export async function renderExportPngBlob(progress = {}) {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    // Wait for the web fonts the card paints with, so the layout matches
    // what the player sees on screen. The logo loads in parallel.
    const [logo] = await Promise.all([
      loadAvatar(progress.profile?.avatar),
      waitForExportFonts(),
    ]);
    drawExportCardToCanvas(canvas, progress, logo);
    if (typeof canvas.toBlob === "function") {
      const blob = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png"),
      );
      if (blob) return blob;
    }
    if (typeof canvas.toDataURL === "function") {
      const dataUrl = canvas.toDataURL("image/png");
      const base64 = dataUrl.split(",")[1] ?? "";
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: "image/png" });
    }
  }
  const pngHeader = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  return new Blob([pngHeader], { type: "image/png" });
}
