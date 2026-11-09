import { AVATAR_LIMIT } from "./progress.js";

const AVATAR_SIZE = 256;
export const AVATAR_ACCEPT =
  "image/png,image/jpeg,image/webp,image/gif,image/svg+xml";

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file is not an image this browser can read."));
    };
    image.src = url;
  });
}

function drawSquare(image, size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");

  const side = Math.min(image.width, image.height);
  const sx = (image.width - side) / 2;
  const sy = (image.height - side) / 2;
  context.drawImage(image, sx, sy, side, side, 0, 0, size, size);
  return canvas;
}

function encode(canvas, type, quality) {
  return canvas.toDataURL(type, quality);
}

export async function fileToAvatar(file, limit = AVATAR_LIMIT) {
  if (!file || !String(file.type ?? "").startsWith("image/"))
    throw new Error("Choose a PNG, JPEG, WebP or GIF image.");
  const image = await loadImage(file);
  if (!image.width || !image.height)
    throw new Error("That image has no size to draw.");
  for (const size of [AVATAR_SIZE, 192, 128, 96]) {
    const canvas = drawSquare(image, size);

    for (const [type, quality] of [
      ["image/png", undefined],
      ["image/jpeg", 0.86],
      ["image/jpeg", 0.7],
    ]) {
      const data = encode(canvas, type, quality);
      if (data.length <= limit) return data;
    }
  }
  throw new Error(
    "That picture is still too large after shrinking. Try a simpler logo.",
  );
}

export async function compactAvatar(dataUrl, size = 96) {
  if (!dataUrl || dataUrl.length <= 2200) return dataUrl;
  try {
    const image = await new Promise((resolve, reject) => {
      const picture = new Image();
      picture.onload = () => resolve(picture);
      picture.onerror = () => reject(new Error("Unreadable logo."));
      picture.src = dataUrl;
    });
    const canvas = drawSquare(image, size);
    let best = "";
    for (const [type, quality] of [
      ["image/webp", 0.85],
      ["image/jpeg", 0.85],
      ["image/png", undefined],
    ]) {
      const data = encode(canvas, type, quality);
      if (!best || data.length < best.length) best = data;
    }
    return best && best.length < dataUrl.length ? best : dataUrl;
  } catch {
    return dataUrl;
  }
}
