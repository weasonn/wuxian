import { Hono } from "jsr:@hono/hono@^4.7.6";
import { streamSSE } from "jsr:@hono/hono@^4.7.6/streaming";

const app = new Hono();

// 工具：OpenAI -> UnlimitedAI.Chat 消息格式转换
function openaiToUnlimitedMessages(messages) {
  return messages
    .filter((msg) => msg.role !== "system")
    .map((msg) => ({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      role: msg.role,
      content: msg.content,
      parts: [{ type: "text", text: msg.content }],
    }));
}

// 工具：OpenAI -> UnlimitedAI.Chat 请求体转换
function openaiToUnlimitedBody(openaiBody) {
  return {
    id: openaiBody.id || crypto.randomUUID(),
    messages: openaiToUnlimitedMessages(openaiBody.messages),
    selectedChatModel: openaiBody.model || "chat-model-reasoning",
    // 你可以根据需要添加更多字段映射
  };
}

app.post("/v1/chat/completions", async (c) => {
  // 1. 解析 OpenAI 请求
  const openaiBody = await c.req.json();
  const isStream = openaiBody.stream === true;
  // 只转发必要 headers
  const upstreamHeaders = {
    "content-type": "application/json",
    // 你可以根据需要转发 Authorization 等
  };
  // 2. 转换为 UnlimitedAI.Chat 请求体
  const unlimitedBody = openaiToUnlimitedBody(openaiBody);

  // 3. 转发到 UnlimitedAI.Chat
  const upstreamRes = await fetch("https://app.unlimitedai.chat/api/chat", {
    method: "POST",
    headers: upstreamHeaders,
    body: JSON.stringify(unlimitedBody),
  });

  if (isStream) {
    // 4.1 流式响应（SSE）
    return streamSSE(c, async (stream) => {
      const reader = upstreamRes.body?.getReader();
      if (!reader) {
        await stream.write("data: [DONE]\n\n");
        return;
      }
      let buffer = "";
      const decoder = new TextDecoder();
      let messageId = "";
      let firstResult = true;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const idx = line.indexOf(":");
          if (idx === -1) continue;
          const key = line.slice(0, idx);
          let val = line.slice(idx + 1).trim();
          if (val.startsWith('"') && val.endsWith('"')) {
            val = val.slice(1, -1);
          }
          if (key === "f") {
            // 记录 messageId
            try {
              const obj = JSON.parse(val);
              messageId = obj.messageId || "";
            } catch {}
          } else if (key === "g") {
            const delta = firstResult
              ? {
                  role: "assistant",
                  reasoning_content: val.replace(/\\n/g, "\n"),
                }
              : { reasoning_content: val.replace(/\\n/g, "\n") };
            // 思考过程
            const chunk = {
              id: messageId || "",
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: "chat-model-reasoning",
              choices: [
                {
                  delta,
                  index: 0,
                  finish_reason: null,
                },
              ],
            };
            await stream.write(`data: ${JSON.stringify(chunk)}\n\n`);
          } else if (key === "0") {
            // 最终结果
            const delta = { content: val.replace(/\\n/g, "\n") };
            const chunk = {
              id: messageId || "",
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: "chat-model-reasoning",
              choices: [
                {
                  delta,
                  index: 0,
                  finish_reason: null,
                },
              ],
            };
            await stream.write(`data: ${JSON.stringify(chunk)}\n\n`);
            firstResult = false;
          } else if (key === "e" || key === "d") {
            // 结束
            await stream.write("data: [DONE]\n\n");
          }
        }
      }
      await stream.write("data: [DONE]\n\n");
    });
  } else {
    // 4.2 非流式响应
    const text = await upstreamRes.text();
    const lines = text.split("\n");
    const data: Record<string, any> = {};
    for (const line of lines) {
      if (!line.trim()) continue;
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const key = line.slice(0, idx);
      let val = line.slice(idx + 1).trim();
      try {
        val = JSON.parse(val);
      } catch {}
      data[key] = val;
    }
    // 优先用 0 字段，其次 g 字段
    const content = data["0"] || data.g || "";
    return c.json({
      id: data.f?.messageId || crypto.randomUUID(),
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "chat-model-reasoning",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content,
          },
          finish_reason: "stop",
        },
      ],
    });
  }
});

app.get("/v1/models", (c) => {
  return c.json({
    object: "list",
    data: [
      {
        id: "chat-model-reasoning",
        object: "model",
        created: 0,
        owned_by: "unlimitedai",
        permission: [],
      },
    ],
  });
});

Deno.serve(app.fetch);
