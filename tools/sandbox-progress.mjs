// Explicit developer mode only. No public URL flag, device-date control or
// production account/economy bypass. Use a separate port/origin for the fixture.
export function sandboxProgress(enabled = false) {
  if (!enabled) return null;
  return {
    name: "sandbox-unlocked-progress",
    apply: "serve",
    transformIndexHtml: {
      order: "pre",
      async handler() {
        // Lazy import: ordinary dev and every production build skip the fixture.
        const { unlockedRngweenPreview } =
          await import("./rngween-preview-data.mjs");
        const payload = JSON.stringify(unlockedRngweenPreview()).replaceAll(
          "<",
          "\\u003c",
        );
        return [
          {
            tag: "script",
            attrs: { "data-sandbox-unlocked": "true" },
            injectTo: "head-prepend",
            children: `(() => {
            const seed = ${payload};
            try {
              if (localStorage.getItem(seed.progressKey) !== null) return;
              localStorage.setItem(seed.progressKey, JSON.stringify(seed.progress));
              if (localStorage.getItem(seed.settingsKey) === null)
                localStorage.setItem(seed.settingsKey, JSON.stringify(seed.settings));
              if (localStorage.getItem("rng-theme") === null)
                localStorage.setItem("rng-theme", "dark");
            } catch { /* Preview without storage falls back to ordinary guest play. */ }
          })();`,
          },
        ];
      },
    },
  };
}
