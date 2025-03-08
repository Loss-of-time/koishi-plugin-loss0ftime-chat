import { Context, Schema, h, Logger, Session, Element } from "koishi";
import { MessageHolder } from "./utils";
import { Message, OpenAIResponse } from "./utils";
import { fetch, ProxyAgent, Response } from "undici";
import { log } from "console";
import { config } from "process";

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

  isProxy: boolean;
  proxyUrl: string;

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
      .role("textarea")
      .default(
        "你是被部署于即时通讯软件的聊天机器人，在群聊中多条消息以<at id={userId}/>: {content} ...... 格式给出。群聊中使用 <at id={userId}/> 称呼用户，私聊中只包含{content}。"
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
    isProxy: Schema.boolean().default(false),
    proxyUrl: Schema.string().default("http://localhost:7890"),
    isLog: Schema.boolean().default(false),
  }),
]);

export let logger = new Logger(name);
export let messageHolderMap: Map<string, MessageHolder> = new Map();

export function apply(ctx: Context, config: Config) {
  if (config.isLog === true) {
    logger.level = Logger.DEBUG;
  } else {
    logger.level = Logger.INFO;
  }

  ctx.on("message", async (session) => {
    const mh = getMH(session, config);

    const content = processMessage(session);
    logger.debug("content: ", content);

    mh.addMessage({
      role: "user",
      content: `<at id="${session.userId}"/>: ` + content,
    });

    if (!isReply(session, config)) return;

    logger.debug("chatting...");
    const messages = [...mh.mergeMessage()] as Message[];
    logger.debug("messagees: ", messages);
    const response = await getApiResponse(messages, config);

    if (!response.ok) {
      session.send(`请求失败: ${response.status} ${response.statusText}`);
      mh.clearMessage();
      return;
    }

    const reply = await parseApiResponse(response);
    logger.debug("reply: ", reply);

    mh.addMessage({
      role: "assistant",
      content: reply,
    });

    session.send(h.quote(session.messageId) + reply);
  });
}

function getMH(session: Session, config: Config): MessageHolder {
  const key = session.guildId
    ? `gruop-${session.userId}`
    : `user-${session.guildId}`;

  if (!messageHolderMap.has(key)) {
    messageHolderMap.set(key, new MessageHolder(config));
  }
  const mh = messageHolderMap.get(key)!;
  return mh;
}

function processMessage(session: Session): string {
  if (!session?.elements?.length) return "";

  const processedElements = session.elements.flatMap((element) => {
    switch (element.type) {
      case "text":
      case "at":
        return [element];
      case "img":
        return [h.text("[图片]")];
      case "face":
        return [h.text("[表情]")];
      default:
        return [];
    }
  });

  return processedElements.join("");
}

function isReply(session: Session, config: Config): boolean {
  if (session.content.startsWith(".ask")) return true;
  if (session.stripped.hasAt && session.stripped.atSelf) return true;
  if (config.isRandomReply) {
    for (const whilteId of config.randomReplyWhiteList) {
      const randomNumber = Math.random();
      if (
        whilteId === session.guildId &&
        randomNumber < config.randomReplyFrequency
      ) {
        return true;
      }
    }
  }
  return false;
}

async function getApiResponse(
  messages: Message[],
  config: Config
): Promise<Response> {
  const fetchOptions: any = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    }),
  };

  if (config.isProxy) {
    fetchOptions.dispatcher = new ProxyAgent(config.proxyUrl);
  }

  const response = await fetch(config.apiUrl, fetchOptions);
  return response;
}

async function parseApiResponse(res: Response): Promise<string> {
  const data = (await res.json()) as OpenAIResponse;
  const reply = data.choices[0]?.message?.content?.trim();
  return reply;
}
