import { test, expect } from "@playwright/test";
import { seedProgress } from "./helpers/progress.js";
import fs from "node:fs";
import { createHash } from "node:crypto";
import manifest from "../src/data/game-index.json" with { type: "json" };
import metadata from "../src/data/badge-metadata.json" with { type: "json" };
import { originalsByNumber } from "../src/infinite-badges.js";
import { randomNumber } from "../src/random.js";
import { createGameIndex } from "../src/game-index.js";
import {
  POPULATION,
  rankExplanation,
  rankScore,
  formatPercentile,
  formatPercent,
} from "../src/probability.js";
import { evaluate, inflate, sampleResults } from "./helpers/index.js";
import { mockRandom } from "./helpers/random-roll.js";

test("every legal number has consistent EP and every badge probability matches its population", () => {
  const scores = new DataView(inflate("ep")),
    bits = new Uint8Array(inflate("badge"));
  const families = [
    ...new Set(metadata.filter((b) => b.family).map((b) => b.family)),
  ];
  const familyIndex = metadata.map((b) => families.indexOf(b.family)),
    best = new Uint32Array(families.length);
  const counts = new Uint32Array(metadata.length),
    tiers = new Uint32Array(manifest.tiers.length);
  for (let n = 0; n < POPULATION; n++) {
    best.fill(0);
    let total = 0;
    for (let i = 0; i < metadata.length; i++)
      if (bits[i * manifest.rowBytes + (n >> 3)] & (1 << (n & 7))) {
        counts[i]++;
        const f = familyIndex[i],
          value = metadata[i].ep;
        if (f < 0) total += value;
        else if (value > best[f]) {
          total += value - best[f];
          best[f] = value;
        }
      }
    if (total !== scores.getUint32(n * 4, true))
      throw new Error(`Inconsistent EP at ${n}`);
    tiers[manifest.tiers.findLastIndex((t) => total >= t.minEP)]++;
  }
  expect([...tiers]).toEqual(manifest.tiers.map((t) => t.count));
  for (const [i, b] of metadata.entries()) {
    expect(counts[i], b.id).toBe(b.matchingNumbers);
    expect(b.probabilityPercent, b.id).toBe((100 * counts[i]) / POPULATION);
    expect(b.probability, b.id).toBe(`${formatPercent(b.probabilityPercent)}%`);
  }
  expect(metadata.find((b) => b.id === "PRIME").matchingNumbers).toBe(78498);
  expect(metadata.find((b) => b.id === "EVEN").matchingNumbers).toBe(500001);
  expect(metadata.find((b) => b.id === "LEET_EXACT").probability).toBe(
    "0.0001%",
  );
  for (const [kind, file] of Object.entries(manifest.files)) {
    const compressed = fs.readFileSync(
      new URL(`../public${file.path}`, import.meta.url),
    );
    expect(createHash("sha256").update(compressed).digest("hex")).toBe(
      file.sha256,
    );
    expect(
      createHash("sha256")
        .update(new Uint8Array(inflate(kind)))
        .digest("hex"),
    ).toBe(file.inflatedSha256);
  }
});

test("pinned base index matches all fifty observed scores, tiers, earned and superseded badges", () => {
  const reference = createGameIndex(inflate("ep"), inflate("badge"), {
    originals: false,
  });
  for (const sample of sampleResults) {
    const result = reference.evaluate(sample.number);
    expect(result.totalEP).toBe(sample.totalEP);
    expect(result.tier).toBe(sample.totalEP >= 500000 ? "godly" : sample.tier);
    expect(result.badges.map((b) => [b.id, b.isScoring])).toEqual(
      sample.badges.map((b) => [b.id, b.isScoring]),
    );
  }
  for (const n of [-1, 1000001, NaN, 1.5, "1337"])
    expect(() => evaluate(n)).toThrow();
  expect(() => createGameIndex(new ArrayBuffer(0), inflate("badge"))).toThrow(
    "size",
  );
});

test("ranks use inclusive tails of the full population and preserve rare-result precision", () => {
  const view = new DataView(inflate("ep"));
  for (const n of [0, 1, 1337, 103381, 604827, 1000000]) {
    const result = evaluate(n);
    let above = 0,
      below = 0,
      equal = 0;
    for (let i = 0; i < POPULATION; i++) {
      const score =
        view.getUint32(i * 4, true) +
        (originalsByNumber.get(i) ?? []).reduce((s, b) => s + b.ep, 0);
      above += score >= result.totalEP;
      below += score <= result.totalEP;
      equal += score === result.totalEP;
    }
    expect(result.rank.atOrAbove).toBe(above);
    expect(result.rank.atOrBelow).toBe(below);
    expect(result.rank.equal).toBe(equal);
    expect(result.rank.percentile).toBe((100 * below) / POPULATION);
  }
  expect(rankScore([1, 2, 2, 2, 3], 2)).toMatchObject({
    below: 1,
    equal: 3,
    atOrBelow: 4,
    atOrAbove: 4,
    percentile: 80,
  });
  expect(formatPercentile(evaluate(1))).toBe("Top <1%");
  expect(formatPercentile(evaluate(1337))).toBe("Top <1%");
  expect(rankExplanation(evaluate(1337))).toContain(
    "Top 0.0026% — 26 of 1,000,001",
  );
  expect(rankExplanation(evaluate(1))).toContain(
    "Top 0.0001% — 1 of 1,000,001",
  );
  expect(formatPercentile(evaluate(103381))).toBe("Bottom 6%");
  for (const value of [NaN, -1, 101])
    expect(() => formatPercent(value)).toThrow();
});

