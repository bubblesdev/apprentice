import { serve } from "@hono/node-server";
import { withoutBlankValues } from "@apprentice/core";
import { ApiEnv, createRuntime } from "./runtime.js";

const env = ApiEnv.parse(withoutBlankValues(process.env));
const runtime = await createRuntime(env);
const server = serve({ fetch: runtime.app.fetch, port: env.PORT }, (info) => {
  console.log(`Apprentice API on http://localhost:${info.port} (Meta adapters: ${runtime.mode})`);
});
runtime.injectWebSocket(server);
const seeded = await runtime.seed();
if (seeded) console.log(`Building the recorded guide "${seeded}" from fixtures`);
