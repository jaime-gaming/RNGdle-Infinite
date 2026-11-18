import fs from "node:fs";
import { SAVE_COMPACT_KEY_NAMES } from "../../src/save-codec.js";

const fflateUmd = fs.readFileSync(
  new URL("../../node_modules/fflate/umd/index.js", import.meta.url),
  "utf8",
);

export async function installPackedSaveDecoder(page) {
  await page.addInitScript({ content: fflateUmd });
  await page.addInitScript((keyNames) => {
    const currentTag = "rngvault2:",
      legacyTag = "rngvault1:",
      marker = "~";
    const names = new Map(
      keyNames.map((name, index) => [`${marker}${index.toString(36)}`, name]),
    );
    const expand = (value) => {
      if (Array.isArray(value)) return value.map(expand);
      if (!value || typeof value !== "object") return value;
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => {
          const decoded = key.startsWith(`${marker}${marker}`)
            ? key.slice(marker.length)
            : (names.get(key) ?? key);
          return [decoded, expand(entry)];
        }),
      );
    };
    window.decodePackedSave = (value) => {
      if (typeof value !== "string") return value;
      const current = value.startsWith(currentTag);
      const tag = current
        ? currentTag
        : value.startsWith(legacyTag)
          ? legacyTag
          : "";
      if (!tag) return value;
      const binary = atob(value.slice(tag.length));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1)
        bytes[i] = binary.charCodeAt(i);
      const raw = window.fflate.strFromU8(window.fflate.gunzipSync(bytes));
      if (!current) return raw;
      if (raw[0] === "R") return raw.slice(1);
      if (raw[0] !== "J") return "";
      return JSON.stringify(expand(JSON.parse(raw.slice(1))));
    };
  }, SAVE_COMPACT_KEY_NAMES);
}
