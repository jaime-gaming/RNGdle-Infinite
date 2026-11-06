# Deploying to Cloudflare Workers

The live game is a **Cloudflare Worker with static assets** — no server code, no
functions — serving the Vite build in `dist/` at
`https://rngdle-infinite.jaime-gaming.com/`.

| Piece                      | Where it is configured                                 |
| -------------------------- | ------------------------------------------------------ |
| Worker name and assets     | `wrangler.jsonc` (`name`, `assets.directory`)          |
| SPA fallback for deep URLs | `assets.not_found_handling = single-page-application`  |
| Custom domain              | `routes[].pattern` with `custom_domain: true`          |
| Caching and security heads | `public/_headers` → `dist/_headers`                    |
| Build identity + updates   | Vite plugin in `vite.config.js` (`version.json`, meta) |
| Firebase project           | `.env.production` (public web config)                  |

## Deploy

```bash
npx wrangler login          # once per machine
npm run deploy:worker       # build + wrangler deploy (claims the custom domain)
npm run deploy:worker -- --dry-run   # build and validate, upload nothing
```

`main` is protected: deploying from it needs `CF_ALLOW_PRODUCTION=true`,
matching the previous Pages guard. Any other branch deploys a normal Worker
version (it still serves on the custom domain, so use it deliberately).

## First-time setup on a new account

1. **The zone must be on Cloudflare.** `jaime-gaming.com` has to be in the same
   account that owns the Worker, or the custom domain cannot be attached.
2. **Free the hostname.** A hostname can point at only one Cloudflare service.
   If the old Cloudflare Pages project still owns
   `rngdle-infinite.jaime-gaming.com`, remove it first:
   dashboard → **Workers & Pages → rngdle-infinite (Pages) → Custom domains →
   remove**, or delete that Pages project. Otherwise `wrangler deploy` fails
   with “hostname already in use”.
3. **Deploy:** `npm run deploy:worker`. Wrangler creates the DNS record and the
   certificate for the custom domain automatically.
4. **Firebase Authentication → Settings → Authorised domains** must list
   `rngdle-infinite.jaime-gaming.com` (see `FIREBASE_SETUP.md`). Without it,
   sign-in popups and email links fail with `auth/unauthorized-domain`.
5. **App Check** (optional): add the hostname to the reCAPTCHA Enterprise key’s
   allowed domains before enforcing attestation.

GitHub Pages (`docs/`, base path `/RNGdle-Infinite/`) is a legacy mirror and is
**not** the custom domain; do not configure Cloudflare DNS to point at it.

## Verify a deploy

```bash
npm run build && npm run test:worker   # local Worker runtime, assets + routing
curl -sI  https://rngdle-infinite.jaime-gaming.com/            # 200, no-cache
curl -s   https://rngdle-infinite.jaime-gaming.com/version.json # buildId + internalVersion
curl -sI  https://rngdle-infinite.jaime-gaming.com/shop/auras  # 200, app shell
curl -sI  https://rngdle-infinite.jaime-gaming.com/assets/<hashed>.js # immutable
```

The internal version in `version.json` must match the one baked into the page
(`<meta name="rngdle-internal-version">`); that is what the in-app
“reload until updated” flow compares. After a deploy, load the site in a clean
profile and confirm the Settings build identity changed.

Never claim the live domain is updated until these checks pass against the real
host; a green `npm run test:worker` only proves the artifact, not DNS, TLS or
the account configuration.

## Troubleshooting

| Symptom                                         | Cause / fix                                                                                                |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `hostname already in use`                       | Old Pages custom domain still attached — remove it (step 2 above).                                         |
| Deploy succeeds, site still shows the old build | Browser/SW cache or the deploy went to `*.workers.dev`; check the Worker’s custom domain in the dashboard. |
| `522` / `1016` on the domain                    | DNS/zone problem: the zone is not active on Cloudflare or the record is wrong.                             |
| Deep link returns 404                           | `assets.not_found_handling` changed; it must stay `single-page-application`.                               |
| `auth/unauthorized-domain` when signing in      | Hostname missing from Firebase authorised domains.                                                         |
| Cloud Account shows `permission-denied`         | `npm run deploy:rules` was not run, or App Check is enforcing without this domain.                         |
| `version.json` 404 or stale                     | `_headers` must keep `no-store` for `/version.json`; check `dist` contains it.                             |

## Rollback

```bash
npx wrangler deployments list          # versions of the rngdle-infinite Worker
npx wrangler rollback [deployment-id]  # serve the previous version
```

Or deploy the previous commit with `npm run deploy:worker`.
