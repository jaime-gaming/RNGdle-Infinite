import { allBadgeMetadata as metadata } from "./infinite-badges.js";
import {
  productById,
  offlineSettings,
  ROLL_DURATIONS,
  COOLDOWN_DURATIONS,
  rollSettings,
} from "./shop-data.js";
import {
  FLYWHEEL_CHARGES,
  flywheelAfterSettlement,
  flywheelRequired,
} from "./flywheel.js";
import { validGoal } from "./gameplay-loop.js";
import {
  rebirthBlocker,
  ultraRebirthBlocker,
  nextRebirthSkill,
  ultraRebirthMultiplier,
} from "./rebirth.js";
import { petById, PET_IDS, petMultiplier } from "./pets.js";
import {
  chargeAfterSettlement,
  drawPlanFor,
  parseEquippedSkills,
  parseSkillCharge,
  parseUnlockedSkills,
  skillById,
  skillChargeFactor,
  skillForPet,
  skillSlots,
  skillUnlocked,
  skillWaivesCooldown,
  skillWalletMultiplier,
  validSkillCharge,
  SKILL_MAX_DRAWS,
} from "./skills.js";
import { parseCooldownWindow } from "./cooldown.js";
import { parseOffline } from "./offline.js";
export const PROGRESS_KEY = "rng-infinite-progress-v1";
const badgeIds = new Set(metadata.map((b) => b.id));
const validAmount = (n) => Number.isSafeInteger(n) && n >= 0;

// The wallet multiplier of a settled roll: companions, ultra-rebirth bonus and
// any wallet skill that fired. It only ever scales the EP that reaches the
// wallet — the scored roll, its tier and its rank never move.
export function walletMultiplier(
  progress,
  skillIds = progress.pendingRoll?.skills,
) {
  return (
    petMultiplier(progress.activePet) *
    ultraRebirthMultiplier(progress.ultraRebirths ?? 0) *
    skillWalletMultiplier(skillIds ?? [])
  );
}

// The skills a settled roll actually fired. Only a committed, online roll can
// activate one, so an offline batch or a duplicate receipt activates nothing.
function firedSkills(state, id, source) {
  if (source === "offline" || state.pendingRoll?.id !== id) return [];
  return (state.pendingRoll.skills ?? []).filter((skillId) =>
    skillById.has(skillId),
  );
}

// Equipping is free. A newly unlocked skill takes a free slot instead of
// silently doing nothing; a full rack is left exactly as the player set it.
function autoEquip(equipped, progress, id) {
  const list = [...new Set(equipped)].filter((skillId) =>
    skillUnlocked(skillId, progress),
  );
  if (!id || !skillById.has(id) || list.includes(id)) return list;
  if (list.length >= skillSlots(progress.owned ?? [])) return list;
  return [...list, id];
}

