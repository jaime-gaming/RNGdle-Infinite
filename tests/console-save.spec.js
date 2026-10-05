import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { PROGRESS_KEY, emptyProgress, parseProgress } from "../src/progress.js";
import { accountStats } from "../src/profile-stats.js";
import { seedProgress, testProfile } from "./helpers/progress.js";

const read = (file) => fs.readFileSync(`src/${file}`, "utf8");

// A whole, valid save: the same shape __downloadSave() writes.
const saveString = JSON.stringify({
  ...emptyProgress(),
  profile: testProfile,
  balance: 900,
  totalEarned: 2000,
});

// The v0.3 Profile page downloaded this JSON snapshot instead of the raw v1
// local save. It is still the only JSON backup many existing players have.
const v03ExportString = JSON.stringify({
  app: "RNGdle Infinite",
  saveVersion: 1,
  appVersion: "v0.3",
  exportedAt: "2025-01-01T00:00:00.000Z",
  profile: testProfile,
  stats: { companionsFound: 1, spent: 160000 },
  save: {
    balance: 900,
    totalEarned: 200000,
    discovered: [],
    owned: ["starfall"],
    equipped: "starfall",
    pets: ["pebble", "moth"],
    activePet: "moth",
    skills: [],
    equippedSkills: [],
    skillCharge: {},
    flywheelCharge: 0,
    rebirths: 2,
    ultraRebirths: 0,
    goalId: null,
    history: [
      {
        id: "legacy-roll-1",
        type: "roll",
        at: 1700000000000,
        number: 1337,
        tier: "common",
        ep: 42,
        badges: [],
      },
      {
        id: "legacy-pet-drop",
        type: "pet",
        at: 1700000000000,
        productId: "pebble",
        name: "Pebble",
      },
      {
        id: "legacy-buy-starfall",
        type: "purchase",
        at: 1700000000001,
        productId: "starfall",
        name: "Starfall",
        ep: 40000,
      },
      {
        id: "legacy-buy-moth",
        type: "purchase",
        at: 1700000000002,
        productId: "moth",
        name: "Lumen Moth",
        ep: 120000,
      },
    ],
  },
});

// v0.1–v0.3 did not all have the same local-save shape. These are the raw v1
// saves from those releases; only v0.3 had the separate downloadable snapshot.
const v01RawSave = {
  version: 1,
  profile: testProfile,
  balance: 900,
  totalEarned: 2000,
  discovered: [],
  owned: [],
  equipped: "none",
  cooldownUntil: 0,
  receipts: ["v01-roll"],
};
const legacyRollStartedAt = 1700000000000;
const v02PendingRoll = {
  id: "v02-pending-roll",
  number: 1337,
  startedAt: legacyRollStartedAt,
  rollMS: 45000,
  cooldownMS: 60000,
};
const v02RawSave = {
  ...v01RawSave,
  totalEarned: 1000000,
  history: [
    {
      id: "v02-buy-flywheel",
      type: "purchase",
      at: legacyRollStartedAt,
      productId: "flywheel",
      name: "Flywheel",
      ep: 450000,
    },
    {
      id: "v02-free-pet",
      type: "pet",
      at: legacyRollStartedAt + 1,
      productId: "pebble",
      name: "Pebble",
    },
    {
      id: "v02-buy-moth",
      type: "purchase",
      at: legacyRollStartedAt + 2,
      productId: "moth",
      name: "Lumen Moth",
      ep: 120000,
    },
  ],
  pets: ["pebble", "moth"],
  activePet: "moth",
  pendingRoll: v02PendingRoll,
  offline: null,
  flywheelCharge: 3,
  goalId: null,
  rebirths: 1,
  cooldownWindow: {
    startsAt: legacyRollStartedAt + v02PendingRoll.rollMS,
    endsAt:
      legacyRollStartedAt + v02PendingRoll.rollMS + v02PendingRoll.cooldownMS,
  },
  cooldownUntil:
    legacyRollStartedAt + v02PendingRoll.rollMS + v02PendingRoll.cooldownMS,
  owned: ["flywheel"],
};
const v03RawSave = {
  ...v02RawSave,
  ultraRebirths: 1,
  skills: ["surge"],
  equippedSkills: ["surge"],
  skillCharge: { surge: 5 },
  owned: ["flywheel", "surge"],
  history: [
    ...v02RawSave.history,
    {
      id: "v03-buy-surge",
      type: "purchase",
      at: legacyRollStartedAt,
      productId: "surge",
      name: "Surge",
      ep: 180000,
    },
  ],
  pendingRoll: {
    ...v02PendingRoll,
    id: "v03-skill-pending-roll",
    skills: ["surge"],
  },
};
const historicalRawSaves = [
  {
    version: "v0.1",
    save: v01RawSave,
    rebirths: 0,
    flywheelCharge: 0,
    pendingRollId: null,
  },
  {
    version: "v0.2",
    save: v02RawSave,
    rebirths: 1,
    flywheelCharge: 3,
    pendingRollId: "v02-pending-roll",
  },
  {
    version: "v0.3 raw",
    save: v03RawSave,
    rebirths: 1,
    ultraRebirths: 1,
    flywheelCharge: 3,
    pendingRollId: "v03-skill-pending-roll",
  },
];

