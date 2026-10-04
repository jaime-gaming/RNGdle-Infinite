import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { PROGRESS_KEY, emptyProgress } from "../src/progress.js";
import { seedProgress, testProfile } from "./helpers/progress.js";

const read = (file) => fs.readFileSync(`src/${file}`, "utf8");

// A whole, valid save: the same shape __downloadSave() writes.
const saveString = JSON.stringify({
  ...emptyProgress(),
  profile: testProfile,
  balance: 900,
  totalEarned: 2000,
});

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

test("main.jsx installs the console tools and nothing else changed", () => {
  const main = read("main.jsx");
  expect(main).toContain("installConsoleSaveTools()");
  expect(main).toContain("__importData");
  const code = read("console-save.js");
  expect(code).toContain("window.__importData = importData");
  expect(code).toContain("showOpenFilePicker");
  expect(code).toContain("parseProgress");
});