export function emptyProgress() {
  return {
    version: 1,
    profile: null,
    balance: 0,
    totalEarned: 0,
    discovered: [],
    owned: [],
    equipped: "none",
    cooldownUntil: 0,
    receipts: [],
    history: [],
    pendingRoll: null,
    offline: null,
    flywheelCharge: 0,
    goalId: null,
    rebirths: 0,
    ultraRebirths: 0,
    cooldownWindow: null,
    pets: [],
    activePet: "none",
    skills: [],
    equippedSkills: [],
    skillCharge: {},
  };
}
export function parseProgress(raw) {
  if (raw === null) return emptyProgress();
  const p = JSON.parse(raw);
  if (!p || p.version !== 1) throw new Error("Unrecognized save version");
  if (
    !validAmount(p.balance) ||
    !validAmount(p.totalEarned) ||
    p.balance > p.totalEarned ||
    !validAmount(p.cooldownUntil)
  )
    throw new Error("Invalid save values");
  if (
    !Array.isArray(p.discovered) ||
    !Array.isArray(p.owned) ||
    !Array.isArray(p.receipts)
  )
    throw new Error("Invalid save collections");
  let owned = [...new Set(p.owned.filter((id) => productById.has(id)))];
  // Prune to a fixed point: late-game chains can be deeper than three levels.
  let priorLength;
  do {
    priorLength = owned.length;
    owned = owned.filter(
      (id) =>
        !productById.get(id).requires ||
        owned.includes(productById.get(id).requires),
    );
  } while (owned.length !== priorLength);
  if (
    owned.includes("flywheel") &&
    p.flywheelCharge != null &&
    (!validAmount(p.flywheelCharge) || p.flywheelCharge > FLYWHEEL_CHARGES)
  )
    throw new Error("Invalid Flywheel charge");
  if (p.rebirths != null && !validAmount(p.rebirths))
    throw new Error("Invalid rebirth count");
  if (p.ultraRebirths != null && !validAmount(p.ultraRebirths))
    throw new Error("Invalid ultra-rebirth count");
  if (!validSkillCharge(p.skillCharge)) throw new Error("Invalid skill charge");
  if (p.pets != null && !Array.isArray(p.pets))
    throw new Error("Invalid pet collection");
  if (p.skills != null && !Array.isArray(p.skills))
    throw new Error("Invalid skill collection");
  const pets = [
    ...new Set((p.pets ?? []).filter((id) => petById.has(id))),
  ].sort((a, b) => PET_IDS.indexOf(a) - PET_IDS.indexOf(b));
  // Only an owned pet can be active; anything else falls back to no pet.
  const activePet = pets.includes(p.activePet) ? p.activePet : "none";
  const skills = parseUnlockedSkills(p.skills, { owned });
  const equippedSkills = parseEquippedSkills(p.equippedSkills, {
    owned,
    skills,
    pets,
    activePet,
  });
  const pendingRoll = parsePending(p.pendingRoll, owned);
  let profile = null;
  if (p.profile != null) {
    if (
      typeof p.profile.id !== "string" ||
      !p.profile.id ||
      !validUsername(p.profile.username) ||
      !validAmount(p.profile.createdAt)
    )
      throw new Error("Invalid local profile");
    profile = {
      id: p.profile.id,
      username: p.profile.username,
      createdAt: p.profile.createdAt,
    };
  }
  // A committed roll already states when it ends. Trusting a separately stored
  // cooldownUntil let an edited save keep its number while truncating (or
  // zeroing) the deadline, cancelling the wait entirely. The deadline can only
  // ever be extended by the roll in flight, never shortened by one.
  const cooldownUntil = pendingRoll
    ? Math.max(
        p.cooldownUntil,
        pendingRoll.startedAt + pendingRoll.rollMS + pendingRoll.cooldownMS,
      )
    : p.cooldownUntil;
  if (!validAmount(cooldownUntil)) throw new Error("Invalid save values");
  return {
    version: 1,
    history: parseHistory(p.history),
    pendingRoll,
    cooldownWindow: parseCooldownWindow(
      p.cooldownWindow,
      cooldownUntil,
      pendingRoll,
    ),
    rebirths: p.rebirths ?? 0,
    ultraRebirths: p.ultraRebirths ?? 0,
    offline: parseOffline(p.offline, owned),
    flywheelCharge: owned.includes("flywheel")
      ? Math.min(p.flywheelCharge ?? 0, flywheelRequired(owned))
      : 0,
    profile,
    goalId: validGoal(p.goalId, owned) ? p.goalId : null,
    balance: p.balance,
    totalEarned: p.totalEarned,
    discovered: [...new Set(p.discovered.filter((id) => badgeIds.has(id)))],
    owned,
    equipped:
      owned.includes(p.equipped) && productById.get(p.equipped)?.kind === "aura"
        ? p.equipped
        : "none",
    pets: pets,
    activePet,
    skills,
    equippedSkills,
    skillCharge: parseSkillCharge(p.skillCharge),
    cooldownUntil,
    receipts: [
      ...new Set(
        p.receipts.filter((id) => typeof id === "string" && id.length <= 100),
      ),
    ].slice(-128),
  };
}
export function validUsername(value) {
  return typeof value === "string" && /^[\p{L}\p{N}_-]{3,20}$/u.test(value);
}
export function applyProgress(state, action) {
  if (action.type === "rebirth") {
    const count = state.rebirths ?? 0;
    if (action.expectedRebirths !== count)
      throw new Error(
        "This rebirth belongs to an older cycle. Reload and try again.",
      );
    const now = action.at ?? Math.ceil(Date.now());
    if (!validAmount(now) || now > 8640000000000000)
      throw new Error("Invalid rebirth time");
    const blocked = rebirthBlocker(state, now);
    if (blocked) throw new Error(blocked);
    if (!validAmount(count + 1))
      throw new Error("Rebirth count limit reached.");
    const granted = nextRebirthSkill(count);
    // Everything you earned stays: EP, upgrades, companions and skills. What
    // restarts is the collection itself, together with the aura wardrobe —
    // the cosmetic price of a new cycle.
    const owned = state.owned.filter(
      (id) => productById.get(id)?.kind !== "aura",
    );
    const skills = granted
      ? [...new Set([...(state.skills ?? []), granted.id])]
      : [...(state.skills ?? [])];
    const equippedSkills = autoEquip(
      state.equippedSkills ?? [],
      { ...state, owned, skills },
      granted?.id,
    );
    return {
      ...state,
      profile: state.profile,
      rebirths: count + 1,
      discovered: [],
      owned,
      equipped: "none",
      goalId: null,
      skills,
      equippedSkills,
      pendingRoll: null,
      cooldownUntil: 0,
      cooldownWindow: null,
      receipts: [],
      // Offline earnings are a tool, so the tool stays; the absence it had
      // already banked belongs to the cycle that just ended.
      offline: state.offline
        ? { lastSeenAt: now, batch: null, report: null }
        : null,
      history: [
        {
          id: action.eventId ?? `rebirth:${count + 1}`,
          type: "rebirth",
          at: now,
          count: count + 1,
          ...(granted ? { skill: granted.id } : {}),
        },
      ],
    };
  }
  if (action.type === "ultra-rebirth") {
    const count = state.ultraRebirths ?? 0;
    if (action.expectedUltraRebirths !== count)
      throw new Error(
        "This ultra-rebirth belongs to an older cycle. Reload and try again.",
      );
    const now = action.at ?? Math.ceil(Date.now());
    if (!validAmount(now) || now > 8640000000000000)
      throw new Error("Invalid ultra-rebirth time");
    const blocked = ultraRebirthBlocker(state, now);
    if (blocked) throw new Error(blocked);
    if (!validAmount(count + 1))
      throw new Error("Ultra-rebirth limit reached.");
    // The full reset: everything the ladder kept is handed back for a fresh
    // run, and the permanent wallet bonus grows by ten points.
    return {
      ...emptyProgress(),
      profile: state.profile,
      ultraRebirths: count + 1,
      history: [
        {
          id: action.eventId ?? `ultra:${count + 1}`,
          type: "ultra-rebirth",
          at: now,
          count: count + 1,
        },
      ],
    };
  }
  if (action.type === "goal") {
    if (action.id !== null && !validGoal(action.id, state.owned))
      throw new Error(
        "Choose an unowned item with its prerequisites unlocked.",
      );
    return state.goalId === action.id ? state : { ...state, goalId: action.id };
  }
  if (action.type === "register") {
    if (state.profile)
      throw new Error("A local profile already exists on this browser.");
    const username =
      typeof action.username === "string"
        ? action.username.trim().normalize("NFKC")
        : "";
    if (!validUsername(username))
      throw new Error("Use 3–20 letters, numbers, underscores, or hyphens.");
    if (
      typeof action.id !== "string" ||
      !action.id ||
      !validAmount(action.createdAt)
    )
      throw new Error("Invalid profile");
    // Guest play is a demo, not a save file. Signing up starts a genuinely
    // fresh account: nothing rolled, earned, discovered or bought beforehand
    // carries over, so an account's history always matches what it did. The one
    // exception is the tracked goal — a preference, like the theme, not a
    // reward — which survives so the player keeps the target they picked.
    return {
      ...emptyProgress(),
      goalId: state.goalId ?? null,
      profile: { id: action.id, username, createdAt: action.createdAt },
    };
  }
  if (action.type === "complete") {
    const { result, id, cooldownUntil } = action;
    if (
      typeof id !== "string" ||
      !id ||
      !validAmount(result?.totalEP) ||
      !validAmount(result?.number) ||
      result.number > 1000000 ||
      !Array.isArray(result?.badges) ||
      ![
        "trash",
        "common",
        "uncommon",
        "rare",
        "epic",
        "anomaly",
        "mythic",
        "godly",
      ].includes(result?.tier) ||
      !validAmount(cooldownUntil)
    )
      throw new Error("Invalid roll");
    if (
      state.receipts.includes(id) ||
      state.history?.some((e) => e.id === id && e.type === "roll")
    )
      return state;
    // Companions, ultra-rebirth bonuses and wallet skills multiply only banked
    // EP. result.totalEP — the scored value shown, ranked and recorded — is
    // never modified.
    const fired = firedSkills(state, id, action.source);
    const petFactor = petMultiplier(state.activePet);
    const multiplier =
      petFactor *
      ultraRebirthMultiplier(state.ultraRebirths ?? 0) *
      skillWalletMultiplier(fired);
    const credited =
      multiplier === 1
        ? result.totalEP
        : Math.round(result.totalEP * multiplier);
    const bonus = credited - result.totalEP;
    const petBonus =
      petFactor === 1
        ? 0
        : Math.round(result.totalEP * petFactor) - result.totalEP;
    const balance = state.balance + credited,
      totalEarned = state.totalEarned + credited;
    if (!validAmount(balance) || !validAmount(totalEarned))
      throw new Error("EP balance limit reached.");
    const earned = [
      ...new Set(
        result.badges.map((b) => b.id).filter((id) => badgeIds.has(id)),
      ),
    ];
    const unlocked = earned.filter((id) => !state.discovered.includes(id));
    const at = action.at ?? Math.ceil(Date.now());
    const events = [
      {
        id,
        type: "roll",
        at,
        number: result.number,
        tier: result.tier,
        ep: result.totalEP,
        ...(petBonus ? { petBonus, pet: state.activePet } : {}),
        ...(bonus && bonus !== petBonus
          ? { walletBonus: bonus, walletMultiplier: multiplier }
          : {}),
        ...(fired.length ? { skills: fired } : {}),
        badges: earned,
        ...(action.source === "offline" ? { source: "offline" } : {}),
        ...(action.source !== "offline" &&
        state.pendingRoll?.id === id &&
        state.pendingRoll.flywheel
          ? { flywheel: state.pendingRoll.flywheel }
          : {}),
      },
    ];
    const droppedPet =
      typeof action.petDrop === "string" &&
      petById.has(action.petDrop) &&
      !(state.pets ?? []).includes(action.petDrop)
        ? action.petDrop
        : null;
    if (droppedPet)
      events.push({
        id: `${id}:pet`,
        type: "pet",
        at,
        productId: droppedPet,
        name: petById.get(droppedPet).name,
      });
    if (unlocked.length)
      events.push({
        id: `${id}:unlock`,
        type: "unlock",
        at,
        number: result.number,
        badges: unlocked,
      });
    return {
      ...state,
      history: [...(state.history ?? []), ...events],
      pendingRoll: null,
      // Turbo makes the settled roll count more than once towards Flywheel.
      flywheelCharge: flywheelAfterSettlement(
        state,
        id,
        action.source,
        skillChargeFactor(fired),
      ),
      skillCharge: chargeAfterSettlement(state, id, action.source),
      balance,
      totalEarned,
      discovered: [
        ...new Set([
          ...state.discovered,
          ...result.badges.map((b) => b.id).filter((id) => badgeIds.has(id)),
        ]),
      ],
      cooldownUntil: Math.max(state.cooldownUntil, cooldownUntil),
      receipts: [...state.receipts, id].slice(-128),
      ...(droppedPet
        ? {
            pets: [...new Set([...(state.pets ?? []), droppedPet])].sort(
              (a, b) => PET_IDS.indexOf(a) - PET_IDS.indexOf(b),
            ),
            // A first pet is worn immediately; later drops never swap your choice.
            activePet:
              (state.activePet ?? "none") === "none"
                ? droppedPet
                : state.activePet,
          }
        : {}),
    };
  }
  if (action.type === "buy") {
    const item = productById.get(action.id);
    if (!item) throw new Error("That item is not available.");
    if (state.owned.includes(item.id))
      throw new Error("You already own this item.");
    if (item.requires && !state.owned.includes(item.requires))
      throw new Error(`Requires ${productById.get(item.requires).name} first.`);
    if (item.requiresProfile && !state.profile)
      throw new Error(`Create a local profile before buying ${item.name}.`);
    if (
      ["offline", "offline-cap"].includes(item.kind) &&
      (state.offline?.batch ||
        (state.offline &&
          (action.at ?? Math.ceil(Date.now())) - state.offline.lastSeenAt >=
            offlineSettings(state.owned).intervalMS))
    )
      throw new Error(
        "Restore offline rewards before upgrading offline earnings. No EP was spent.",
      );
    if (state.balance < item.price)
      throw new Error("Not enough EP for this item.");
    return {
      ...state,
      history: [
        ...(state.history ?? []),
        {
          id:
            action.eventId ??
            `buy:${item.id}${state.rebirths ? `:${state.rebirths}` : ""}`,
          type: "purchase",
          at: action.at ?? Math.ceil(Date.now()),
          productId: item.id,
          name: item.name,
          ep: item.price,
        },
      ],
      balance: state.balance - item.price,
      goalId: state.goalId === item.id ? null : (state.goalId ?? null),
      ...(item.kind === "pace"
        ? {
            flywheelCharge:
              item.id === "flywheel"
                ? 0
                : Math.min(state.flywheelCharge ?? 0, item.charges),
          }
        : {}),
      ...(item.id === "offline-roller" ||
      ["offline", "offline-cap"].includes(item.kind)
        ? {
            offline: {
              lastSeenAt: action.at ?? Math.ceil(Date.now()),
              batch: null,
              report:
                item.id === "offline-roller"
                  ? null
                  : (state.offline?.report ?? null),
            },
          }
        : {}),
      owned: [...state.owned, item.id],
      equipped: item.kind === "aura" ? item.id : state.equipped,
      // A bought skill joins the rack straight away if a slot is free.
      ...(item.kind === "skill"
        ? {
            skills: [...new Set([...(state.skills ?? []), item.id])],
            equippedSkills: autoEquip(
              state.equippedSkills ?? [],
              { ...state, owned: [...state.owned, item.id] },
              item.id,
            ),
          }
        : {}),
    };
  }
  if (action.type === "buy-pet") {
    const pet = petById.get(action.id);
    if (!pet) throw new Error("That companion is not available.");
    if ((state.pets ?? []).includes(pet.id))
      throw new Error("You already have this companion.");
    if (state.balance < pet.price)
      throw new Error("Not enough EP for this companion.");
    return {
      ...state,
      balance: state.balance - pet.price,
      pets: [...new Set([...(state.pets ?? []), pet.id])].sort(
        (a, b) => PET_IDS.indexOf(a) - PET_IDS.indexOf(b),
      ),
      // Buying a companion equips it, matching how auras behave.
      activePet: pet.id,
      history: [
        ...(state.history ?? []),
        {
          id:
            action.eventId ??
            `pet:${pet.id}${state.rebirths ? `:${state.rebirths}` : ""}`,
          type: "purchase",
          at: action.at ?? Math.ceil(Date.now()),
          productId: pet.id,
          name: pet.name,
          ep: pet.price,
        },
      ],
    };
  }
  if (action.type === "equip-pet") {
    if (action.id !== "none" && !(state.pets ?? []).includes(action.id))
      throw new Error("Find or buy this companion before equipping it.");
    if ((state.activePet ?? "none") === action.id) return state;
    // A signature skill only exists while its companion is the active one, so
    // the rack follows the swap. Swapping is free and spends nothing.
    const leaving = skillForPet(state.activePet);
    const equippedSkills = (state.equippedSkills ?? []).filter(
      (id) => !leaving || id !== leaving.id,
    );
    const next = { ...state, activePet: action.id, equippedSkills };
    const arriving = skillForPet(action.id);
    return arriving
      ? {
          ...next,
          equippedSkills: autoEquip(equippedSkills, next, arriving.id),
        }
      : next;
  }
  if (action.type === "equip-skill") {
    const skill = skillById.get(action.id);
    if (!skill) throw new Error("That skill is not available.");
    if (!skillUnlocked(skill.id, state))
      throw new Error(
        skill.source === "pet"
          ? "Equip this companion to use its signature skill."
          : "Unlock this skill before equipping it.",
      );
    const equipped = [...new Set(state.equippedSkills ?? [])];
    const wanted = action.equipped ?? !equipped.includes(skill.id);
    if (wanted && !equipped.includes(skill.id)) {
      const slots = skillSlots(state.owned ?? []);
      if (equipped.length >= slots)
        throw new Error(
          `Your rack holds ${slots} skills. Unequip one, or buy a bigger Skill Bay.`,
        );
      equipped.push(skill.id);
    }
    if (!wanted) {
      const index = equipped.indexOf(skill.id);
      if (index >= 0) equipped.splice(index, 1);
    }
    if (
      equipped.length === (state.equippedSkills ?? []).length &&
      equipped.every((id, i) => id === state.equippedSkills[i])
    )
      return state;
    // Swapping skills is free, so there is no history entry and no charge lost.
    return { ...state, equippedSkills: equipped };
  }
  if (action.type === "equip") {
    if (
      action.id !== "none" &&
      (!state.owned.includes(action.id) ||
        productById.get(action.id)?.kind !== "aura")
    )
      throw new Error("Purchase this aura before equipping it.");
    if (state.equipped === action.id) return state;
    return {
      ...state,
      equipped: action.id,
      history: [
        ...(state.history ?? []),
        {
          id:
            action.eventId ??
            `equip:${action.id}:${state.history?.length ?? 0}`,
          type: "equip",
          at: action.at ?? Math.ceil(Date.now()),
          productId: action.id,
          name: productById.get(action.id)?.name ?? "Original appearance",
        },
      ],
    };
  }
  throw new Error("Unknown progress action");
}

