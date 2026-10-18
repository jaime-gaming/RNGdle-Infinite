// Developer fixture, never imported by the app. Only the explicit unlocked
// review server injects it, on an empty origin; reloads never refill a save.
import { applyProgress, emptyProgress, PROGRESS_KEY } from "../src/progress.js";
import { defaultSettings, SETTINGS_KEY } from "../src/settings.js";
import {
  RNGWEEN_ID,
  RNGWEEN_AURAS,
  RNGWEEN_MISSIONS,
  RNGWEEN_COSMETICS,
} from "../src/rngween.js";
import {
  RNGWEEN_PET,
  RNGWEEN_SIGNATURE,
  RNGWEEN_SKILL,
  RNGWEEN_WORLD_KEY,
  RNGWEEN_WORLD_TARGET,
} from "../src/rngween-limited.js";
import {
  emptyRngweenWorld,
  WORLD_SPEED_ITEMS,
} from "../src/rngween-world-zones.js";
import { flywheelRequired } from "../src/flywheel.js";
import { skillById } from "../src/skills.js";

export function unlockedRngweenPreview() {
  const base = emptyProgress();
  const owned = [
    ...RNGWEEN_COSMETICS.map((item) => item.id),
    RNGWEEN_SKILL.id,
    "skill-bay-1",
    "skill-bay-2",
    "surge",
    "twice",
    "flywheel",
    "auto-roll",
    ...[1, 2, 3, 4].map((n) => `quickwind-${n}`),
    ...[1, 2, 3, 4, 5, 6].map((n) => `clockwork-${n}`),
  ];
  const equippedSkills = [
    RNGWEEN_SKILL.id,
    "twice",
    RNGWEEN_SIGNATURE.id,
    "surge",
  ];
  const fixture = {
    progressKey: PROGRESS_KEY,
    settingsKey: SETTINGS_KEY,
    settings: { ...defaultSettings, autoRollDefault: false },
    progress: {
      ...base,
      profile: {
        id: "rngween-unlocked-preview",
        username: "RngweenSandbox",
        createdAt: Date.UTC(2026, 9, 26, 12),
      },
      balance: 100000000,
      totalEarned: 100000000,
      owned,
      equipped: "hexbound",
      pets: [RNGWEEN_PET.id],
      activePet: RNGWEEN_PET.id,
      skills: [RNGWEEN_SKILL.id, "twice", "surge"],
      equippedSkills,
      skillCharge: Object.fromEntries(
        equippedSkills.map((id) => [id, skillById.get(id).charges]),
      ),
      flywheelCharge: flywheelRequired(owned),
      // RNGDLE_SANDBOX_PRESTIGES=3 previews the fresh-start offer.
      ultraRebirths: Number(process.env.RNGDLE_SANDBOX_PRESTIGES ?? 0) || 0,
      rebirths: Number(process.env.RNGDLE_SANDBOX_PRESTIGES ?? 0) ? 7 : 0,
      tasks: {
        ...base.tasks,
        rngween: {
          id: RNGWEEN_ID,
          counts: Object.fromEntries(
            RNGWEEN_MISSIONS.map((mission) => [mission.metric, mission.goal]),
          ),
          earned: RNGWEEN_MISSIONS.map((mission) => mission.id),
        },
      },
      rngweenLimited: {
        ...base.rngweenLimited,
        pumpkoins: 50000,
        bought: [RNGWEEN_PET.id, RNGWEEN_SKILL.id],
        drawn: [],
        skinEarned: true,
        auras: RNGWEEN_AURAS.map((aura) => aura.id),
        world: {
          ...emptyRngweenWorld(),
          upgrades: WORLD_SPEED_ITEMS.map((item) => item.id),
        },
        rewardedMissions: RNGWEEN_MISSIONS.map((mission) => mission.id),
      },
    },
  };
  const samples = {
    "pumpkin-patch": [1, 2, 3, 4, 5, 6, 7, 8, 9],
    graveyard: [66, 13, 49, 66, 6, 12, 97, 99],
    "haunted-house": [
      666, 13, 123, 313, 111, 229, 343, 246, 123, 666, 111, 121,
    ],
    "blood-moon-ridge": [666, 606, 616, 626, 13, 7, 123, 67],
    valley: [1234, 1354, 10, 1353, 1361, RNGWEEN_WORLD_TARGET],
  };
  let cursor =
    Date.UTC(2026, 9, 26, 12) - Object.values(samples).flat().length * 2000;
  for (const [zone, numbers] of Object.entries(samples)) {
    if (zone === "valley") {
      fixture.progress = applyProgress(fixture.progress, {
        type: "forge-rngween-key",
        at: cursor,
      });
      fixture.progress.rngweenLimited.bought.push(RNGWEEN_WORLD_KEY.id);
    }
    for (const number of numbers) {
      fixture.progress = applyProgress(fixture.progress, {
        type: "rngween-world-roll",
        zone,
        number,
        expectedCount: fixture.progress.rngweenLimited.drawn.length,
        at: cursor,
      });
      const pending = fixture.progress.rngweenLimited.world.pending;
      cursor = pending.revealsAt;
      fixture.progress = applyProgress(fixture.progress, {
        type: "rngween-world-reveal",
        id: pending.id,
        at: cursor,
      });
    }
  }
  return fixture;
}