test("uniform crypto rejection sampling supports both endpoints, rejects the biased tail, and permits repeats", () => {
  const limit = Math.floor(2 ** 32 / POPULATION) * POPULATION;
  expect(limit).toBe(4294004294);
  expect(limit % POPULATION).toBe(0);
  const words = [limit, 2 ** 32 - 1, 0, 1000000, limit - 1, 1337, 1337];
  let calls = 0;
  const crypto = {
    getRandomValues(array) {
      array[0] = words[calls++];
      return array;
    },
  };
  expect(randomNumber(crypto)).toBe(0);
  expect(calls).toBe(3);
  expect(randomNumber(crypto)).toBe(1000000);
  expect(randomNumber(crypto)).toBe(1000000);
  expect(randomNumber(crypto)).toBe(1337);
  expect(randomNumber(crypto)).toBe(1337);
  expect(() => randomNumber({})).toThrow("Secure randomness");
});

test("arbitrary-number contributor diagrams only refer to valid digits; equations are true", () => {
  for (let n = 0; n < POPULATION; n += 997) {
    const result = evaluate(n),
      length = String(n).length;
    for (const b of result.badges) {
      const c = b.contributors;
      if (!c || c.type === "whole") continue;
      const positions =
        c.type === "groups"
          ? c.groups.flat()
          : c.type === "range"
            ? [c.start, c.end - 1]
            : c.indices;
      for (const p of positions)
        if (!Number.isInteger(p) || p < 0 || p >= length)
          throw Error(`Invalid contributor for ${n}: ${b.id}`);
    }
    if (result.equation) {
      const {
        numbers: [a, b, c],
        op,
      } = result.equation;
      expect({ "+": a + b, "-": a - b, "*": a * b, "/": a / b }[op]).toBe(c);
    }
  }
});

test("repeated random results each earn EP once and double-clicking cannot bypass cooldown", async ({
  page,
}) => {
  await mockRandom(page, [1337, 1337, 604827]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();
  await page.clock.install();
  await page
    .getByRole("button", { name: "GENERATE", exact: true })
    .evaluate((b) => {
      b.click();
      b.click();
    });
  await expect(page.locator(".number-artifact")).toBeVisible();
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-settled",
    "true",
  );
  await page.clock.fastForward(105100);
  await page.getByRole("button", { name: "ROLL AGAIN", exact: true }).click();
  await expect(page.locator(".number-artifact")).toHaveAttribute(
    "aria-label",
    "Number 1337",
  );
  await expect(page.locator(".session-total>span")).toHaveText(
    "200,354,916 EP",
  );
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-settled",
    "true",
  );
  await page.clock.fastForward(105100);
  await page.getByRole("button", { name: "ROLL AGAIN", exact: true }).click();
  await expect(page.locator(".number-artifact")).toHaveAttribute(
    "aria-label",
    "Number 604827",
  );
  await expect(page.locator(".session-total>span")).toHaveText(
    "200,359,579 EP",
  );
});

test("corrupt delivery awards nothing; retry loads the text-safe scoring data", async ({
  page,
}) => {
  let corrupt = true;
  await mockRandom(page, [1]);
  await page.route("**/data/*-table.*.json", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1);
    const body =
      corrupt && name.startsWith("ep-")
        ? Buffer.from("corrupt")
        : fs.readFileSync(new URL(`../public/data/${name}`, import.meta.url));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body,
    });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("integrity check");
  await expect(page.locator(".history-numbers button")).toHaveCount(0);
  await expect(page.locator(".roll-ep")).toHaveCount(0);
  corrupt = false;
  await page.getByRole("button", { name: "RETRY & ROLL", exact: true }).click();
  await expect(page.locator(".percentile")).toHaveText("Top <1%");
  await expect(page.locator(".percentile")).toHaveAttribute(
    "title",
    /1 of 1,000,001 possible numbers score at least 186,186,584 EP/,
  );
  await expect(page.locator(".number-artifact")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("loading disables generation without blocking help, and badge odds explain exact counts", async ({
  page,
}) => {
  await seedProgress(page, { discovered: ["LEET_EXACT"] });
  let release, requested;
  const gate = new Promise((r) => {
      release = r;
    }),
    requestSeen = new Promise((r) => {
      requested = r;
    });
  await page.route("**/data/ep-table.*.json", async (route) => {
    requested();
    await gate;
    await route.continue();
  });
  await page.goto("/");
  await requestSeen;
  await expect(
    page.getByRole("button", { name: "LOADING ROLL DATA…", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "How to play", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toContainText("Both include ties");
  release();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Badges", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Search badges" }).fill("Exact Leet");
  await page.locator(".badge-card").click();
  await expect(page.getByRole("dialog")).toContainText("0.0001%");
  await expect(
    page.getByRole("dialog").locator('[title^="1 of 1,000,001"]'),
  ).toHaveText("0.0001%1 in 1,000,001");
});
