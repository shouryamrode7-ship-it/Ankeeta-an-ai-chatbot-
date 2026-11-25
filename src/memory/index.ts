import type { Config } from "../config.js";
import { log } from "../logger.js";
import { createRedisStore } from "./redis.js";
import { SqliteStore } from "./sqlite.js";
import type { ConversationStore } from "./store.js";

export type { ConversationStore } from "./store.js";

/** Redis when REDIS_URL is set, otherwise SQLite. */
export async function createStore(config: Config["memory"]): Promise<ConversationStore> {
  if (config.redisUrl) {
    log.info("using redis conversation store");
    return createRedisStore(config.redisUrl, config.historyLimit);
  }
  log.info("using sqlite conversation store", { path: config.databasePath });
  return new SqliteStore(config.databasePath, config.historyLimit);
}
