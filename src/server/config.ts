import { resolve } from "node:path";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WEB_ORIGIN: z.url().default("http://localhost:5173"),
  DATABASE_PATH: z.string().min(1).default("./data/proofflow.sqlite"),
  STORAGE_PATH: z.string().min(1).default("./data/private"),
  META_API_BASE_URL: z.url().default("https://api.meta.ai/v1"),
  MODEL_API_KEY: z.string().optional(),
  FFMPEG_PATH: z.string().min(1).default("ffmpeg"),
  FFPROBE_PATH: z.string().min(1).default("ffprobe"),
});

export function loadConfig(env: Record<string, string | undefined> = process.env) {
  const values = envSchema.parse(env);
  return {
    ...values,
    DATABASE_PATH: values.DATABASE_PATH === ":memory:" ? ":memory:" : resolve(values.DATABASE_PATH),
    STORAGE_PATH: resolve(values.STORAGE_PATH),
    modelConfigured: Boolean(values.MODEL_API_KEY?.trim() && values.MODEL_API_KEY !== "replace-with-your-own-key"),
  };
}

export type Config = ReturnType<typeof loadConfig>;
