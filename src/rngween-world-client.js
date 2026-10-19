// CLEANUP Nov 4, 2026: delete this file with the World (worker client).
let worker;
let serial = 0;
const pending = new Map();
function reset(message) {
  worker?.terminate();
  worker = null;
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.reject(new Error(message));
  }
  pending.clear();
}

export function drawRngweenWorld(drawn, zone = "valley") {
  return new Promise((resolve, reject) => {
    try {
      if (!worker) {
        worker = new Worker(
          new URL("./rngween-world.worker.js", import.meta.url),
          {
            type: "module",
          },
        );
        worker.onmessage = ({ data }) => {
          const request = pending.get(data.id);
          if (!request) return;
          clearTimeout(request.timer);
          pending.delete(data.id);
          if (data.error) request.reject(new Error(data.error));
          else request.resolve(data.number);
        };
        worker.onerror = () =>
          reset("The world's random worker could not start. Please retry.");
        worker.onmessageerror = () =>
          reset("The world result could not be read. Please retry.");
      }
      const id = ++serial;
      const timer = setTimeout(
        () => reset("The world roll timed out. No number was revealed."),
        15000,
      );
      pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, drawn, zone });
    } catch (error) {
      reset("The world roll could not start.");
      reject(error);
    }
  });
}
