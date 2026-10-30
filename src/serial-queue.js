export function enqueueSerial(queue, operation) {
  const task = (queue.current ?? Promise.resolve()).then(operation);
  queue.current = task.catch(() => {});
  return task;
}

export async function drainSerialQueue(queue) {
  while (true) {
    const pending = queue.current ?? Promise.resolve();
    await pending;
    if (pending === queue.current) return;
  }
}
