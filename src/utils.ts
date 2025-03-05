import { type Config, logger } from "./index";

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

export class ChatBot {
  messages: Message[];

  constructor(private config: Config) {
    this.messages = [];
    this.messages.push({
      role: "system",
      content: config.systemPrompt,
    });
  }

  async chat(): Promise<string> {
    logger.debug("Chating...");

    try {
      // 调用OpenAI API
      const response = await fetch(this.config.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: this.mergeMessage(),
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error("OpenAI API错误:", error);
        this.clearMessage();
        return `API调用失败: ${response.status} ${response.statusText}`;
      }

      const data = (await response.json()) as OpenAIResponse;
      const reply = data.choices[0]?.message?.content?.trim();

      this.addMessage({
        role: "assistant",
        content: reply,
      });

      return reply;
    } catch (error) {
      logger.error("Error in chat:", error);
      this.clearMessage();
      throw error;
    }
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

    return mergedMessages;
  }

  getLastMessageRole(): string | null {
    if (this.messages.length === 0) return null;
    return this.messages[this.messages.length - 1].role;
  }

  async addMessage(message: Message) {
    this.messages.push(message);
    // 检查消息数是否超过上限
    if (this.messages.length > this.config.maxMessages) {
      const removeCount = this.messages.length - this.config.maxMessages;
      this.messages.splice(1, removeCount);
    }
  }

  clearMessage() {
    this.messages = [] as Message[];
  }
}
