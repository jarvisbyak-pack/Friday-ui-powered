import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { config } from "../config.js";

export type CodeExecutionResult = {
  command: string[];
  cwd: string;
  exitCode: number | null;
  signal?: string;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

function allowedCommands(): string[] {
  return config.CODE_ALLOWED_COMMANDS.split(",").map(value => value.trim()).filter(Boolean);
}

function assertAllowed(command: string[]): void {
  if (!config.FRIDAY_ALLOW_CODE_EXECUTION) {
    throw new Error("Code execution is disabled. Set FRIDAY_ALLOW_CODE_EXECUTION=true only when authorized.");
  }
  const normalized = command.join(" ").trim();
  if (!normalized || !allowedCommands().includes(normalized)) {
    throw new Error(`Command is not allowed. Allowed commands: ${allowedCommands().join(", ")}`);
  }
}

function isWithin(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return relativePath === "" || (!relativePath.startsWith(".." + sep) && relativePath !== ".." && !isAbsolute(relativePath));
}

export class CodeExecutionService {
  async run(command: string[], cwd?: string, timeoutMs?: number): Promise<CodeExecutionResult> {
    if (!Array.isArray(command) || command.length === 0 || command.some(part => typeof part !== "string" || part.length > 4096)) {
      throw new Error("command must be a non-empty string array.");
    }
    assertAllowed(command);

    const root = await realpath(resolve(config.CODE_WORKSPACE_ROOT));
    const workdir = await realpath(resolve(root, cwd ?? "."));
    if (!isWithin(root, workdir)) {
      throw new Error("Working directory must remain inside CODE_WORKSPACE_ROOT.");
    }

    const timeout = Math.min(Math.max(Math.trunc(timeoutMs ?? config.CODE_COMMAND_TIMEOUT_MS), 1000), config.CODE_COMMAND_TIMEOUT_MS);
    const [executable, ...args] = command;

    return new Promise((resolvePromise, reject) => {
      const child = spawn(executable!, args, { cwd: workdir, shell: false, windowsHide: true });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let settled = false;

      const append = (target: "stdout" | "stderr", chunk: Buffer) => {
        const value = chunk.toString("utf8");
        if (target === "stdout") stdout = (stdout + value).slice(-config.CODE_MAX_OUTPUT_BYTES);
        else stderr = (stderr + value).slice(-config.CODE_MAX_OUTPUT_BYTES);
      };

      child.stdout.on("data", chunk => append("stdout", chunk));
      child.stderr.on("data", chunk => append("stderr", chunk));

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeout);

      child.once("error", error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });

      child.once("close", (exitCode, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolvePromise({
          command,
          cwd: workdir,
          exitCode,
          ...(signal ? { signal } : {}),
          stdout,
          stderr,
          timedOut
        });
      });
    });
  }
}