function collectConsole(page) {
  const lines = [];
  page.on("console", (message) =>
    lines.push({ type: message.type(), text: message.text() }),
  );
  return lines;
}

const failures = (lines) => lines.filter((line) => line.type === "error");
const says = (lines, text) => lines.some((line) => line.text.includes(text));

async function storedBalance(page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key))?.balance ?? null,
    PROGRESS_KEY,
  );
}

// __importData() reloads the page once the save is written, so the next load
// event is the proof the import went through.
async function importAndWaitForReload(page, call, argument) {
  const loaded = page.waitForEvent("load", { timeout: 5000 });
  await page.evaluate(call, argument);
  await loaded;
}

test("__importData() opens the file picker and imports the chosen save", async ({
  page,
}) => {
  // showOpenFilePicker cannot be driven from a test, so it is stubbed with the
  // same contract: a handle whose getFile() returns the picked file.
  await page.addInitScript((raw) => {
    window.showOpenFilePicker = async () => [
      {
        getFile: async () =>
          new File([raw], "my-save.json", { type: "application/json" }),
      },
    ];
  }, saveString);
  await seedProgress(page);
  const lines = collectConsole(page);

  await page.goto("/");
  await importAndWaitForReload(page, () => window.__importData());

  expect(says(lines, "Opening the file picker")).toBe(true);
  expect(says(lines, 'Save imported: "my-save.json"')).toBe(true);
  expect(says(lines, "LuckyTester")).toBe(true);
  expect(failures(lines)).toEqual([]);
  expect(await storedBalance(page)).toBe(900);
});

test("imports the valid v0.3 JSON profile export as a partial save", async ({
  page,
}) => {
  await page.addInitScript((raw) => {
    window.showOpenFilePicker = async () => [
      {
        getFile: async () =>
          new File([raw], "rngdle-infinite-v03.json", {
            type: "application/json",
          }),
      },
    ];
  }, v03ExportString);
  await seedProgress(page, { balance: 40, totalEarned: 40 });
  const lines = collectConsole(page);

  await page.goto("/");
  await importAndWaitForReload(page, () => window.__importData());

  const imported = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    PROGRESS_KEY,
  );
  expect(says(lines, 'Save imported: "rngdle-infinite-v03.json"')).toBe(true);
  expect(says(lines, "This v0.3 JSON is an account snapshot")).toBe(true);
  expect(failures(lines)).toEqual([]);
  expect(imported).toMatchObject({
    version: 1,
    profile: testProfile,
    balance: 900,
    totalEarned: 200000,
    owned: ["starfall"],
    equipped: "starfall",
    pets: ["pebble", "moth"],
    activePet: "moth",
    rebirths: 2,
    pendingRoll: null,
    offline: null,
    cooldownUntil: 0,
    cycleEarnedEP: 42,
    receipts: ["legacy-roll-1"],
  });
  expect(imported.history).toContainEqual(
    expect.objectContaining({
      type: "pet",
      productId: "pebble",
      name: "Pebble",
    }),
  );
  expect(imported.history).toContainEqual(
    expect.objectContaining({
      type: "purchase",
      productId: "moth",
      name: "Lumen Moth",
      ep: 120000,
    }),
  );
  expect(accountStats(imported).companionsFound).toBe(1);
  expect(accountStats(imported).spent).toBe(160000);
});

