import fs from "node:fs";
import path from "node:path";
// Built into Node >= 22.13 – no native compilation needed (works on Windows without build tools).
import { DatabaseSync } from "node:sqlite";
import type { ChatMessage } from "../types.js";
import type { ConversationStore } from "./store.js";

const SEEN_TTL_MS = 24 * 60 * 60 * 1000;

export class SqliteStore implements ConversationStore {
  private readonly db: DatabaseSync;

  constructor(
    dbPath: string,
    private readonly historyLimit: number,
  ) {
    if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    if (dbPath !== ":memory:") this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        platform   TEXT NOT NULL,
        user_id    TEXT NOT NULL,
        role       TEXT NOT NULL CHECK (role IN ('user','assistant')),
        content    TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages (platform, user_id, id);
      CREATE TABLE IF NOT EXISTS seen_events (
        event_id TEXT PRIMARY KEY,
        seen_at  INTEGER NOT NULL
      );
    `);
  }

  async getHistory(platform: string, userId: string): Promise<ChatMessage[]> {
    const rows = this.db
      .prepare(
        `SELECT role, content FROM messages
         WHERE platform = ? AND user_id = ?
         ORDER BY id DESC LIMIT ?`,
      )
      .all(platform, userId, this.historyLimit) as unknown as ChatMessage[];
    return rows.map((r) => ({ role: r.role, content: r.content })).reverse();
  }

  async append(platform: string, userId: string, messages: ChatMessage[]): Promise<void> {
    if (messages.length === 0) return;
    const insert = this.db.prepare(
      `INSERT INTO messages (platform, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)`,
    );
    const trim = this.db.prepare(
      `DELETE FROM messages
       WHERE platform = ? AND user_id = ?
         AND id NOT IN (
           SELECT id FROM messages WHERE platform = ? AND user_id = ? ORDER BY id DESC LIMIT ?
         )`,
    );
    this.db.exec("BEGIN");
    try {
      const now = Date.now();
      for (const m of messages) insert.run(platform, userId, m.role, m.content, now);
      trim.run(platform, userId, platform, userId, this.historyLimit);
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  async markEventSeen(eventId: string): Promise<boolean> {
    const now = Date.now();
    this.db.prepare(`DELETE FROM seen_events WHERE seen_at < ?`).run(now - SEEN_TTL_MS);
    const result = this.db
      .prepare(`INSERT OR IGNORE INTO seen_events (event_id, seen_at) VALUES (?, ?)`)
      .run(eventId, now);
    return Number(result.changes) === 1;
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
