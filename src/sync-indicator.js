export function profileSyncTone(sync) {
  if (!sync?.linked) return "";
  if (sync.status === "error") return "error";
  if (sync.status === "live" && sync.peers >= 2 && !sync.pending)
    return "connected";
  return "pending";
}

export function profileSyncDescription(tone) {
  return (
    {
      connected: "Linked and syncing with another device",
      pending: "Waiting for the other device or changes to sync",
      error: "Device sync error — changes may not be reaching the other device",
    }[tone] ?? ""
  );
}
