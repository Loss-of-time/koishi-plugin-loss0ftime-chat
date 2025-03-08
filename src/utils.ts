import { type Config } from "./index";

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenAIResponse {
  choices: {
    message: {
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    total_tokens: number;
  };
}

export class MessageHolder {
  messages: Message[];
  maxMessages: number;

  constructor(config: Config) {
    this.messages = [] as Message[];
    this.messages[0] = {
      role: "system",
      content: config.systemPrompt,
    };
    this.maxMessages = config.maxMessages;
  }

  mergeMessage() {
    const messages = this.messages;
    const mergedMessages = [] as Message[];

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const lastMessage = mergedMessages[mergedMessages.length - 1];

      if (lastMessage && lastMessage.role === message.role) {
        lastMessage.content += "\n" + message.content;
      } else {
        mergedMessages.push(message);
      }
    }

    if (mergedMessages.length > 1 && mergedMessages[1].role === "assistant") {
      mergedMessages.splice(1, 1);
    }

    return mergedMessages;
  }

  getLastMessageRole(): string | null {
    if (this.messages.length === 0) return null;
    return this.messages[this.messages.length - 1].role;
  }

  addMessage(message: Message) {
    this.messages.push(message);
    // 检查消息数是否超过上限
    if (this.messages.length > this.maxMessages) {
      const removeCount = this.messages.length - this.maxMessages;
      this.messages.splice(1, removeCount);
    }
  }

  clearMessage() {
    this.messages = [] as Message[];
  }
}
