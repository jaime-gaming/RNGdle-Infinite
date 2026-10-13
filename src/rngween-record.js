// Your RNGween in numbers: what the event has given you so far, read from the
// save and the activity log the same way the profile reads its record. It
// feeds the "Record" tab of the World and the PNG card that tab can save.
// Nothing here is stored twice and nothing reads a card back.
import { RNGWEEN_AURAS, RNGWEEN_WORLD_SKIN } from "./rngween.js";
import {
  WORLD_ZONES,
  WORLD_VALLEY_TARGET,
  rngweenValleyUnlocked,
  worldState,
} from "./rngween-world-zones.js";
import {
  WORLD_BADGES,
  emptyWorldMini,
  worldMiniSummary,
} from "./rngween-world-badges.js";

// Pumpkoins arrive from commissions, missions and the EP exchange, and leave
// through the two shops and the key. Both totals come from the log.
const EARNING = new Set([
  "rngween-hourly",
  "rngween-mission",
  "rngween-exchange",
]);
const SPENDING = new Set([
  "rngween-purchase",
  "rngween-world-purchase",
  "rngween-forged-key",
]);

export function rngweenRecord(progress = {}, now = new Date()) {
  const limited = progress.rngweenLimited ?? null;
  const world = worldState(limited);
  const mini = world.mini ?? emptyWorldMini();
  const history = Array.isArray(progress.history) ? progress.history : [];
  let earned = 0;
  let spent = 0;
  let commissions = 0;
  for (const entry of history) {
    const amount = Number(entry?.pumpkoins) || 0;
    if (EARNING.has(entry?.type)) earned += amount;
    if (SPENDING.has(entry?.type)) spent += amount;
    if (entry?.type === "rngween-hourly") commissions += 1;
  }
  const zones = WORLD_ZONES.map((zone) => {
    const summary = worldMiniSummary(zone.id, mini[zone.id]);
    return {
      id: zone.id,
      name: zone.name,
      accent: zone.accent,
      rolls: summary.rolls,
      badges: summary.unique,
      badgesTotal: summary.total,
      points: summary.score,
    };
  });
  const ownedIds = new Set([
    ...(progress.owned ?? []),
    ...(limited?.auras ?? []),
  ]);
  const auras = RNGWEEN_AURAS.filter((aura) => ownedIds.has(aura.id)).map(
    (aura) => aura.name,
  );
  const hexbound =
    limited?.skinEarned === true || ownedIds.has(RNGWEEN_WORLD_SKIN.id);
  const valleyBest = mini.valley?.best ?? null;
  return {
    name: progress.profile?.username ?? "Guest",
    at: now.toISOString(),
    pumpkoins: limited?.pumpkoins ?? 0,
    earned,
    spent,
    commissions,
    rolls: zones.reduce((sum, zone) => sum + zone.rolls, 0),
    badges: zones.reduce((sum, zone) => sum + zone.badges, 0),
    badgesTotal: Object.values(WORLD_BADGES).reduce(
      (sum, list) => sum + list.length,
      0,
    ),
    points: zones.reduce((sum, zone) => sum + zone.points, 0),
    zones,
    fragments: {
      graveyard: world.fragments?.graveyard === true,
      "haunted-house": world.fragments?.["haunted-house"] === true,
    },
    key: rngweenValleyUnlocked(limited),
    valleyBest,
    jackpot: hexbound || valleyBest?.number === WORLD_VALLEY_TARGET,
    hexbound,
    auras,
    aurasTotal: RNGWEEN_AURAS.length,
  };
}

export function rngweenRecordFileName(record) {
  const name = String(record?.name ?? "guest")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `rngween-2026-${name || "guest"}-${String(record?.at ?? "").slice(0, 10)}.png`;
}

// ---------- The PNG card ----------
// Social-image size, painted on a 2× canvas so it stays sharp when shared.
export const RNGWEEN_CARD_SIZE = { width: 1200, height: 630, scale: 2 };
const MONO = '"Space Mono", monospace';
const SANS = '"Plus Jakarta Sans Variable", system-ui, sans-serif';
const INK = "#f5ecff";
const DIM = "#b9a7d1";
const ORANGE = "#fb923c";
const VIOLET = "#a78bfa";
const LINE = "rgba(167, 139, 250, 0.22)";

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function label(
  ctx,
  text,
  x,
  y,
  { size = 13, color = DIM, align = "left" } = {},
) {
  ctx.font = `700 ${size}px ${MONO}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(text.toUpperCase(), x, y);
  ctx.textAlign = "left";
}

function figure(
  ctx,
  text,
  x,
  y,
  { size = 40, color = INK, align = "left" } = {},
) {
  ctx.font = `700 ${size}px ${MONO}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  ctx.textAlign = "left";
}

