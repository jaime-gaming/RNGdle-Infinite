// Validates and documents the pinned factual indexes from RNGdle Tools.
// No upstream executable code is bundled. Run after replacing the two gzip files.
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
const population = 1000001,
  rowBytes = Math.ceil(population / 8);
const metadata = JSON.parse(
  fs.readFileSync("src/data/badge-metadata.json", "utf8"),
);
const files = {};
for (const kind of ["ep", "badge"]) {
  const path = `public/data/${kind}-table.bin.gz`,
    compressed = fs.readFileSync(path);
  // JSON avoids .gz Content-Encoding rewriting and binary/text conversion in
  // embedded preview proxies. A content-addressed URL prevents stale versions.
  const transportPath = `/data/${kind}-table.${createHash("sha256").update(compressed).digest("hex").slice(0, 16)}.json`;
  fs.writeFileSync(
    `public${transportPath}`,
    JSON.stringify({
      encoding: "gzip-base64",
      data: compressed.toString("base64"),
    }) + "\n",
  );

  files[kind] = {
    path: `/data/${kind}-table.bin.gz`,
    transportPath,
    sha256: createHash("sha256").update(compressed).digest("hex"),
    compressedBytes: compressed.length,
    inflatedBytes: gunzipSync(compressed).length,
    inflatedSha256: createHash("sha256")
      .update(gunzipSync(compressed))
      .digest("hex"),
  };
}
const raw = gunzipSync(fs.readFileSync("public/data/ep-table.bin.gz"));
if (raw.length !== population * 4) throw Error("Wrong EP index length");
const scores = Uint32Array.from({ length: population }, (_, i) =>
  raw.readUInt32LE(i * 4),
);
const bits = gunzipSync(fs.readFileSync("public/data/badge-table.bin.gz"));
if (bits.length !== metadata.length * rowBytes)
  throw Error("Wrong badge index length");
const tiers = [
  ["trash", 0],
  ["common", 2087],
  ["uncommon", 5802],
  ["rare", 10074],
  ["epic", 22293],
  ["anomaly", 35469],
  ["mythic", 162292],
  ["godly", 500000],
].map(([id, minEP]) => ({ id, minEP, count: 0 }));
for (const score of scores) {
  let i = tiers.length - 1;
  while (i > 0 && score < tiers[i].minEP) i--;
  tiers[i].count++;
}
const popcount = Uint8Array.from({ length: 256 }, (_, x) => {
  let count = 0;
  while (x) {
    x &= x - 1;
    count++;
  }
  return count;
});
for (let i = 0; i < metadata.length; i++) {
  let count = 0;
  for (let b = 0; b < rowBytes; b++) count += popcount[bits[i * rowBytes + b]];
  // Only the low bit of the last byte belongs to the legal range.
  count -= popcount[bits[(i + 1) * rowBytes - 1] & 254];
  metadata[i].matchingNumbers = count;
  metadata[i].probabilityPercent = (100 * count) / population;
  metadata[i].probability =
    `${Number(metadata[i].probabilityPercent.toPrecision(3)).toLocaleString("en-US", { maximumFractionDigits: 6 })}%`;
}
const manifest = {
  source: "https://rng.cubityfir.st/",
  revision: "8190166af9f259a9d3a0a941b2c9902bfbbe713f",
  population,
  rowBytes,
  badgeIds: metadata.map((b) => b.id),
  files,
  tiers,
};
fs.writeFileSync(
  "src/data/game-index.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
fs.writeFileSync(
  "src/data/badge-metadata.json",
  JSON.stringify(metadata, null, 2) + "\n",
);
console.log(
  "Validated",
  population,
  "numbers and",
  metadata.length,
  "badge rows.",
);
console.table(
  tiers.map((t) => ({ ...t, percentage: (100 * t.count) / population })),
);
