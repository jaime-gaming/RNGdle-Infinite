export function localSaveUsableForCloudFallback({
  owner,
  userId,
  profile,
  healthy,
} = {}) {
  // Unowned guest progress can be used locally, but another account's save
  // must never be exposed or imported into the currently signed-in account.
  return (owner === userId || !owner) && Boolean(profile) && healthy === true;
}
