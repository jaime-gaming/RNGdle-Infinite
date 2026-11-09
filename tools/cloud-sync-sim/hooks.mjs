const here = new URL("./fakes/", import.meta.url);
const targets = {
  "firebase/firestore": new URL("firestore.mjs", here).href,
  "firebase/app": new URL("app.mjs", here).href,
  "firebase/auth": new URL("auth.mjs", here).href,
};
const FAKE_FIREBASE = new URL("firebase.mjs", here).href;
export async function resolve(specifier, context, next) {
  if (targets[specifier])
    return { url: targets[specifier], shortCircuit: true };
  const resolved = await next(specifier, context);
  if (resolved?.url?.endsWith("/src/firebase.js"))
    return { url: FAKE_FIREBASE, shortCircuit: true };
  return resolved;
}
