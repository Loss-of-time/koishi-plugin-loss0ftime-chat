import { Context, Schema, h, Logger, Type } from "koishi";
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

  isRandomReply: boolean;
  randomReplyFrequency: number;
  randomReplyWhiteList: string[];

  isLog: boolean;
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
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
      .default(
        "你是被部署于即时通讯软件的聊天机器人，在群聊中多条消息以 {userId}: {content}\n ...... 格式给出。如果你要at某位用户请输出 <at id={userId}/>，私聊中只包含{content}。 "
      ),
    isRandomReply: Schema.boolean().default(false),
    randomReplyFrequency: Schema.number()
      .min(0)
      .max(1)
      .default(0)
      .description("自动响应群消息的几率"),
    randomReplyWhiteList: Schema.array(Schema.string())
      .default([])
      .description("在哪些群聊中使用自动响应（QQ中使用QQ群号）"),
  }),
  Schema.object({
    isLog: Schema.boolean().default(false),
  }),
]);

export let logger = new Logger(name);

export function apply(ctx: Context, config: Config) {
  let chatBotMap: Map<string, ChatBot> = new Map();

  if (config.isLog === true) {
    logger.level = Logger.DEBUG;
  } else {
    logger.level = Logger.INFO;
  }

  // ctx
  //   .command("chat <message:text>", "与AI聊天")
  //   .action(async ({ session }, message) => {
  //     // <是否为群聊， 群号/用户ID>
  //     const key = `${session.guildId ? "group" : "user"}:${
  //       session.guildId || session.userId
  //     }`;
  //     if (session.guildId) {
  //       message = `${session.userId}` + message;
  //     }
  //     if (!chatBotMap.has(key)) {
  //       chatBotMap.set(key, new ChatBot(config));
  //     }
  //     const chatBot = chatBotMap.get(key)!;
  //     await chatBot.addMessage({
  //       role: "user",
  //       content: message,
  //     });
  //     const response = await chatBot.chat();
  //     return response;
  //   });

  ctx.on("message", async (session) => {
    logger.debug("session.content", session.content);

    // 只处理群聊消息
    if (!session.guildId) return;

    const uId = session.userId;
    const key = `group:${session.guildId}`;
    logger.debug("key:" + key);

    if (!chatBotMap.has(key)) {
      chatBotMap.set(key, new ChatBot(config));
    }
    const chatBot = chatBotMap.get(key)!;

    // 记录所有群聊消息
    await chatBot.addMessage({
      role: "user",
      content: `${uId}: ` + session.content,
    });
    logger.debug("messages: ", chatBot.messages);

    const isReply = () => {
      // 是否@机器人
      if (session.stripped.hasAt && session.stripped.atSelf) return true;

      // 是否随机发言
      if (config.isRandomReply) {
        for (const whilteId of config.randomReplyWhiteList) {
          const randomNumber = Math.random();
          if (
            whilteId === session.guildId &&
            randomNumber < config.randomReplyFrequency
          ) {
            logger.debug(
              `${randomNumber} < ${config.randomReplyFrequency} so reply.`
            );
            return true;
          }
        }
      }
      return false;
    };

    if (isReply()) {
      const response = await chatBot.chat();
      session.send(h.quote(session.messageId) + response);
    }
  });
}
