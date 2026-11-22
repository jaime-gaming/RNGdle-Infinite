// Minimal browser surface so components can render in Node without a browser.
import { Window } from "happy-dom";

export function installDom(url = "http://localhost/") {
  const win = new Window({ url });
  globalThis.window = win;
  globalThis.document = win.document;
  Object.defineProperty(globalThis, "navigator", {
    value: win.navigator,
    configurable: true,
  });
  globalThis.HTMLElement = win.HTMLElement;
  globalThis.Element = win.Element;
  globalThis.Node = win.Node;
  globalThis.Event = win.Event;
  globalThis.CustomEvent = win.CustomEvent;
  globalThis.getComputedStyle = win.getComputedStyle.bind(win);
  globalThis.requestAnimationFrame = (callback) =>
    setTimeout(() => callback(Date.now()), 0);
  globalThis.cancelAnimationFrame = clearTimeout;
  globalThis.localStorage = win.localStorage;
  globalThis.sessionStorage = win.sessionStorage;
  globalThis.location = win.location;
  globalThis.history = win.history;
  globalThis.matchMedia = win.matchMedia.bind(win);
  globalThis.CSS = win.CSS;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return win;
}

export async function runBundle(relativeBundle) {
  const { run } = await import(relativeBundle);
  await run();
}
