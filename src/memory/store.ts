import type { ChatMessage } from "../types.js";

export interface ConversationStore {
  /** Most recent messages (oldest first) for one conversation, at most `historyLimit`. */
  getHistory(platform: string, userId: string): Promise<ChatMessage[]>;
  /** Append messages and trim the conversation to `historyLimit`. */
  append(platform: string, userId: string, messages: ChatMessage[]): Promise<void>;
  /**
   * Idempotency guard for webhook redeliveries. Returns true the first time an
   * id is seen, false afterwards.
   */
  markEventSeen(eventId: string): Promise<boolean>;
  close(): Promise<void>;
}