test("imports raw local saves from v0.1, v0.2 and v0.3", async ({ page }) => {
  await seedProgress(page);
  const lines = collectConsole(page);

  await page.goto("/");
  for (const legacy of historicalRawSaves) {
    await importAndWaitForReload(
      page,
      (raw) => window.__importData(raw),
      JSON.stringify(legacy.save),
    );

    const raw = await page.evaluate(
      (key) => localStorage.getItem(key),
      PROGRESS_KEY,
    );
    const imported = parseProgress(raw);
    expect(imported.profile).toEqual(testProfile);
    expect(imported.balance).toBe(900);
    expect(imported.rebirths).toBe(legacy.rebirths);
    expect(imported.ultraRebirths).toBe(legacy.ultraRebirths ?? 0);
    expect(imported.flywheelCharge).toBe(legacy.flywheelCharge);
    expect(imported.pendingRoll?.id ?? null).toBe(legacy.pendingRollId);
    if (legacy.version === "v0.3 raw")
      expect(imported.pendingRoll.skills).toEqual(["surge"]);
    if (legacy.version === "v0.2" || legacy.version === "v0.3 raw") {
      expect(imported.pets).toEqual(["pebble", "moth"]);
      expect(imported.activePet).toBe("moth");
      expect(imported.history).toContainEqual(
        expect.objectContaining({
          type: "pet",
          productId: "pebble",
          name: "Pebble",
        }),
      );
      expect(imported.history).toContainEqual(
        expect.objectContaining({
          type: "purchase",
          productId: "moth",
          name: "Lumen Moth",
          ep: 120000,
        }),
      );
      expect(accountStats(imported).companionsFound).toBe(1);
      expect(accountStats(imported).spent).toBe(
        legacy.version === "v0.2" ? 570000 : 750000,
      );
    }
  }

  expect(
    lines.filter((line) => line.text.includes("Save imported")).length,
  ).toBe(historicalRawSaves.length);
  expect(failures(lines)).toEqual([]);
});

test("__importData() falls back to a file input where there is no picker", async ({
  page,
}) => {
  // Firefox and Safari have no showOpenFilePicker: the command builds a hidden
  // <input type="file"> instead. Choosing a file is simulated by filling that
  // input and firing the same change event a real picker fires.
  await page.addInitScript((raw) => {
    Object.defineProperty(window, "showOpenFilePicker", {
      value: undefined,
      configurable: true,
    });
    const original = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      HTMLInputElement.prototype.click = original;
      const data = new DataTransfer();
      data.items.add(
        new File([raw], "fallback-save.json", { type: "application/json" }),
      );
      this.files = data.files;
      this.dispatchEvent(new Event("change"));
    };
  }, saveString);
  await seedProgress(page);
  const lines = collectConsole(page);

  await page.goto("/");
  await importAndWaitForReload(page, () => window.__importData());

  expect(says(lines, "Opening the file picker")).toBe(true);
  expect(says(lines, "fallback-save.json")).toBe(true);
  expect(says(lines, "Save imported")).toBe(true);
  expect(failures(lines)).toEqual([]);
  expect(await storedBalance(page)).toBe(900);
});

test("cancelling the picker says so instead of failing in silence", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showOpenFilePicker", {
      value: undefined,
      configurable: true,
    });
    // A dismissed dialog never fires change; the window gets its focus back.
    HTMLInputElement.prototype.click = function () {
      setTimeout(() => window.dispatchEvent(new Event("focus")), 50);
    };
  });
  await seedProgress(page);
  const lines = collectConsole(page);

  await page.goto("/");
  // Wrap in a block: the command resolves when the dialog settles, and the
  // test only needs the click that opens it.
  await page.evaluate(() => {
    window.__importData();
  });
  await page.waitForTimeout(500);

  expect(says(lines, "No file selected")).toBe(true);
  expect(await storedBalance(page)).toBe(0);
  await page.waitForTimeout(1200);
});

test("__importData(json) still takes a string, an object, or nothing", async ({
  page,
}) => {
  await seedProgress(page);
  const lines = collectConsole(page);

  await page.goto("/");
  await importAndWaitForReload(
    page,
    (raw) => window.__importData(raw),
    saveString,
  );

  expect(says(lines, "Save imported: the JSON text you passed")).toBe(true);
  expect(await storedBalance(page)).toBe(900);
});

test("__importData(object) accepts a save object", async ({ page }) => {
  await seedProgress(page);
  const lines = collectConsole(page);

  await page.goto("/");
  await importAndWaitForReload(
    page,
    (raw) => window.__importData(JSON.parse(raw)),
    saveString,
  );

  expect(says(lines, "Save imported: the save object you passed")).toBe(true);
  expect(await storedBalance(page)).toBe(900);
});

test("a broken JSON is reported on the console and changes nothing", async ({
  page,
}) => {
  await seedProgress(page, { balance: 40, totalEarned: 40 });
  const lines = collectConsole(page);

  await page.goto("/");
  await page.evaluate(() => window.__importData('{"version":1,'));
  await page.waitForTimeout(700);

  expect(says(lines, "is not a valid RNGdle save")).toBe(true);
  expect(says(lines, "The JSON could not be parsed")).toBe(true);
  expect(failures(lines).length).toBeGreaterThan(0);
  expect(await storedBalance(page)).toBe(40);
});