// Old saves have no activity log. Keep valid historical entries, never invent
// previous rolls from a wallet total or discard an otherwise usable save.
function parseHistory(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.flatMap((e) => {
    if (
      !e ||
      typeof e.id !== "string" ||
      !e.id ||
      e.id.length > 160 ||
      seen.has(e.id) ||
      !validAmount(e.at) ||
      e.at > 8640000000000000
    )
      return [];
    const base = { id: e.id, type: e.type, at: e.at };
    let next;
    if (["roll", "unlock"].includes(e.type)) {
      if (
        !validAmount(e.number) ||
        e.number > 1000000 ||
        !Array.isArray(e.badges)
      )
        return [];
      next = {
        ...base,
        number: e.number,
        badges: [...new Set(e.badges.filter((id) => badgeIds.has(id)))],
      };
      if (e.type === "roll") {
        if (
          !validAmount(e.ep) ||
          ![
            "trash",
            "common",
            "uncommon",
            "rare",
            "epic",
            "anomaly",
            "mythic",
            "godly",
          ].includes(e.tier)
        )
          return [];
        next = {
          ...next,
          ep: e.ep,
          tier: e.ep >= 500000 ? "godly" : e.tier,
          ...(e.source === "offline" ? { source: "offline" } : {}),
          ...(["boost", "charge"].includes(e.flywheel)
            ? { flywheel: e.flywheel }
            : {}),
          ...(typeof e.pet === "string" && petById.has(e.pet)
            ? { pet: e.pet }
            : {}),
          ...(validAmount(e.petBonus) && e.petBonus
            ? { petBonus: e.petBonus }
            : {}),
          ...(validAmount(e.walletBonus) && e.walletBonus
            ? {
                walletBonus: e.walletBonus,
                ...(typeof e.walletMultiplier === "number" &&
                Number.isFinite(e.walletMultiplier) &&
                e.walletMultiplier > 1
                  ? { walletMultiplier: e.walletMultiplier }
                  : {}),
              }
            : {}),
          // Which charged skills fired on this roll: the receipt of the charge
          // it spent, kept for the activity feed.
          ...(Array.isArray(e.skills)
            ? { skills: e.skills.filter((id) => skillById.has(id)) }
            : {}),
        };
      }
    } else if (e.type === "rebirth") {
      if (!validAmount(e.count) || e.count < 1) return [];
      next = {
        ...base,
        count: e.count,
        ...(skillById.has(e.skill) ? { skill: e.skill } : {}),
      };
    } else if (e.type === "ultra-rebirth") {
      if (!validAmount(e.count) || e.count < 1) return [];
      next = { ...base, count: e.count };
    } else if (["purchase", "equip"].includes(e.type)) {
      if (
        typeof e.productId !== "string" ||
        !(
          productById.has(e.productId) ||
          (e.type === "equip" && e.productId === "none")
        ) ||
        typeof e.name !== "string" ||
        e.name.length > 100
      )
        return [];
      next = { ...base, productId: e.productId, name: e.name };
      if (e.type === "purchase") {
        if (!validAmount(e.ep)) return [];
        next.ep = e.ep;
      }
    } else return [];
    seen.add(e.id);
    return [next];
  });
}

