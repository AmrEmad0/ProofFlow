import { loadConfig } from "../src/server/config";
import { createMetaClient, MODELS } from "../src/server/meta/client";
import { verificationError } from "../src/server/meta/errors";

const config = loadConfig();
console.info("Meta configuration", {
  defaultEndpoint: config.META_API_BASE_URL.replace(/\/+$/, "") === "https://api.meta.ai/v1",
  keyConfigured: config.modelConfigured,
  museModel: MODELS.muse,
  samModel: MODELS.sam,
});

try {
  const client = createMetaClient(config).withOptions({ timeout: 20_000, maxRetries: 0 });
  const probes: Record<string, () => Promise<unknown>> = {
    models: async () => {
      const available = (await client.models.list()).data.map(model => model.id);
      console.info("Meta model listing", { museListed: available.includes(MODELS.muse), samListed: available.includes(MODELS.sam) });
    },
    // Listing a model does not prove this key can invoke it. Probes contain no user data.
    planning: async () => {
      const stream = await client.chat.completions.create({ model: MODELS.muse,
        messages: [{ role: "user", content: "Reply OK." }], stream: true,
        reasoning_effort: "minimal", max_completion_tokens: 64,
      });
      try { for await (const _chunk of stream) { /* drain without logging response content */ } }
      finally { stream.controller.abort(); }
    },
    analysis: () => client.responses.create({ model: MODELS.muse, input: "Reply OK.",
      reasoning: { effort: "minimal" }, max_output_tokens: 64,
    }),
  };
  await Promise.all(Object.entries(probes).map(async ([operation, probe]) => {
    try { await probe(); console.info("Meta diagnostic", { operation, ok: true }); }
    catch (error) {
      process.exitCode = 1;
      console.warn("Meta diagnostic", { operation, ok: false, ...verificationError(error, config.MODEL_API_KEY) });
    }
  }));
} catch (error) {
  process.exitCode = 1;
  console.warn("Meta diagnostic unavailable", verificationError(error, config.MODEL_API_KEY));
}
