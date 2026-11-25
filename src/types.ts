export type Channel = "instagram" | "linkedin" | "whatsapp" | "web";
export type Role = "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface LLMRequest {
  system: string;
  messages: ChatMessage[];
  channel: Channel;
  maxTokens?: number;
}

export interface LLMClient {
  complete(request: LLMRequest): Promise<string>;
}
