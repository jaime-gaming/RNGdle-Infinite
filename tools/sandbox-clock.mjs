// Development-only review clock. `dev:rngween` or RNGDLE_SANDBOX_DATE selects
// the date on the server, never in a player preference or public URL.
// `apply: serve` keeps the override entirely out of production HTML and Pages.
const CLOCK_PATH = "/__rngdle/season-clock";

export function sandboxClock(value = process.env.RNGDLE_SANDBOX_DATE) {
  if (!value) return null;
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) throw new Error("Invalid RNGDLE_SANDBOX_DATE");
  const start = performance.now();
  const now = () => Math.floor(epoch + performance.now() - start);
  return {
    name: "sandbox-review-clock",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://vite.local");
        // Preview proxies can replace Date or drop custom response headers.
        // A same-origin JSON body preserves the server-selected review date.
        if (req.method === "GET" && url.pathname === CLOCK_PATH) {
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store, max-age=0");
          res.end(JSON.stringify({ at: now() }));
          return;
        }
        if (req.method === "HEAD" && url.searchParams.has("season-clock")) {
          const reviewDate = new Date(now()).toUTCString();
          res.setHeader("Date", reviewDate);
          res.setHeader("X-RNGdle-Sandbox-Date", reviewDate);
          res.setHeader("Cache-Control", "no-store");
        }
        next();
      });
    },
    transformIndexHtml: {
      order: "pre",
      handler() {
        const reviewAt = now();
        return [
          {
            tag: "meta",
            attrs: { name: "rngdle-sandbox-clock", content: CLOCK_PATH },
            injectTo: "head-prepend",
          },
          {
            tag: "script",
            attrs: { "data-sandbox-clock": "true" },
            injectTo: "head-prepend",
            children: `(() => {
            const NativeDate = window.Date;
            const tick = performance.now.bind(performance);
            const start = tick();
            const now = () => ${reviewAt} + Math.max(0, tick() - start);
            window.Date = new Proxy(NativeDate, {
              construct(target, args, next) {
                return Reflect.construct(target, args.length ? args : [now()], next);
              },
              apply() { return new NativeDate(now()).toString(); },
              get(target, key, receiver) {
                return key === "now" ? now : Reflect.get(target, key, receiver);
              }
            });
          })();`,
          },
        ];
      },
    },
  };
}