test("an HTML page picked by mistake is called out as such", async ({
  page,
}) => {
  await seedProgress(page);
  const lines = collectConsole(page);

  await page.goto("/");
  await page.evaluate(() =>
    window.__importData("<html><body>404</body></html>"),
  );
  await page.waitForTimeout(400);

  expect(says(lines, "looks like an HTML page")).toBe(true);
  expect(await storedBalance(page)).toBe(0);
});

test("JSON that is not a save reports the reason", async ({ page }) => {
  await seedProgress(page);
  const lines = collectConsole(page);

  await page.goto("/");
  await page.evaluate(() => window.__importData('{"version":2,"balance":1}'));
  await page.waitForTimeout(400);

  expect(says(lines, "is not a valid RNGdle save")).toBe(true);
  expect(says(lines, "Unrecognized save version")).toBe(true);
  expect(await storedBalance(page)).toBe(0);
});

test("no browser picker at all still ends in a console answer", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showOpenFilePicker", {
      value: undefined,
      configurable: true,
    });
    // The dialog never opens: click is swallowed and focus never leaves.
    HTMLInputElement.prototype.click = function () {};
  });
  await seedProgress(page);
  const lines = collectConsole(page);

  await page.goto("/");
  await page.evaluate(() => {
    window.__importData();
  });
  await page.waitForTimeout(2000);

  expect(says(lines, "did not seem to open")).toBe(true);
  expect(says(lines, "import without a file")).toBe(true);
  expect(await storedBalance(page)).toBe(0);
});

test("the old __importSave name keeps working and points at the new one", async ({
  page,
}) => {
  await seedProgress(page);
  const lines = collectConsole(page);

  await page.goto("/");
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => typeof window.__importData)).toBe(
    "function",
  );

  await importAndWaitForReload(
    page,
    (raw) => window.__importSave(raw),
    saveString,
  );

  expect(says(lines, "renamed to __importData")).toBe(true);
  expect(says(lines, "Save imported")).toBe(true);
  expect(await storedBalance(page)).toBe(900);
});

test("a modern picker the browser blocks falls back instead of dead-ending", async ({
  page,
}) => {
  // Chrome throws a SecurityError for showOpenFilePicker() in an iframe or
  // without a user gesture, which is exactly how the command is used from the
  // console. The hidden file input must take over, not the error message.
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript((raw) => {
    window.showOpenFilePicker = async () => {
      throw new DOMException(
        "Must be handling a user gesture to use 'showOpenFilePicker'.",
        "SecurityError",
      );
    };
    const original = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      HTMLInputElement.prototype.click = original;
      const data = new DataTransfer();
      data.items.add(
        new File([raw], "fallback-save.json", { type: "application/json" }),
      );
      this.files = data.files;
      this.dispatchEvent(new Event("change"));
    };
  }, saveString);
  await seedProgress(page);
  const lines = collectConsole(page);

  await page.goto("/");
  await importAndWaitForReload(page, () => window.__importData());

  expect(says(lines, "would not open its own file dialog")).toBe(true);
  expect(says(lines, "Trying the browser's own file input")).toBe(true);
  expect(says(lines, 'Save imported: "fallback-save.json"')).toBe(true);
  expect(failures(lines)).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(await storedBalance(page)).toBe(900);
});

test("__exportSave() never claims a copy the browser refused", async ({
  page,
}) => {
  // writeText() rejects asynchronously, so an un-awaited call would report
  // success and then throw a page error. Both clipboard routes are broken
  // here: the command must say so and print the save instead.
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: () =>
          Promise.reject(
            new DOMException("Write permission denied.", "NotAllowedError"),
          ),
      },
      configurable: true,
    });
    document.execCommand = () => false;
  });
  await seedProgress(page);
  const lines = collectConsole(page);

  await page.goto("/");
  const raw = await page.evaluate(() => window.__exportSave());
  await page.waitForTimeout(300);

  expect(typeof raw).toBe("string");
  expect(JSON.parse(raw).profile.username).toBe("LuckyTester");
  expect(says(lines, "The browser blocked the clipboard")).toBe(true);
  expect(says(lines, "Save (copy this):")).toBe(true);
  expect(says(lines, "Save copied to clipboard")).toBe(false);
  expect(pageErrors).toEqual([]);
});

test("main.jsx installs the console tools and nothing else changed", () => {
  const main = read("main.jsx");
  expect(main).toContain("installConsoleSaveTools()");
  expect(main).toContain("__importData");
  const code = read("console-save.js");
  expect(code).toContain("window.__importData = importData");
  expect(code).toContain("showOpenFilePicker");
  expect(code).toContain("parseProgress");
});
