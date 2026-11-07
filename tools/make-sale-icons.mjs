// Draws the Black Friday sale icons straight from their geometry and writes the
// PNGs the head tags point at. The SVG favicon is hand-written; these PNGs are
// generated because a browser needs a real raster for a touch icon and a
// manifest, and the build has no SVG rasteriser to call.
//
// Deterministic and dependency-free: signed distances, a 4×4 supersample per
// pixel, and Node's own zlib for the PNG stream. Run `node
// tools/make-sale-icons.mjs` after changing the icon art.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public");
const SAMPLES = 4;

// The icon's own geometry, in a 128-unit box, matching public/favicon-sale.svg.
const BG = "#050505";
const HAIRLINE = "#3f3f46";
const INK = "#f4f4f5";
const SALE = "#ff2d2d";

const rgb = (hex) => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

function sdRoundBox(x, y, cx, cy, half, radius) {
  const dx = Math.abs(x - cx) - (half - radius);
  const dy = Math.abs(y - cy) - (half - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - radius;
}

function sdSegment(x, y, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const length = vx * vx + vy * vy;
  let t = length ? ((x - ax) * vx + (y - ay) * vy) / length : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (ax + vx * t), y - (ay + vy * t));
}

// Which colour covers one point of the icon, or null for "nothing here".
function paintAt(x, y, square) {
  const edge = square
    ? sdRoundBox(x, y, 64, 64, 64, 0)
    : sdRoundBox(x, y, 64, 64, 64, 28);
  if (edge > 0) return null;
  // The percent sign: two rings and the bar between them.
  const ring = (cx, cy) => Math.abs(Math.hypot(x - cx, y - cy) - 11) - 5.5;
  const bar = sdSegment(x, y, 85, 41, 43, 83) - 5.5;
  if (ring(47, 45) < 0 || ring(81, 79) < 0 || bar < 0) return rgb(INK);
  if (sdSegment(x, y, 30, 103, 98, 103) - 4 < 0) return rgb(SALE);
  const hairline = square ? null : sdRoundBox(x, y, 64, 64, 57, 22);
  if (hairline != null && Math.abs(hairline) - 1.5 < 0) return rgb(HAIRLINE);
  return rgb(BG);
}

function render(size, square) {
  const scale = size / 128;
  const pixels = Buffer.alloc(size * size * 4);
  const step = 1 / SAMPLES;
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (column + (sx + 0.5) * step) / scale;
          const y = (row + (sy + 0.5) * step) / scale;
          const hit = paintAt(x, y, square);
          if (!hit) continue;
          r += hit[0];
          g += hit[1];
          b += hit[2];
          a += 1;
        }
      }
      const total = SAMPLES * SAMPLES;
      const index = (row * size + column) * 4;
      // Straight (unpremultiplied) averaging: the icon's colours are all solid,
      // so the only blending that happens is on its own rounded edge.
      pixels[index] = a ? Math.round(r / a) : 0;
      pixels[index + 1] = a ? Math.round(g / a) : 0;
      pixels[index + 2] = a ? Math.round(b / a) : 0;
      pixels[index + 3] = Math.round((a / total) * 255);
    }
  }
  return pixels;
}

// ---- A minimal PNG writer --------------------------------------------------
const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function writePng(file, size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // truecolour with alpha
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let row = 0; row < size; row++) {
    raw[row * (stride + 1)] = 0; // filter: none
    pixels.copy(
      raw,
      row * (stride + 1) + 1,
      row * stride,
      row * stride + stride,
    );
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
  return png.length;
}

// A touch icon is composited onto the home screen, so it is drawn full-bleed
// with square corners instead of floating on transparency.
const TARGETS = [
  { file: "icon-192-sale.png", size: 192, square: false },
  { file: "icon-512-sale.png", size: 512, square: false },
  { file: "apple-touch-icon-sale.png", size: 180, square: true },
];

for (const target of TARGETS) {
  const bytes = writePng(
    path.join(OUT, target.file),
    target.size,
    render(target.size, target.square),
  );
  console.log(`${target.file}: ${target.size}×${target.size}, ${bytes} bytes`);
}
