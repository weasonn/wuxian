import { serve } from "https://deno.land/std@0.220.1/http/server.ts";

// --- 常量定义 ---
const UNLIMITED_AI_URL = "https://app.unlimitedai.chat/api/chat";
const PORT = 3000;
const MODEL_ID = "chat-model-reasoning"; // 模型ID常量

// UnlimitedAI 响应键常量 (提高可读性)
const UNLIMITED_AI_KEYS = {
  MESSAGE_ID: 'f',
  REASONING: 'g',
  CONTENT: '0',
  END_STREAM: 'e',
  DONE_STREAM: 'd', // 假设 'd' 也是结束标记之一
};

// 通用响应头
const COMMON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

const STREAM_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
  "Access-Control-Allow-Origin": "*",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

// --- 接口定义 ---
interface UnlimitedAIMessage {
  id: string;
  createdAt: string;
  role: string;
  content: string;
  parts: Array<{ type: string; text: string }>;
}

interface OpenAIMessage {
  role: string;
  content: string;
}

// --- 辅助函数 ---

/** 创建标准 JSON 响应 */
function jsonResponse(body: any, status = 200, headers: Record<string, string> = COMMON_HEADERS): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

/** 创建错误响应 */
function errorResponse(message: string, status = 500): Response {
  console.error(`Error (Status ${status}): ${message}`);
  return jsonResponse({ error: { message, type: "proxy_error", code: status } }, status);
}

/** 生成 UnlimitedAI 消息结构 */
function createUnlimitedMessage(role: string, content: string): UnlimitedAIMessage {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    role,
    content,
    parts: [{ type: "text", text: content }],
  };
}

/** 将 OpenAI 消息列表转换为 UnlimitedAI 格式 */
function convertOpenAIToUnlimitedMessages(messages: OpenAIMessage[]): UnlimitedAIMessage[] {
  const systemMessages = messages.filter(msg => msg.role === "system");
  const nonSystemMessages = messages.filter(msg => msg.role !== "system");
  const result: UnlimitedAIMessage[] = [];

  if (systemMessages.length > 0) {
    const systemContent = systemMessages.map(msg => msg.content).join("\n\n");
    result.push(createUnlimitedMessage("user", systemContent));
    // 固定回复，用于模拟助手已理解系统指令
    result.push(createUnlimitedMessage("assistant", "Ok, I got it, I'll remember it and do it."));
  }

  nonSystemMessages.forEach(msg => {
    result.push(createUnlimitedMessage(msg.role, msg.content));
  });

  return result;
}

/** 将 OpenAI 请求体转换为 UnlimitedAI 请求体 */
function convertOpenAIToUnlimitedBody(openaiBody: any): any {
  return {
    id: openaiBody.id || crypto.randomUUID(),
    messages: convertOpenAIToUnlimitedMessages(openaiBody.messages),
    selectedChatModel: openaiBody.model || MODEL_ID, // 使用常量
  };
}

/**
 * 解析 UnlimitedAI 的单行响应
 * @returns [key, value] 或 null (如果行无效)
 */
function parseUnlimitedAILine(line: string): [string, string] | null {
    if (!line.trim()) return null;
    const idx = line.indexOf(":");
    if (idx === -1) return null;

    const key = line.slice(0, idx);
    let val = line.slice(idx + 1).trim();
    // 移除可能的引号包装
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    // 解码换行符
    val = val.replace(/\\n/g, "\n");
    return [key, val];
}

/** 处理 UnlimitedAI 流式响应并转换为 OpenAI SSE 格式 */
async function* transformStreamResponse(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<string> {
  let buffer = "";
  const decoder = new TextDecoder();
  let messageId = "";
  let roleSent = false; // 跟踪是否已发送包含 role 的第一个块

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break; // 在循环结束后发送 [DONE]

      buffer += decoder.decode(value, { stream: true });
      let lines = buffer.split("\n");
      buffer = lines.pop() || ""; // 保留可能不完整的最后一行

      for (const line of lines) {
        const parsed = parseUnlimitedAILine(line);
        if (!parsed) continue;

        const [key, val] = parsed;
        let chunkDelta: Record<string, any> | null = null;

        switch (key) {
          case UNLIMITED_AI_KEYS.MESSAGE_ID:
            try {
              const obj = JSON.parse(val); // ID 字段的值通常是 JSON
              messageId = obj.messageId || crypto.randomUUID();
            } catch (e) {
              console.error("Error parsing messageId JSON:", e, "Raw value:", val);
              messageId = crypto.randomUUID(); // Fallback
            }
            break;

          case UNLIMITED_AI_KEYS.REASONING:
            // 思考过程作为 reasoning_content 发送
            chunkDelta = { reasoning_content: val };
            if (!roleSent) {
                chunkDelta.role = "assistant"; // 仅在第一个有效块中添加 role
                roleSent = true;
            }
            break;

          case UNLIMITED_AI_KEYS.CONTENT:
            // 最终内容作为 content 发送
            chunkDelta = { content: val };
             if (!roleSent) {
                chunkDelta.role = "assistant"; // 如果先收到 content，也添加 role
                roleSent = true;
            }
            break;

          case UNLIMITED_AI_KEYS.END_STREAM:
          case UNLIMITED_AI_KEYS.DONE_STREAM:
             // 这些标记表示流结束，直接跳出内层循环，在 finally 中发送 [DONE]
             reader.releaseLock(); // 提前释放锁
             return; // 结束生成器
        }

        if (chunkDelta) {
          const chunk = {
            id: messageId || crypto.randomUUID(), // 确保有 ID
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: MODEL_ID,
            choices: [
              {
                delta: chunkDelta,
                index: 0,
                finish_reason: null,
              },
            ],
          };
          yield `data: ${JSON.stringify(chunk)}\n\n`;
        }
      }
    }
  } catch (error) {
    console.error("Stream transformation error:", error);
    // 错误发生时也尝试发送 DONE
  } finally {
    yield "data: [DONE]\n\n"; // 确保最后发送 [DONE]
    if (!reader.closed) {
        try {
            reader.releaseLock(); // 确保锁被释放
        } catch (e) {
            // 忽略释放锁时可能出现的错误（例如已经被释放）
        }
    }
  }
}

