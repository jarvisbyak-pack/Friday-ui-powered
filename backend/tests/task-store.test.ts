import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryTaskStore } from "../src/tasks/task-store.js";

test("creates a queued task and retrieves it", () => {
  const store = new InMemoryTaskStore();
  const task = store.create("test", { hello: "world" });

  assert.equal(task.state, "queued");
  assert.equal(store.get(task.id)?.id, task.id);
});

test("updates task state", () => {
  const store = new InMemoryTaskStore();
  const task = store.create("test", {});

  const updated = store.updateState(task.id, "completed", {
    result: { ok: true }
  });

  assert.equal(updated?.state, "completed");
  assert.deepEqual(updated?.result, { ok: true });
});
