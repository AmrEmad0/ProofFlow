import { describe, expect, test } from "bun:test";
import OpenAI from "openai";
import { z } from "zod";
import { hashContract } from "../src/server/engine/contract";
import { analyzeVideo } from "../src/server/meta/muse";
import { segmentVideo } from "../src/server/meta/sam";
import { draftPlan } from "../src/server/planner/draft";
import { packproofTemplate } from "../src/shared/packproof";

function fixtureClient(response: () => Response, inspect: (body: Record<string, unknown>) => void = () => {}) {
  return new OpenAI({
    apiKey: "local-test-only",
    baseURL: "https://models.example/v1",
    maxRetries: 0,
    fetch: async (_url, init) => {
      inspect(z.record(z.string(), z.unknown()).parse(JSON.parse(String(init?.body))));
      return response();
    },
  });
}

function chatResponse(value: unknown) {
  return () => Response.json({ id: "chat-fixture", object: "chat.completion", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(value) } }] });
}

const approved = { ...packproofTemplate, approvedVersionId: crypto.randomUUID(), contractHash: hashContract(packproofTemplate) };

function videoResponse(stepId: string) {
  return () => Response.json({
    id: "response-fixture", object: "response", status: "completed",
    output: [{ id: "message-fixture", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", annotations: [], text: JSON.stringify({
      candidates: [{ stepId, startMs: 100, endMs: 300, visibleBefore: "Product outside", visibleAfter: "Occluded", observation: "Product moves toward opening", ambiguities: ["Insertion occluded"] }],
      omissions: [],
    }) }] }],
  });
}

function samResponse(terminal: "response.completed" | "response.incomplete") {
  // Complete box + mask record from the parser's documented protocol fixture.
  const text = '<0f>1<|box;x1=211;y1=228;x2=270;y2=254;w=320;h=334;c=0.9|>'
    + "<|mask;x=0;y=0;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>\n";
  const lane = { item_id: "message-fixture", output_index: 0, content_index: 0 };
  const events = [
    { type: "response.output_text.delta", ...lane, delta: text },
    { type: "response.output_text.done", ...lane, text },
    { type: terminal },
  ];
  return () => new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
}

describe("Meta adapters with local transport fixtures", () => {
  test("drafts use Muse and Chat Completions response_format, then enforce domain rules", async () => {
    const client = fixtureClient(chatResponse({ plan: packproofTemplate, rejectionReason: null }), (body) => {
      expect(body.model).toBe("muse-spark-1.3-contributor");
      expect(body).toHaveProperty("response_format");
      expect(body).not.toHaveProperty("text");
    });
    expect(await draftPlan(client, "Show the box being packed")).toEqual(packproofTemplate);
    const invalid = { ...packproofTemplate, steps: [packproofTemplate.steps[0], packproofTemplate.steps[0]] };
    await expect(draftPlan(fixtureClient(chatResponse({ plan: invalid, rejectionReason: null })), "Pack a box")).rejects.toThrow();
  });

  test("rejects an unobservable goal response instead of inventing a plan", async () => {
    const client = fixtureClient(chatResponse({ plan: null, rejectionReason: "Internal damage is not visible" }));
    await expect(draftPlan(client, "Prove the hidden contents are undamaged")).rejects.toThrow("observable");
  });

  test("Muse video requests reuse a file ID with Responses text.format and reject unknown step IDs", async () => {
    const client = fixtureClient(videoResponse("insert-product"), (body) => {
      expect(body.model).toBe("muse-spark-1.3-contributor");
      expect(body).toHaveProperty("text.format");
      expect(body).not.toHaveProperty("response_format");
      expect(JSON.stringify(body.input)).toContain('"type":"input_file","file_id":"file-shared"');
    });
    const result = await analyzeVideo(client, "file-shared", approved);
    expect(result.candidates[0]?.ambiguities).toEqual(["Insertion occluded"]);
    await expect(analyzeVideo(fixtureClient(videoResponse("unknown-step")), "file-shared", approved)).rejects.toThrow("unknown");
  });

  test("SAM video extension survives the SDK and parser preserves boxes, frames, raw output, and outcome", async () => {
    const client = fixtureClient(samResponse("response.completed"), (body) => {
      expect(body.model).toBe("sam-3.1");
      expect(body.stream).toBe(true);
      expect(body.metadata).toEqual({ mask_encoding: "one_bit", include_confidence: "true" });
      expect(JSON.stringify(body.input)).toContain('"type":"input_video","file_id":"file-shared"');
    });
    const result = await segmentVideo(client, "file-shared", "cardboard box");
    expect(result.outcome.status).toBe("completed");
    expect(result.boxes[0]?.objectId).toBe("1");
    expect(result.boxes[0]?.frame?.frameIndex).toBe(0);
    expect(result.rawOutput).toContain("<0f>");
    expect(result.diagnostics).toEqual([]);
    const incomplete = await segmentVideo(fixtureClient(samResponse("response.incomplete")), "file-shared", "cardboard box");
    expect(incomplete.outcome).toMatchObject({ status: "incomplete", reason: "response" });
    expect(incomplete.boxes).toEqual(result.boxes);
    expect(incomplete.rawOutput).toBe(result.rawOutput);
  });
});