export function drawRngweenCardToCanvas(canvas, record) {
  const { width, height, scale } = RNGWEEN_CARD_SIZE;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  // Night sky: deep violet with an orange glow low on the right, like the
  // World page itself.
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#160f22");
  sky.addColorStop(1, "#0d0912");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(980, 560, 20, 980, 560, 520);
  glow.addColorStop(0, "rgba(251, 146, 60, 0.28)");
  glow.addColorStop(1, "rgba(251, 146, 60, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  const haze = ctx.createRadialGradient(180, 80, 10, 180, 80, 460);
  haze.addColorStop(0, "rgba(167, 139, 250, 0.22)");
  haze.addColorStop(1, "rgba(167, 139, 250, 0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, width, height);
  // A few still stars.
  ctx.fillStyle = "rgba(245, 236, 255, 0.55)";
  for (let i = 0; i < 46; i += 1) {
    const x = (i * 263 + 97) % width;
    const y = (i * 151 + 41) % 300;
    ctx.fillRect(x, y, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
  }
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  rounded(ctx, 24, 24, width - 48, height - 48, 22);
  ctx.stroke();

  // Header.
  label(ctx, "RNGween 2026 · The Reaper's World", 56, 70, { color: ORANGE });
  ctx.font = `800 44px ${SANS}`;
  ctx.fillStyle = INK;
  ctx.fillText(record.name, 56, 118);
  ctx.font = `500 16px ${SANS}`;
  ctx.fillStyle = DIM;
  ctx.fillText(
    `Event record · ${record.at.slice(0, 10)} · Oct 21–Nov 3, 2026 (UTC)`,
    56,
    146,
  );
  label(ctx, "RNGdle ∞ Infinite", width - 56, 70, { align: "right" });

  // Four headline figures.
  const cards = [
    [
      "Pumpkoins",
      record.pumpkoins.toLocaleString("en-US"),
      `${record.earned.toLocaleString("en-US")} earned`,
    ],
    [
      "World rolls",
      record.rolls.toLocaleString("en-US"),
      `${record.points.toLocaleString("en-US")} points`,
    ],
    [
      "Event badges",
      `${record.badges} / ${record.badgesTotal}`,
      `${record.commissions} commissions`,
    ],
    [
      "Halloween auras",
      `${record.auras.length} / ${record.aurasTotal}`,
      record.hexbound ? "Hexbound unlocked" : "Hexbound: roll 6666",
    ],
  ];
  const gap = 16;
  const cardW = (width - 112 - gap * 3) / 4;
  cards.forEach(([title, big, small], index) => {
    const x = 56 + index * (cardW + gap);
    const y = 178;
    ctx.fillStyle = "rgba(255, 255, 255, 0.045)";
    rounded(ctx, x, y, cardW, 124, 16);
    ctx.fill();
    ctx.strokeStyle = LINE;
    ctx.stroke();
    label(ctx, title, x + 20, y + 32, { size: 12 });
    figure(ctx, big, x + 20, y + 78, {
      size: 34,
      color: index === 0 ? ORANGE : INK,
    });
    ctx.font = `500 13px ${SANS}`;
    ctx.fillStyle = DIM;
    ctx.fillText(small, x + 20, y + 104);
  });

  // The four zones, left; key, fragments and auras, right.
  label(ctx, "Zones", 56, 352);
  record.zones.forEach((zone, index) => {
    const y = 380 + index * 46;
    ctx.fillStyle = zone.accent;
    ctx.beginPath();
    ctx.arc(64, y - 6, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `600 17px ${SANS}`;
    ctx.fillStyle = INK;
    ctx.fillText(zone.name, 84, y);
    ctx.font = `500 15px ${SANS}`;
    ctx.fillStyle = DIM;
    ctx.textAlign = "right";
    ctx.fillText(
      `${zone.rolls} rolls · ${zone.badges}/${zone.badgesTotal} badges · ${zone.points} pts`,
      600,
      y,
    );
    ctx.textAlign = "left";
    ctx.strokeStyle = LINE;
    ctx.beginPath();
    ctx.moveTo(56, y + 14);
    ctx.lineTo(600, y + 14);
    ctx.stroke();
  });

  const rx = 660;
  label(ctx, "The Valley key", rx, 352);
  const pieces = [
    ["Graveyard fragment", record.fragments.graveyard],
    ["Haunted House fragment", record.fragments["haunted-house"]],
    ["Key forged", record.key],
    ["6666 in the Valley", record.jackpot],
  ];
  pieces.forEach(([text, done], index) => {
    const y = 380 + index * 34;
    ctx.strokeStyle = done ? ORANGE : LINE;
    ctx.fillStyle = done ? "rgba(251, 146, 60, 0.22)" : "transparent";
    rounded(ctx, rx, y - 16, 20, 20, 6);
    ctx.fill();
    ctx.stroke();
    if (done) {
      ctx.strokeStyle = ORANGE;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(rx + 5, y - 6);
      ctx.lineTo(rx + 9, y - 2);
      ctx.lineTo(rx + 16, y - 11);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    ctx.font = `600 16px ${SANS}`;
    ctx.fillStyle = done ? INK : DIM;
    ctx.fillText(text, rx + 32, y);
  });

  label(ctx, "Auras collected", rx, 524);
  ctx.font = `600 16px ${SANS}`;
  ctx.fillStyle = record.auras.length ? VIOLET : DIM;
  const list = [...record.auras, ...(record.hexbound ? ["Hexbound"] : [])];
  ctx.fillText(
    list.length ? list.join(" · ") : "None yet",
    rx,
    552,
    width - rx - 56,
  );

  ctx.font = `500 13px ${SANS}`;
  ctx.fillStyle = DIM;
  ctx.fillText(
    "World rolls pay event points and badges, never EP. Owned auras and Hexbound stay forever.",
    56,
    580,
  );
  return canvas;
}

async function waitForFonts() {
  if (typeof document === "undefined" || !document.fonts?.ready) return;
  try {
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch {}
}

export async function renderRngweenCardBlob(record) {
  const canvas = document.createElement("canvas");
  await waitForFonts();
  drawRngweenCardToCanvas(canvas, record);
  const blob = await new Promise((resolve) =>
    canvas.toBlob((value) => resolve(value), "image/png"),
  );
  if (blob) return blob;
  const dataUrl = canvas.toDataURL("image/png");
  const bin = atob(dataUrl.split(",")[1] ?? "");
  return new Blob([Uint8Array.from(bin, (char) => char.charCodeAt(0))], {
    type: "image/png",
  });
}
