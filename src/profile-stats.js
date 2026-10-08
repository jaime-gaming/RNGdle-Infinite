import { BADGE_TOTAL, cycleEarnedEp, discoveredCount } from "./rebirth.js";
import { PETS } from "./pets.js";
import { SKILLS, skillSlots } from "./skills.js";
import { LATEST_VERSION } from "./changelog.js";
import { isCycleMarker } from "./history-log.js";
import { favoriteTier, mergeTallies, tallyEntries } from "./history-tally.js";

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
    companionsTotal: PETS.length,
    skills: (progress.skills ?? []).length,
    skillsTotal: SKILLS.length,
    skillSlots: skillSlots(progress.owned),
    skillsUsed: total.skills,
    boostsUsed: total.boosts,
    rebirths: progress.rebirths ?? 0,
    ultraRebirths: progress.ultraRebirths ?? 0,
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

function removedTotalsOf(progress) {
  return Array.isArray(progress.removedTotals) ? progress.removedTotals : [];
}

// Every entry the log has ever held: the ones still in it, and the totals of
// the ones that have left it.
function allTimeTally(progress) {
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

const TIER_COLORS = {
  trash: "#8a8680",
  common: "#5a9a78",
  uncommon: "#4f9d69",
  rare: "#3b82f6",
  epic: "#a855f7",
  anomaly: "#ec4899",
  mythic: "#f59e0b",
  godly: "#eab308",
};

function formatCardEP(value = 0) {
  return Math.round(value ?? 0).toLocaleString("en-US");
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

export function drawExportCardToCanvas(canvas, progress = {}, logo = null) {
  const payload = exportPayload(progress);
  const { stats, accountName, biggestRoll } = payload;
  const width = 1200;
  const height = 680;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return payload;

  // Card background
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, "#14151b");
  bgGrad.addColorStop(1, "#1c1e27");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Outer frame
  ctx.strokeStyle = stats.ultraRebirths > 0 ? "#d9a441" : "#2e313d";
  ctx.lineWidth = 3;
  drawRoundedRect(ctx, 18, 18, width - 36, height - 36, 20);
  ctx.stroke();

  // Header brand + version
  ctx.fillStyle = "#89c4a8";
  ctx.font = '700 15px "Space Mono", monospace';
  ctx.fillText(`RNGDLE ∞ INFINITE · v${payload.appVersion}`, 54, 68);

  const dateText = payload.exportedAt.slice(0, 10);
  ctx.fillStyle = "#8d8a84";
  ctx.font = '600 14px "Space Mono", monospace';
  ctx.textAlign = "right";
  ctx.fillText(`SNAPSHOT · ${dateText}`, width - 54, 68);
  ctx.textAlign = "left";

  // Account Name, with the account's own logo beside it when it has one.
  let nameX = 54;
  if (logo) {
    const size = 54;
    ctx.save();
    ctx.beginPath();
    ctx.arc(54 + size / 2, 108, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(logo, 54, 108 - size / 2, size, size);
    ctx.restore();
    ctx.strokeStyle = "#3a3d4b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(54 + size / 2, 108, size / 2, 0, Math.PI * 2);
    ctx.stroke();
    nameX = 54 + size + 18;
  }
  ctx.fillStyle = "#eeece8";
  ctx.font = '700 44px "Plus Jakarta Sans Variable", system-ui, sans-serif';
  ctx.fillText(accountName, nameX, 126);

  if (stats.ultraRebirths > 0) {
    ctx.fillStyle = "#d9a441";
    ctx.font = '700 14px "Space Mono", monospace';
    ctx.fillText(`✦ TRANSCENDENT (ULTRA ×${stats.ultraRebirths})`, 54, 154);
  } else {
    ctx.fillStyle = "#9d9a93";
    ctx.font = '500 14px "Plus Jakarta Sans Variable", system-ui, sans-serif';
    ctx.fillText(
      stats.rebirths > 0
        ? `Rebirth Rung #${stats.rebirths} · +${stats.rebirths * 2}% permanent EP`
        : "Original Cycle · Local Account Record",
      54,
      154,
    );
  }

  // Hero spotlight: the biggest roll of the account.
  const heroX = 54;
  const heroY = 182;
  const heroW = width - 108;
  const heroH = 176;
  ctx.fillStyle = "#191b23";
  drawRoundedRect(ctx, heroX, heroY, heroW, heroH, 16);
  ctx.fill();
  const tierColor = biggestRoll
    ? (TIER_COLORS[biggestRoll.tier] ?? "#89c4a8")
    : "#3c3f4e";
  ctx.strokeStyle = tierColor;
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, heroX, heroY, heroW, heroH, 16);
  ctx.stroke();

  ctx.fillStyle = "#89c4a8";
  ctx.font = '700 13px "Space Mono", monospace';
  ctx.fillText("BIGGEST ROLL", heroX + 28, heroY + 38);

  if (biggestRoll) {
    ctx.fillStyle = "#eeece8";
    ctx.font = '700 54px "Space Mono", monospace';
    ctx.fillText(
      biggestRoll.number.toLocaleString("en-US"),
      heroX + 28,
      heroY + 106,
    );

    ctx.fillStyle = tierColor;
    ctx.font = '700 18px "Space Mono", monospace';
    ctx.fillText(
      `${biggestRoll.tier.toUpperCase()} TIER · +${formatCardEP(biggestRoll.ep)} EP`,
      heroX + 28,
      heroY + 144,
    );
  } else {
    ctx.fillStyle = "#8d8a84";
    ctx.font = '700 36px "Space Mono", monospace';
    ctx.fillText("No rolls recorded yet", heroX + 28, heroY + 106);
  }

  // Key Account Stats Grid (6 cards: 3 columns × 2 rows)
  const cards = [
    {
      label: "ALL-TIME EP EARNED",
      value: `${formatCardEP(stats.totalEarned)} EP`,
      sub: `Balance: ${formatCardEP(stats.balance)} EP`,
    },
    {
      label: "TOTAL ROLLS",
      value: stats.rolls.toLocaleString("en-US"),
      sub: `${stats.onlineRolls.toLocaleString("en-US")} live · ${stats.offlineRolls.toLocaleString("en-US")} offline`,
    },
    {
      label: "BADGES DISCOVERED",
      value: `${stats.uniqueBadges} / ${stats.badgesTotal}`,
      sub: `${Math.round((stats.uniqueBadges / Math.max(1, stats.badgesTotal)) * 100)}% of collection`,
    },
    {
      label: "REBIRTHS & PRESTIGE",
      value: `${stats.rebirths} / 6`,
      sub: `${stats.ultraRebirths} Ultra · +${progress.surplusBanked ?? 0}% surplus`,
    },
    {
      label: "COMPANIONS",
      value: `${stats.companions} / ${stats.companionsTotal}`,
      sub: `${stats.companionsFound} discovered all-time`,
    },
    {
      label: "SKILLS UNLOCKED",
      value: `${stats.skills} / ${stats.skillsTotal}`,
      sub: `${stats.skillSlots} slots · ${stats.skillsUsed} fired`,
    },
  ];

  const cols = 3;
  const gap = 18;
  const cardW = (heroW - gap * (cols - 1)) / cols;
  const cardH = 104;
  const gridStartY = 382;

  cards.forEach((card, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const cx = heroX + col * (cardW + gap);
    const cy = gridStartY + row * (cardH + gap);

    ctx.fillStyle = "#181a22";
    drawRoundedRect(ctx, cx, cy, cardW, cardH, 12);
    ctx.fill();
    ctx.strokeStyle = "#292c37";
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, cx, cy, cardW, cardH, 12);
    ctx.stroke();

    ctx.fillStyle = "#8d8a84";
    ctx.font = '700 11px "Space Mono", monospace';
    ctx.fillText(card.label, cx + 18, cy + 28);

    ctx.fillStyle = "#eeece8";
    ctx.font = '700 26px "Space Mono", monospace';
    ctx.fillText(card.value, cx + 18, cy + 64);

    ctx.fillStyle = "#89c4a8";
    ctx.font = '500 12px "Plus Jakarta Sans Variable", system-ui, sans-serif';
    ctx.fillText(card.sub, cx + 18, cy + 88);
  });

  // Footer
  ctx.fillStyle = "#6e6b65";
  ctx.font = '500 12px "Space Mono", monospace';
  ctx.fillText("RNGdle Infinite · Read-only PNG account card", 54, height - 34);

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
