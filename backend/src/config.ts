import "dotenv/config";
import { z } from "zod";

const booleanEnv = z.enum(["true", "false"]).default("false").transform((value) => value === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65535).default(3001),
  FRONTEND_ORIGIN: z.string().default("http://localhost:3000,https://jarvisbyak-pack.github.io"),
  OAUTH_FRONTEND_ORIGIN: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  DB_POOL_MAX: z.coerce.number().int().positive().max(100).default(10),
  WORKER_POLL_MS: z.coerce.number().int().positive().default(1000),
  WORKER_STALE_TASK_MS: z.coerce.number().int().positive().default(300000),
  AUTH_SESSION_DAYS: z.coerce.number().int().positive().max(30).default(7),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  GITHUB_OAUTH_CLIENT_ID: z.string().optional(),
  GITHUB_OAUTH_CLIENT_SECRET: z.string().optional(),
  GITHUB_OAUTH_REDIRECT_URI: z.string().url().optional(),
  FILE_STORAGE_DIR: z.string().min(1).default("./storage"),
  FILE_MAX_BYTES: z.coerce.number().int().positive().max(52428800).default(10485760),
  CODE_WORKSPACE_ROOT: z.string().min(1).default("."),
  CODE_ALLOWED_COMMANDS: z.string().default("npm test,npm run build"),
  CODE_COMMAND_TIMEOUT_MS: z.coerce.number().int().positive().max(600000).default(120000),
  CODE_MAX_OUTPUT_BYTES: z.coerce.number().int().positive().max(5000000).default(500000),
  FRIDAY_ALLOW_CODE_EXECUTION: booleanEnv,
  AI_PROVIDER: z.enum(["gemini", "openrouter"]).default("gemini"),
  GEMINI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().min(1).default("z-ai/glm-4.6"),
  GEMINI_MODEL: z.string().min(1).default("gemini-3.8-flash"),
  GEMINI_FALLBACK_MODEL: z.string().min(1).default("gemini-3.7-flash"),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_API_URL: z.string().url().default("https://api.github.com"),
  FIRECRAWL_API_KEY: z.string().optional(),
  FIRECRAWL_API_URL: z.string().url().default("https://api.firecrawl.dev/v2"),
  FRIDAY_ALLOW_GITHUB_MUTATIONS: booleanEnv,
  FIRECRAWL_SEARCH_TIMEOUT_MS: z.coerce.number().int().positive().max(60000).default(20000)
});

export const config = envSchema.parse(process.env);
