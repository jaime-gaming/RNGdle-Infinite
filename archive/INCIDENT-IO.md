# Optional incident.io error alerts

RNGdle can send a small, deduplicated alert to an incident.io HTTP alert source when a render boundary catches a UI failure or the app shows a reportable cloud, account-link, storage, network, or integrity error. Ordinary game-rule messages such as insufficient EP, expected sign-in failures, and profile-name collisions are excluded.

## Data and privacy

The browser sends only a diagnostic reference (for example `CL301`) and a source category to the same-origin `/api/client-errors` route. It does not send error text, stack traces, account identifiers, profile names, saves, roll numbers, or the current page URL. The Worker validates the same-origin request, limits its size and rate, and forwards a normalized event. Repeated events for the same code are deduplicated by incident.io; the browser also applies a five-minute per-code cooldown.

The route is dormant until an incident.io alert-source URL is configured. If it is absent, the Worker acknowledges the report without forwarding it.

## Configure it

1. In incident.io, create an **HTTP alert source** and copy its alert events URL. It should have the form `https://api.incident.io/v2/alert_events/http/<source-id>`.
2. From the repository, set that URL as a Cloudflare Worker secret. The URL is a credential: do not put it in frontend environment variables or commit it.

   ```sh
   npx wrangler secret put INCIDENT_IO_ALERT_EVENTS_URL
   ```

3. Deploy the Worker/static assets using the normal production deploy process. The Worker routes `/api/client-errors`; the rest of the site is served from the `ASSETS` binding. For a separate HTTPS staging host, set the non-secret Worker variable `INCIDENT_IO_ALLOWED_ORIGIN` to that exact origin on the staging environment.
4. First attach a test alert source and confirm a test event appears in incident.io. Then replace its URL with the production alert source URL in the production Worker secret.
5. To send a smoke-test event from the deployed app, open its origin in a browser console and run:

   ```js
   const response = await fetch("/api/client-errors", {
     method: "POST",
     credentials: "omit",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ code: "UI101", source: "ui-notice" }),
   });
   console.log(response.status, await response.json());
   ```

   `202` with `accepted: true` means incident.io accepted the event. `reason: "not-configured"` means the Worker secret is missing; `incident-source-unavailable` or `incident-source-rejected` means its URL or source needs attention. This creates a real firing alert; use a test source/staging Worker first, or resolve the smoke-test alert in incident.io afterward. Reports for the same code are rate-limited and deduplicated.

The event title contains the diagnostic reference, and its metadata includes only the app name, reference, and broad source category. incident.io routing and severity policy remain under your control.
