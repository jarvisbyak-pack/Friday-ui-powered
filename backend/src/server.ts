import { createApi } from "./api.js";
import { config } from "./config.js";
import { migrate } from "./db/migrate.js";
import { checkDatabase, pool } from "./db/pool.js";
import { PostgresTaskRepository } from "./tasks/task-repository.js";
import { TaskWorker } from "./tasks/task-worker.js";

const app = createApi();
const worker = new TaskWorker(
  new PostgresTaskRepository(),
  config.WORKER_POLL_MS,
  config.WORKER_STALE_TASK_MS
);

async function start(): Promise<void> {
  await checkDatabase();
  await migrate();

  const server = app.listen(config.PORT, () => {
    console.log(`Friday backend listening on port ${config.PORT}`);
  });
  worker.start();

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}; shutting down.`);
    worker.stop();
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

start().catch(error => {
  console.error("Friday backend failed to start:", error);
  process.exit(1);
});
