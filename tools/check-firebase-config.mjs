#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function readEnv(file) {
  try {
    return Object.fromEntries(
      readFileSync(join(repoRoot, file), "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1).trim()];
        }),
    );
  } catch {
    return {};
  }
}

const env = { ...readEnv(".env.production"), ...readEnv(".env") };
const apiKey = env.VITE_FIREBASE_API_KEY ?? "";
const projectId = env.VITE_FIREBASE_PROJECT_ID ?? "";

const args = process.argv.slice(2);
const domainFlag = args.indexOf("--domain");
const expectedDomain =
  domainFlag >= 0 ? args[domainFlag + 1] : "rngdle-infinite.jaime-gaming.com";

if (!apiKey || !projectId) {
  console.error(
    "Missing VITE_FIREBASE_API_KEY or VITE_FIREBASE_PROJECT_ID in .env.production.",
  );
  process.exit(1);
}

const endpoint =
  process.env.FIREBASE_CONFIG_URL ??
  `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/config?key=${apiKey}`;

let response;
try {
  response = await fetch(endpoint);
} catch (error) {
  console.error(`Could not reach Firebase: ${error.message}`);
  process.exit(1);
}

if (!response.ok) {
  console.error(`Firebase returned ${response.status} ${response.statusText}`);
  process.exit(1);
}

const config = await response.json();
const domains = Array.isArray(config.authorizedDomains)
  ? config.authorizedDomains
  : [];
const options = Array.isArray(config.signInOptions) ? config.signInOptions : [];

console.log(`Project:            ${config.projectId ?? projectId}`);
console.log(
  `Authorised domains: ${domains.length ? domains.join(", ") : "(none reported)"}`,
);
console.log(
  `Sign-in options:    ${options.length ? options.join(", ") : "(not reported by this endpoint)"}`,
);

const problems = [];
if (options.length && !options.includes("EMAIL_LINK_SIGNIN"))
  problems.push(
    "Email link (passwordless) sign-in is NOT enabled: Firebase console → Authentication → Sign-in method → enable 'Email link (passwordless sign-in)'.",
  );
if (options.length && !options.includes("EMAIL_PASSWORD"))
  problems.push(
    "Email/Password sign-in is NOT enabled; the email link flow requires it too.",
  );
if (domains.length && !domains.includes(expectedDomain))
  problems.push(
    `"${expectedDomain}" is not an authorised domain: Firebase console → Authentication → Settings → Authorised domains → add it.`,
  );
if (!options.length)
  console.log(
    "\nThis endpoint did not report sign-in options; check the provider list in the Firebase console.",
  );

if (problems.length) {
  console.log("\nTo fix:");
  for (const problem of problems) console.log(` - ${problem}`);
  process.exit(1);
}

console.log(
  `\nOK: email link sign-in is enabled and ${expectedDomain} is authorised.`,
);
