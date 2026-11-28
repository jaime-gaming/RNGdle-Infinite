# Security policy

## Report a vulnerability privately

Email **jaimegamingpro@gmail.com** with the subject **RNGdle Infinite security
report**. This is the existing project contact. Do not publish exploit details,
credentials, player saves or personal information in GitHub issues, pull requests
or screenshots. No response-time guarantee or bug bounty is currently offered.

Include the affected version/commit, environment, impact, minimal reproduction
and a redacted request/response or reference code where useful. Use a test
account you control. Do not access another player's data, enumerate profiles,
perform denial-of-service testing or exploit the production service to prove a
report. Coordinate any testing beyond your own local/test environment first.
Email is not an encrypted disclosure channel: never attach live tokens, private
keys, service-account files or unredacted saves. Ask how to exchange sensitive
material if the report cannot be reproduced with sanitized data.

## Maintenance scope

Security fixes are prepared against the current development line, presently
`v0.6.1`. There is no published long-term-support commitment for older builds.
A development branch, generated Pages artifact or successful local check does
not establish which version or security rules are deployed in production.

## Sensitive integrations

- **Firebase Authentication and Firestore:** private saves must remain scoped to
  the authenticated UID. Different game profiles must not be merged silently.
  Public summaries require explicit consent and must not expose account UIDs.
- **Cloudflare Worker and Durable Objects:** Cloud roll requests verify Firebase
  ID tokens, enforce account cooldowns and preserve idempotent request results.
  Known restrictions must not become automatic local-fallback permission.
- **Secrets:** `FIREBASE_SERVICE_ACCOUNT_JSON` belongs in the Worker secret
  store, never Git, chat, a `VITE_` variable or a browser bundle. Public Firebase
  Web configuration is not a service-account credential; Firestore rules and
  verified identities remain the security boundary.
- **Local saves and imports:** treat files as untrusted input, validate bounds
  and types, retain recovery copies and do not expose player data in logs.

Use a separate test Firebase project for experiments. Do not weaken production
rules, enable listing of private saves or reintroduce client App Check merely
as an incidental fix. Existing security mechanisms and their limitations are
explained in [Cloud game security](docs-source/cloud-game-security.md).

## Maintainer response checklist

1. Reproduce privately with synthetic data; establish the affected boundary.
2. Preserve evidence without collecting unrelated user data. If a real secret
   was exposed, revoke/rotate it at the provider and review its use; removing it
   from the latest Git revision is not sufficient.
3. Add a regression test. Run the relevant client, render and Cloud-rule
   simulations; assess whether deployed Worker bindings or rules need changes.
4. Coordinate the fix and disclosure. Publish production changes only with
   explicit authorization and verify the deployed behavior independently.
