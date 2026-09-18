import { test, expect } from "@playwright/test";
import fs from "node:fs";
import http from "node:http";
import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { decodeIndex, readIndex } from "../src/load-index.js";
import manifest from "../src/data/game-index.json" with { type: "json" };

const getTransport = (name) =>
  JSON.parse(
    fs.readFileSync(
      new URL(
        `../public${manifest.files[name].transportPath}`,
        import.meta.url,
      ),
    ),
  );

test("valid scoring data is accepted when gzip transport metadata changes", async ({
  page,
}) => {
  let deliveries = 0;
  await page.route("**/data/*-table.*.json", async (route) => {
    const kind = new URL(route.request().url()).pathname.includes("/ep-")
      ? "ep"
      : "badge";
    const payload = getTransport(kind),
      body = Buffer.from(payload.data, "base64");
    // Same regression as the formerly failing binary request: gzip metadata
    // changes while the exact decompressed score/badge bytes stay identical.
    body[9] ^= 1;
    payload.data = body.toString("base64");
    deliveries++;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();
  expect(deliveries).toBe(2);
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "complete",
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("canonical integrity accepts raw or recompressed bytes but rejects changed scores and oversized output", async () => {
  const raw = Buffer.from([10, 20, 30, 40]);
  const file = {
    inflatedBytes: raw.length,
    inflatedSha256: createHash("sha256").update(raw).digest("hex"),
  };
  const buffer = (data) => Uint8Array.from(data).buffer;
  for (const bytes of [
    raw,
    gzipSync(raw, { level: 1 }),
    gzipSync(raw, { level: 9 }),
  ])
    expect(new Uint8Array(await decodeIndex(buffer(bytes), file))).toEqual(
      Uint8Array.from(raw),
    );
  for (const invalid of [
    Buffer.from([10, 20, 30, 41]),
    gzipSync(Buffer.from([10, 20, 30, 41])),
    gzipSync(Buffer.alloc(5)),
    gzipSync(Buffer.alloc(3)),
    Buffer.from([31, 139, 1]),
  ])
    await expect(decodeIndex(buffer(invalid), file)).rejects.toThrow(
      "integrity check",
    );
});

test("versioned JSON transports contain the pinned indexes without HTTP Content-Encoding", async ({
  request,
}) => {
  for (const kind of ["ep", "badge"]) {
    const file = manifest.files[kind];
    expect(file.transportPath).toContain(file.sha256.slice(0, 16));
    const response = await request.get(file.transportPath);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");
    expect(response.headers()["content-encoding"]).toBeUndefined();
    const payload = await response.json();
    expect(payload.encoding).toBe("gzip-base64");
    const compressed = Buffer.from(payload.data, "base64");
    expect(createHash("sha256").update(compressed).digest("hex")).toBe(
      file.sha256,
    );
    expect(
      createHash("sha256").update(gunzipSync(compressed)).digest("hex"),
    ).toBe(file.inflatedSha256);
  }
});

test("HTTP-compressed JSON is decoded once and truly corrupt scoring bytes still fail", async () => {
  let corrupt = true;
  // Real HTTP exercises Fetch's Content-Encoding decoding; route.fulfill()
  // supplies an already-decoded body and cannot simulate that network layer.
  const server = http.createServer((request, response) => {
    const kind = request.url.includes("/ep-") ? "ep" : "badge";
    const payload = getTransport(kind);
    if (corrupt && kind === "ep") {
      const raw = gunzipSync(Buffer.from(payload.data, "base64"));
      raw[0] ^= 1;
      payload.data = gzipSync(raw).toString("base64");
    }
    response.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Encoding": "gzip",
      "Cache-Control": "no-store",
    });
    response.end(gzipSync(JSON.stringify(payload)));
  });
  await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/`;
    await expect(readIndex(manifest.files.ep, base)).rejects.toThrow(
      "integrity check",
    );
    corrupt = false;
    for (const file of Object.values(manifest.files)) {
      const bytes = await readIndex(file, base);
      expect(bytes.byteLength).toBe(file.inflatedBytes);
      expect(
        createHash("sha256").update(new Uint8Array(bytes)).digest("hex"),
      ).toBe(file.inflatedSha256);
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
