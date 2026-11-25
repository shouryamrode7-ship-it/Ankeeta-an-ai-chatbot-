/**
 * CLI helper for LinkedIn replies (human copy/approval workflow).
 *
 *   npm run draft -- "Hi! Loved your post about hiking."
 *   npm run draft -- --thread priya "Thanks for connecting!"
 *   echo "incoming message" | npm run draft
 *
 * With --thread, Ankeeta remembers the conversation across invocations.
 */
import "dotenv/config";
import { Ankeeta } from "../ankeeta.js";
import { loadConfig } from "../config.js";
import { createLLMClient } from "../llm.js";
import { createStore } from "../memory/index.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let thread: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--thread") thread = args[++i];
    else rest.push(args[i] as string);
  }

  const message = (rest.join(" ") || (process.stdin.isTTY ? "" : await readStdin())).trim();
  if (!message) {
    console.error('Usage: npm run draft -- [--thread <id>] "<incoming LinkedIn message>"');
    process.exitCode = 1;
    return;
  }

  const config = loadConfig();
  if (!config.llm.apiKey) {
    console.error("LLM_API_KEY is not set (see .env.example).");
    process.exitCode = 1;
    return;
  }

  const store = await createStore(config.memory);
  try {
    const ankeeta = new Ankeeta(createLLMClient(config.llm), store, { greeting: config.greeting });
    const reply = await ankeeta.reply({
      platform: "linkedin",
      userId: thread ?? "cli",
      text: message,
      channel: "linkedin",
      remember: thread !== undefined,
    });
    console.log(`\n${reply}\n`);
  } finally {
    await store.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1; // let Node exit on its own (process.exit() triggers a libuv assertion on Windows)
});