/** 转换 UnlimitedAI 非流式响应为 OpenAI 格式 */
async function transformNonStreamResponse(text: string): Promise<any> {
  const lines = text.split("\n");
  const data: Record<string, any> = {};
  let messageId = crypto.randomUUID(); // Default ID

  for (const line of lines) {
    const parsed = parseUnlimitedAILine(line);
    if (!parsed) continue;
    const [key, val] = parsed;

    if (key === UNLIMITED_AI_KEYS.MESSAGE_ID) {
        try {
            const obj = JSON.parse(val);
            messageId = obj.messageId || messageId;
        } catch (e) {
             console.error("Error parsing messageId JSON:", e, "Raw value:", val);
        }
        data[key] = val; // 仍然存储原始值或解析后的对象
    } else {
        data[key] = val; // 存储解析和处理后的值
    }
  }

  const content = data[UNLIMITED_AI_KEYS.CONTENT];
  const reasoning_content = data[UNLIMITED_AI_KEYS.REASONING];

  return {
    id: messageId,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: MODEL_ID,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          reasoning_content, // 可能为 undefined
          content,         // 可能为 undefined
        },
        finish_reason: "stop", // 假设非流式总是 stop
      },
    ],
    usage: { // Usage 信息无法从 UnlimitedAI 获取，保持为 0
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

// --- 核心处理逻辑 ---

/** 处理聊天完成请求 */
async function handleChatCompletions(
  openaiBody: any,
  isStream: boolean
): Promise<Response> {
  try {
    const unlimitedBody = convertOpenAIToUnlimitedBody(openaiBody);

    const upstreamRes = await fetch(UNLIMITED_AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" }, // 只需 Content-Type
      body: JSON.stringify(unlimitedBody),
    });

    if (!upstreamRes.ok) {
      const errorBody = await upstreamRes.text();
      console.error(`Upstream request failed: ${upstreamRes.status}`, errorBody);
      return errorResponse(`Upstream request failed with status ${upstreamRes.status}: ${errorBody}`, upstreamRes.status);
    }

    if (isStream) {
      const reader = upstreamRes.body?.getReader();
      if (!reader) {
        return errorResponse("Failed to get response body reader from upstream", 500);
      }

      const transformedStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of transformStreamResponse(reader)) {
              controller.enqueue(new TextEncoder().encode(chunk));
            }
            controller.close();
          } catch (error) {
            console.error("Stream transformation error during ReadableStream start:", error);
            // 尝试向客户端发送错误信号可能比较困难，因为流可能已经开始
            // controller.error(error); // 这可能会中断客户端连接
            controller.close(); // 或者只是关闭流
          }
        },
        cancel(reason) {
            console.log("Stream cancelled:", reason);
            reader.cancel(reason).catch(e => console.error("Error cancelling reader:", e));
        }
      });

      return new Response(transformedStream, { headers: STREAM_HEADERS });

    } else {
      const text = await upstreamRes.text();
      const transformedResponse = await transformNonStreamResponse(text);
      return jsonResponse(transformedResponse); // 使用辅助函数
    }
  } catch (error) {
    // 处理 fetch 本身的错误或其他意外错误
    return errorResponse(error.message || "Internal server error", 500);
  }
}

// --- 主请求处理程序 ---
async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // CORS 预检请求
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    // 模型列表接口
    if (path === "/v1/models" && req.method === "GET") {
      return jsonResponse({ // 使用辅助函数
        object: "list",
        data: [
          {
            id: MODEL_ID, // 使用常量
            object: "model",
            created: Math.floor(Date.now() / 1000), // 使用当前时间戳
            owned_by: "unlimitedai", // 可以自定义
            permission: [/* ... 权限可以保持不变或简化 ... */],
            root: MODEL_ID,
            parent: null,
          },
        ],
      });
    }

    // 聊天完成接口
    else if (path === "/v1/chat/completions" && req.method === "POST") {
        try {
            const openaiBody = await req.json();
            const isStream = openaiBody.stream === true;
            return await handleChatCompletions(openaiBody, isStream);
        } catch (e) {
            // 处理 JSON 解析错误
            return errorResponse("Invalid JSON request body", 400);
        }
    }

    // 未找到路由
    else {
      return errorResponse("Endpoint not found", 404); // 使用辅助函数
    }
  } catch (error) {
    // 捕获 handler 级别的意外错误
    return errorResponse(error.message || "Internal server error", 500);
  }
}

// --- 启动服务器 ---
console.log(`Starting OpenAI proxy for UnlimitedAI on http://localhost:${PORT}`);
serve(handler, { port: PORT });