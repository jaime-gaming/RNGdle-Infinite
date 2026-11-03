import { expect, test } from "./helpers/clock.js";
import {
  chooseLocalPlay,
  localPlayEnabled,
  LOCAL_PLAY_KEY,
} from "../src/local-play.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("local play is an explicit choice and survives a reload", () => {
  const storage = memoryStorage();
  expect(localPlayEnabled(storage)).toBe(false);
  expect(chooseLocalPlay(true, storage)).toBe(true);
  expect(storage.getItem(LOCAL_PLAY_KEY)).toBe("1");
  expect(localPlayEnabled(storage)).toBe(true);
  expect(chooseLocalPlay(false, storage)).toBe(true);
  expect(localPlayEnabled(storage)).toBe(false);
});

test("unavailable browser storage fails safely", () => {
  const storage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  expect(localPlayEnabled(storage)).toBe(false);
  expect(chooseLocalPlay(true, storage)).toBe(false);
});
