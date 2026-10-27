import { createReadStream } from "node:fs";
import type OpenAI from "openai";

// Upload the normalized copy once, reuse its ID for Muse and every SAM concept.
// The verification worker deletes the remote file after saving artifacts.
export async function uploadVideo(client: OpenAI, normalizedPath: string) {
  return client.files.create({ file: createReadStream(normalizedPath), purpose: "user_data" });
}

export async function deleteVideo(client: OpenAI, fileId: string): Promise<void> {
  await client.files.delete(fileId);
}
