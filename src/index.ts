import { Context, Schema, h } from "koishi";
import { ChatBot } from "./utils";
export const name = "chat";

export interface Config {
  apiKey: string;
  apiUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  maxMessages: number;
  systemPrompt: string;
}

export const Config: Schema<Config> = Schema.object({
  apiKey: Schema.string().description("OpenAI API密钥").required(),
  apiUrl: Schema.string()
    .description("OpenAI API地址（可修改为代理地址）")
    .default("https://api.openai.com/v1/chat/completions"),
  model: Schema.string().description("使用的模型").default("gpt-3.5-turbo"),
  temperature: Schema.number()
    .description("回复的随机性 (0-2)")
    .default(0.7)
    .min(0)
    .max(2),
  maxMessages: Schema.number().description("最大消息数").default(20).min(1),
  maxTokens: Schema.number()
    .description("最大生成令牌数")
    .default(2000)
    .min(50),
  systemPrompt: Schema.string()
    .description("AI系统提示词（定义AI的角色和行为）")
    .default("你是一个友好的AI助手，请用简短、礼貌的方式回答问题。"),
});

export function apply(ctx: Context, config: Config) {
  let chatBotMap: Map<string, ChatBot> = new Map();
  ctx
    .command("chat <message:text>", "与AI聊天")
    .action(async ({ session }, message) => {
      // <是否为群聊， 群号/用户ID>
      const key = `${session.guildId ? "group" : "user"}:${
        session.guildId || session.userId
      }`;

      if (!chatBotMap.has(key)) {
        chatBotMap.set(key, new ChatBot(config));
      }
      const chatBot = chatBotMap.get(key)!;

      // 直接使用 addMessage 方法来处理消息
      // 该方法会自动处理连续相同角色消息的情况
      await chatBot.addMessage({
        role: "user",
        content: message,
      });

      const response = await chatBot.chat();
      return response;
    });

  // 修改群聊消息监听逻辑 - 记录所有消息但不自动回复
  ctx.on("message", async (session) => {
    // 只处理群聊消息
    if (!session.guildId) return;

    const key = `group:${session.guildId}`;

    if (!chatBotMap.has(key)) {
      chatBotMap.set(key, new ChatBot(config));
    }
    const chatBot = chatBotMap.get(key)!;

    // 获取消息内容
    let content = session.content;

    // 如果消息为空，则忽略
    if (!content.trim()) return;

    // 使用addMessage方法，它会处理连续消息的情况
    await chatBot.addMessage({
      role: "user",
      content: content,
    });

    // 不自动生成回复
  });
}
