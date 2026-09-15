let worker,
  serial = 0;
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
function request(type, number) {
  return new Promise((resolve, reject) => {
    try {
      if (!worker) {
        worker = new Worker(new URL("./roll.worker.js", import.meta.url), {
          type: "module",
        });
        worker.onmessage = ({ data }) => {
          const request = pending.get(data.id);
          if (!request) return;
          pending.delete(data.id);
          clearTimeout(request.timer);
          if (data.error) request.reject(new Error(data.error));
          else request.resolve(data.result);
        };
        worker.onerror = () =>
          reset(
            "The random-roll worker could not start. Please retry in a current browser.",
          );
        worker.onmessageerror = () =>
          reset("Unable to read the roll result. Please retry.");
      }
      const id = ++serial;
      const timer = setTimeout(
        () =>
          reset(
            "Loading the scoring data took too long. Check your connection and retry.",
          ),
        60000,
      );
      pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, type, number });
    } catch (error) {
      reset("Unable to load scoring data. Please retry.");
      reject(error);
    }
  });
}
export const prepareRolls = () => request("init");
export const generateRoll = () => request("roll");

// Internal recovery of a committed number, never a number-entry UI.
export const restoreRoll = (number) => request("restore", number);
