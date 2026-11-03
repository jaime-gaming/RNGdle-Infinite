import { expect, test } from "./helpers/clock.js";
import { drainSerialQueue, enqueueSerial } from "../src/serial-queue.js";

test("serial work stays ordered, drains appended work, and survives failures", async () => {
  const queue = { current: Promise.resolve() };
  const events = [];
  let releaseFirst;
  const first = enqueueSerial(queue, async () => {
    events.push("first-start");
    await new Promise((resolve) => {
      releaseFirst = resolve;
    });
    events.push("first-end");
  });
  const drained = drainSerialQueue(queue);
  await new Promise((resolve) => setImmediate(resolve));
  const second = enqueueSerial(queue, () => events.push("second"));
  releaseFirst();
  await Promise.all([first, second, drained]);
  expect(events).toEqual(["first-start", "first-end", "second"]);

  const failed = enqueueSerial(queue, () => {
    throw new Error("expected failure");
  });
  const afterFailure = enqueueSerial(queue, () => events.push("after-failure"));
  let rejected = false;
  try {
    await failed;
  } catch {
    rejected = true;
  }
  await afterFailure;
  await drainSerialQueue(queue);
  expect(rejected).toBe(true);
  expect(events.at(-1)).toBe("after-failure");
});
