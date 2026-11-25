# Cloud game authority and staged security

## First server-authoritative stage

Signed-in Cloud rolls go through `/api/game/roll` on the Cloudflare Worker. The
Worker verifies the Firebase ID token, reads that UID's Cloud save using the
same user token, derives the roll/cooldown/skill plan from the saved state, and
passes that plan to one Durable Object per Firebase UID. The Durable Object
serializes the account cooldown, generates uniformly distributed roll numbers,
and returns the same result for a retried request ID. The browser does not send
or choose a roll plan or an authoritative timestamp. It sends the current
profile ID only so the Worker can reject a roll if the Cloud save belongs to a
different profile; the ID does not affect the server-derived roll plan. Local
profiles continue to use the local roll worker and do not call this endpoint.

An authenticated account receives a warning before any automatic Cloud-roll
restriction:

1. A request must arrive more than 10 seconds before the server's saved
   cooldown ends. Requests near the deadline are ignored for enforcement.
2. Only repeated requests from the browser identifier that made the latest
   successful roll are counted. A first request from another device is denied
   by the account cooldown, but is not a suspicious event. Switching devices
   and completing a server-allowed roll changes the active browser identifier.
   This deliberately avoids treating multi-device use by itself as suspicious.
3. Three spaced repeat attempts (at least one second apart, in a 30-minute
   window) after an initial early request produce a verified event and the
   first warning. Three further verified events produce a second warning; three
   more pause Cloud rolls. The warning stage clears after 30 days without a
   verified event. The Durable Object keeps only a bounded set of random
   browser/request identifiers and cooldown/security counters; it does not use
   IP addresses or device fingerprinting to classify roll attempts.
4. A restriction sets `cloud_security_status/{uid}.cloud_access` to `false`
   with the verified-event count. Firestore rules deny clients from reading or
   changing this enforcement record and block Cloud-save creation/updates while
   restricted. Existing Cloud saves remain readable; player data is not
   deleted. A player may continue locally, and user-directed deletion remains
   separate from anti-cheat enforcement.

Cloudflare must have the `GAME_SESSIONS` Durable Object binding and `v1` SQLite
migration from `wrangler.jsonc`. Before deploying a Worker build that uses
server-checked Cloud rolls:

1. Publish `firestore.rules` to the configured Firebase project. The rule change
   keeps saves readable and denies only new/updated Cloud game saves when the
   private status record says access is paused.
2. Create a dedicated Google service account with the Firestore access required
   to read and update `cloud_security_status` documents. Store its complete JSON
   only as a Cloudflare Worker secret, never in a source file, `.env` file,
   browser bundle, or chat:

   ```sh
   npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON
   ```

   The Worker uses that credential only for the private enforcement record; it
   reads a player's save using that player's verified Firebase ID token. Keep
   the service account's permissions as narrow as the project permits.

3. Deploy the Worker and its Durable Object migration, then test an authenticated
   Cloud profile, a separate local profile, and the local-play switch. Do not
   deploy production without an explicit release instruction.

The API fails closed for Cloud rolls if token verification, Firestore, the
Durable Object, or the service-account secret is unavailable. Local play and
existing saves remain available. A Cloudflare secret is not read by Vite and is
never included in `dist/`.

## Diagnosing a 503

A `503` from `/api/game/status` or `/api/game/roll` means the Worker could not
verify the request. It is a deployment fault, not a player fault, and the
browser cannot repair it. The Worker writes one line to its log before the
browser receives `NT605`. Read that line in the Cloudflare dashboard
(**Workers → rngdle-infinite → Logs**) or with `npx wrangler tail`:

| Worker log tag                       | What is missing                                     | Setup step                                              |
| ------------------------------------ | --------------------------------------------------- | ------------------------------------------------------- |
| `cloud-game-project-missing`         | `FIREBASE_PROJECT_ID` var                           | Add it to `vars` in `wrangler.jsonc` and redeploy.      |
| `cloud-game-service-account-missing` | `FIREBASE_SERVICE_ACCOUNT_JSON` secret              | `npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON` |
| `cloud-game-session-binding-missing` | The `GAME_SESSIONS` Durable Object binding          | Deploy the binding and the `v1` SQLite migration.       |
| `cloud-game-token-unavailable`       | The Firebase signing keys or the ID token           | Retry, then check `securetoken` reachability.           |
| `cloud-game-session-unavailable`     | The Durable Object did not answer                   | Check the binding name against `wrangler.jsonc`.        |
| `cloud-game-save-unavailable`        | The player save could not be read from Firestore    | Check the service account's Firestore access.           |
| `cloud-game-restriction-unavailable` | The enforcement record could not be read or written | Check Firestore access for the service account.         |

Each line also carries the failing detail (for example
`reading the Cloud save answered 403` or `FIREBASE_SERVICE_ACCOUNT_JSON is not
valid JSON`) so the cause is visible without a second deploy. A missing token
now answers `401 sign-in-required`, not `503`, because that one is repaired by
signing in again.

## Error references

If a roll error shows a `Reference` code, include that code when asking for help.
It identifies the kind of failure without containing an account ID, save data,
roll number, or browser identifier. Common references are:

| Reference | Meaning                                                         |
| --------- | --------------------------------------------------------------- |
| `NT605`   | The Cloud-roll verification service is temporarily unavailable. |
| `CL303`   | Cloud access is paused for this account.                        |
| `CL304`   | The Cloud save service could not be reached.                    |
| `CL307`   | The signed-in account changed; reload before retrying.          |
| `CL314`   | Online play is waiting for the Cloud save to finish syncing.    |
| `GM504`   | The server cooldown has not finished.                           |
| `NT604`   | The server response could not be checked.                       |
| `NT606`   | This browser could not prepare a secure roll request.           |

The message next to the reference explains what to do; these references are for
support and diagnostics, not a statement that the player did anything wrong.

## Manual review and re-enable

The automatic restriction never edits or deletes the player save. To restore
Cloud rolls after review, an operator may set the private
`cloud_security_status/{uid}` document's `cloud_access` field to `true` and its
`status` field to `cleared` in the trusted Firebase/Google Cloud console. The
next authenticated Worker status or roll request clears the Durable Object's
warning/restriction counters; its current server cooldown is retained. Players
cannot read, create, change, or remove the status document from the browser.

## Explicit limitation and next stages

This is a first authority boundary for Cloud roll issuance and cooldown checks,
not a claim that the entire economy is tamper-proof. Existing reveal scoring,
reward settlement, purchases, progression rules, and parts of save construction
still run in the browser; Firestore stores a client-written compressed save.
The Worker uses the current Cloud save to derive its plan, so a separately
forged save is not yet an authoritative progression ledger.

Before describing all Cloud progression as server-authoritative, a later stage
must move roll settlement behind the Worker: store a server-issued roll
receipt, calculate the score and reward from trusted game data, apply the
receipt exactly once, and validate every affected progression field before
writing a Cloud save. Migrate save writes through that trusted path while
keeping local-only play client-side and keeping a read/export/delete path for
existing saves. Add versioned compatibility and recovery before changing the
Cloud save write rules.
