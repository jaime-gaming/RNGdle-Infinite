const LOCAL_PLAY_KEY = "rng-infinite-local-play-v1";

function storageRef(storage) {
  try {
    return storage ?? globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function localPlayEnabled(storage) {
  try {
    return storageRef(storage)?.getItem(LOCAL_PLAY_KEY) === "1";
  } catch {
    return false;
  }
}

export function chooseLocalPlay(enabled = true, storage) {
  try {
    const target = storageRef(storage);
    if (!target) return false;
    if (enabled) target.setItem(LOCAL_PLAY_KEY, "1");
    else target.removeItem(LOCAL_PLAY_KEY);
    return true;
  } catch {
    return false;
  }
}

export { LOCAL_PLAY_KEY };
