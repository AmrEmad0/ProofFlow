import { join } from "node:path";
import { z } from "zod";
import type { Config } from "../config";

export function runDirectory(config: Pick<Config, "STORAGE_PATH">, id: string): string {
  return join(config.STORAGE_PATH, "runs", z.uuid().parse(id));
}
