// Turning a chosen picture into a logo the save can carry.
//
// The avatar travels inside the save — that is what makes it follow a device
// link — so it is squared, shrunk and re-encoded in the browser before it is
// ever stored. Nothing is uploaded anywhere: the file is read locally, drawn
// on a canvas and handed back as a data URL.

import { AVATAR_LIMIT } from "./progress.js";

export const AVATAR_SIZE = 256;
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
  // Centre-crop: a logo should never be squashed just to fit.
  const side = Math.min(image.width, image.height);
  const sx = (image.width - side) / 2;
  const sy = (image.height - side) / 2;
  context.drawImage(image, sx, sy, side, side, 0, 0, size, size);
  return canvas;
}

function encode(canvas, type, quality) {
  return canvas.toDataURL(type, quality);
}

// Smallest encoding that fits, from lossless PNG down to a smaller JPEG. A
// picture that cannot fit at any size is refused with a sentence, not a crash.
export async function fileToAvatar(file, limit = AVATAR_LIMIT) {
  if (!file || !String(file.type ?? "").startsWith("image/"))
    throw new Error("Choose a PNG, JPEG, WebP or GIF image.");
  const image = await loadImage(file);
  if (!image.width || !image.height)
    throw new Error("That image has no size to draw.");
  for (const size of [AVATAR_SIZE, 192, 128, 96]) {
    const canvas = drawSquare(image, size);
    // PNG first, because a logo keeps its transparency; the JPEG passes are
    // what rescue a photograph that would never fit losslessly.
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