export function parsePending(p, owned = null) {
  if (p == null) return null;
  // A committed roll snapshots the armed skills that fired on it, so a reload
  // can never re-fire a circle. The snapshot is validated like the timings.
  const skills =
    p.skills == null
      ? []
      : Array.isArray(p.skills)
        ? p.skills.filter((id) => skillById.has(id))
        : null;
  if (skills === null || skills.length !== (p.skills?.length ?? 0))
    throw new Error("Invalid committed roll");
  const plan = drawPlanFor(skills);
  const waived = skillWaivesCooldown(skills);
  const draws = p.draws == null ? null : p.draws;
  if (
    typeof p.id !== "string" ||
    !p.id ||
    p.id.length > 100 ||
    !validAmount(p.number) ||
    p.number > 1000000 ||
    !validAmount(p.startedAt) ||
    !ROLL_DURATIONS.includes(p.rollMS) ||
    ![...COOLDOWN_DURATIONS, 0].includes(p.cooldownMS) ||
    (p.flywheel != null && !["charge", "boost"].includes(p.flywheel)) ||
    // A free roll must be explained: a Flywheel boost or a cooldown-waiving
    // skill. Nothing else may commit a zero cooldown.
    (p.cooldownMS === 0) !== (p.flywheel === "boost" || waived) ||
    !validAmount(p.startedAt + p.rollMS + p.cooldownMS) ||
    (draws !== null &&
      (!plan ||
        !Array.isArray(draws) ||
        draws.length < 1 ||
        draws.length > Math.min(plan.attempts, SKILL_MAX_DRAWS) ||
        !draws.every((number) => validAmount(number) && number <= 1000000) ||
        !draws.includes(p.number)))
  )
    throw new Error("Invalid committed roll");
  // Tamper guard: a committed roll may never be faster than the timings its own
  // save has actually paid for. Without this, editing storage (or a plugin
  // doing it) could hand an upgrade-free profile the fastest reveal and
  // cooldown. Slower snapshots stay valid: buying an upgrade mid-roll must not
  // invalidate the roll already in flight.
  if (owned) {
    const allowed = rollSettings(owned);
    if (
      p.rollMS < allowed.rollMS ||
      (p.cooldownMS < allowed.cooldownMS && p.cooldownMS !== 0)
    )
      throw new Error("Committed roll timings do not match your upgrades");
  }
  return {
    id: p.id,
    number: p.number,
    startedAt: p.startedAt,
    rollMS: p.rollMS,
    cooldownMS: p.cooldownMS,
    ...(skills.length ? { skills } : {}),
    ...(draws ? { draws } : {}),
    ...(p.flywheel ? { flywheel: p.flywheel } : {}),
  };
}

// Only roll settlement can succeed in memory after a failed write. Reapply those
// receipts to the latest shared wallet instead of overwriting other tabs' spending.
export function recoverUnsavedRolls(stored, temporary) {
  if ((stored.rebirths ?? 0) !== (temporary.rebirths ?? 0)) return stored;
  let merged = stored;
  for (const event of temporary.history ?? []) {
    if (
      event.type !== "roll" ||
      merged.history.some((e) => e.type === "roll" && e.id === event.id)
    )
      continue;
    const pending = merged.pendingRoll;
    merged = applyProgress(merged, {
      type: "complete",
      id: event.id,
      source: event.source,
      at: event.at,
      result: {
        number: event.number,
        totalEP: event.ep,
        tier: event.tier,
        badges: event.badges.map((id) => ({ id })),
      },
      cooldownUntil: Math.max(merged.cooldownUntil, temporary.cooldownUntil),
    });
    if (pending && pending.id !== event.id)
      merged = { ...merged, pendingRoll: pending };
  }
  return merged;
}
