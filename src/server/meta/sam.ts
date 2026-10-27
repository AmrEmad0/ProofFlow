import { parseVideoStream, recordsOfKind } from "@meta-sam/parser";
import type OpenAI from "openai";
import type { ResponseCreateParamsStreaming } from "openai/resources/responses/responses";
import { z } from "zod";
import { MODELS } from "./client";

export async function segmentVideo(client: OpenAI, fileId: string, concept: string) {
  const nounPhrase = z.string().trim().min(1).max(120).parse(concept);
  // Meta extends the OpenAI wire protocol with input_video. Keep the assertion
  // at this transport boundary, rather than weakening shared application types.
  const request = {
    model: MODELS.sam,
    input: [{ role: "user", content: [
      { type: "input_text", text: nounPhrase },
      { type: "input_video", file_id: fileId },
    ] }],
    stream: true,
    metadata: { mask_encoding: "one_bit", include_confidence: "true" },
  };
  const stream = await client.responses.create(request as unknown as ResponseCreateParamsStreaming);
  const result = await parseVideoStream(stream).finalResult;
  // The worker validates the result after retaining diagnostics privately.
  return { ...result, boxes: recordsOfKind(result.records, "box") };
}
