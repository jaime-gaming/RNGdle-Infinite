import fs from "node:fs";

// Some specs make a primary write fail only when the incoming save contains a
// particular row. The primary save is always a gzip envelope now, so the page
// needs the same synchronous decoder as src/save-codec.js to inspect it.
const fflateUmd = fs.readFileSync(
  new URL("../../node_modules/fflate/umd/index.js", import.meta.url),
  "utf8",
);

export async function installPackedSaveDecoder(page) {
  await page.addInitScript({ content: fflateUmd });
  await page.addInitScript(() => {
    const tag = "rngvault1:";
    window.decodePackedSave = (value) => {
      if (typeof value !== "string" || !value.startsWith(tag)) return value;
      const binary = atob(value.slice(tag.length));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1)
        bytes[i] = binary.charCodeAt(i);
      return window.fflate.strFromU8(window.fflate.gunzipSync(bytes));
    };
  });
}
