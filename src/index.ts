import "dotenv/config";
import { Ankeeta } from "./ankeeta.js";
import { createApp } from "./app.js";
import { configWarnings, loadConfig } from "./config.js";
import { InstagramGraphSender } from "./instagram/graph.js";
import { createLLMClient } from "./llm.js";
import { log } from "./logger.js";
import { createStore } from "./memory/index.js";
import { BackgroundQueue } from "./queue.js";
import { WhatsAppCloudSender } from "./whatsapp/graph.js";

async function main(): Promise<void> {
  const config = loadConfig();
  for (const w of configWarnings(config)) log.warn(w);

  const store = await createStore(config.memory);
  const queue = new BackgroundQueue();
  const ankeeta = new Ankeeta(createLLMClient(config.llm), store, { greeting: config.greeting });

  const app = createApp({
    config,
    ankeeta,
    store,
    queue,
    instagramSender: new InstagramGraphSender(config.instagram),
    whatsappSender: new WhatsAppCloudSender(config.whatsapp),
    // linkedinAdapter: new MyApprovedPartnerAdapter(...)  // see src/linkedin/partnerAdapter.ts
  });

  const server = app.listen(config.port, () => {
    log.info(`${config.botName} is listening`, { port: config.port });
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("shutting down", { signal });
    server.close();
    await queue.drain(10_000);
    await store.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
