const integrityError = () =>
  new Error("The scoring data failed its integrity check. Please retry.");

async function sha256(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

// Check the canonical bytes, not a gzip container's timestamp, OS flag, or
// compression level. Delivery may change those without changing any score.
export async function decodeIndex(bytes, file) {
  let buffer = bytes;
  const magic = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  if (magic[0] === 0x1f && magic[1] === 0x8b) {
    if (typeof DecompressionStream === "undefined")
      throw new Error(
        "Please use a current browser with gzip decompression support.",
      );
    const reader = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"))
      .getReader();
    // Bound decompression before allocating/copying arbitrarily large output.
    const output = new Uint8Array(file.inflatedBytes);
    let offset = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (offset + value.byteLength > output.length) throw integrityError();
        output.set(value, offset);
        offset += value.byteLength;
      }
      if (offset !== output.length) throw integrityError();
      buffer = output.buffer;
    } catch {
      await reader.cancel().catch(() => {});
      throw integrityError();
    } finally {
      reader.releaseLock();
    }
  }
  if (
    buffer.byteLength !== file.inflatedBytes ||
    (await sha256(buffer)) !== file.inflatedSha256
  )
    throw integrityError();
  return buffer;
}

export async function readIndex(file, baseURL) {
  // The body is ordinary ASCII JSON, so HTTP gzip handling cannot accidentally
  // inflate or reinterpret the *inner* scoring file. The URL pins its version.
  const response = await fetch(
    `${baseURL}${file.transportPath.replace(/^\//, "")}`,
    { cache: "no-cache" },
  );
  if (!response.ok)
    throw new Error(
      "The scoring data could not be downloaded. Check your connection and retry.",
    );
  let bytes;
  try {
    const payload = await response.json();
    if (payload?.encoding !== "gzip-base64" || typeof payload.data !== "string")
      throw integrityError();
    const raw = atob(payload.data);
    bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0)).buffer;
  } catch {
    throw integrityError();
  }
  return decodeIndex(bytes, file);
}
