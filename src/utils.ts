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
          messages: this.messages,
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("OpenAI API错误:", error);
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
      console.error("Error in chat:", error);
      throw error;
    }
  }

  getLastMessageRole(): string | null {
    if (this.messages.length === 0) return null;
    return this.messages[this.messages.length - 1].role;
  }

  async addMessage(message: Message) {
    // 检查是否与上一条消息角色相同
    const lastRole = this.getLastMessageRole();

    if (lastRole === message.role && message.role !== "system") {
      // 如果角色相同且不是system消息，则合并消息内容
      const lastMessage = this.messages[this.messages.length - 1];
      lastMessage.content += "\n" + message.content;
    } else {
      // 角色不同或是system消息，直接添加
      this.messages.push(message);
    }

    // 检查消息数是否超过上限
    if (this.messages.length > this.config.maxMessages) {
      const removeCount = this.messages.length - this.config.maxMessages;
      this.messages.splice(1, removeCount);
    }
  }
}
