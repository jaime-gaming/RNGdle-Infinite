export function shouldShowLoadingScreen({ gameDataReady }) {
  // Game data is needed to play. Authentication and cloud recovery happen in
  // the background; they must never hold the whole game behind a spinner.
  return !gameDataReady;
}
