const express = require('express');
const { v4: uuidv4 } = require('uuid');
const app = express();

// 中间件
app.use(express.json());
app.use(express.text());

// 认证中间件 - 使用全局变量加载方式
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const authMiddleware = (req, res, next) => {
  if (AUTH_TOKEN) {
    const requestToken = req.headers.authorization || '';
    const token = requestToken.replace('Bearer ', '');
    if (token !== AUTH_TOKEN) {
      return res.status(401).send('Access Denied');
    }
  }
  next();
};

// 工具：OpenAI -> UnlimitedAI.Chat 消息格式转换
function openaiToUnlimitedMessages(messages) {
  return messages
    .filter((msg) => msg.role !== "system")
    .map((msg) => ({
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      role: msg.role,
      content: msg.content,
      parts: [{ type: "text", text: msg.content }],
    }));
}

// 工具：OpenAI -> UnlimitedAI.Chat 请求体转换
function openaiToUnlimitedBody(openaiBody) {
  return {
    id: openaiBody.id || uuidv4(),
    messages: openaiToUnlimitedMessages(openaiBody.messages),
    selectedChatModel: openaiBody.model || "chat-model-reasoning",
    // 你可以根据需要添加更多字段映射
  };
}

// 处理聊天请求
app.post('/v1/chat/completions', authMiddleware, async (req, res) => {
  try {
    // 1. 解析 OpenAI 请求
    const openaiBody = req.body;
    const isStream = openaiBody.stream === true;
    
    // 只转发必要 headers
    const upstreamHeaders = {
      "content-type": "application/json",
      // 你可以根据需要转发 Authorization 等
    };
    
    // 2. 转换为 UnlimitedAI.Chat 请求体
    const unlimitedBody = openaiToUnlimitedBody(openaiBody);

    // 3. 转发到 UnlimitedAI.Chat
    const response = await fetch("https://app.unlimitedai.chat/api/chat", {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify(unlimitedBody),
    });

    if (!response.ok) {
      throw new Error(`UnlimitedAI.Chat API responded with status: ${response.status}`);
    }

    if (isStream) {
      // 4.1 流式响应（SSE）
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const reader = response.body;
      if (!reader) {
        res.write("data: [DONE]\n\n");
        return res.end();
      }

      // 处理流
      try {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
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
              } catch (e) {
                console.error("Error parsing messageId:", e);
              }
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
              
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
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
              
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
              firstResult = false;
            } else if (key === "e" || key === "d") {
              // 结束
              res.write("data: [DONE]\n\n");
            }
          }
        }
        
        // 确保最后发送结束标记
        res.write("data: [DONE]\n\n");
        res.end();
      } catch (error) {
        console.error("Stream processing error:", error);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      }
    } else {
      // 4.2 非流式响应
      const text = await response.text();
      const lines = text.split("\n");
      const data = {};
      
      for (const line of lines) {
        if (!line.trim()) continue;
        const idx = line.indexOf(":");
        if (idx === -1) continue;
        
        const key = line.slice(0, idx);
        let val = line.slice(idx + 1).trim();
        try {
          val = JSON.parse(val);
        } catch (e) {
          // 如果解析失败，保留原始字符串
        }
        data[key] = val;
      }
      
      // 优先用 0 字段，其次 g 字段
      const content = data["0"] || data.g || "";
      
      res.json({
        id: data.f?.messageId || uuidv4(),
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
  } catch (error) {
    console.error("Error in chat completions:", error);
    res.status(500).json({ 
      error: {
        message: error.message,
        type: "server_error",
        param: null,
        code: "internal_server_error"
      }
    });
  }
});

// 获取模型列表端点
app.get('/v1/models', authMiddleware, (req, res) => {
  try {
    res.json({
      object: "list",
      data: [
        {
          id: "chat-model-reasoning",
          object: "model",
          created: Math.floor(Date.now() / 1000),
          owned_by: "unlimitedai",
          permission: [],
        },
      ],
    });
  } catch (error) {
    console.error("Error in models endpoint:", error);
    res.status(500).json({ 
      error: {
        message: error.message,
        type: "server_error",
        param: null,
        code: "internal_server_error"
      }
    });
  }
});

// 根路径响应
app.all('*', (req, res) => {
  res.json({
    status: "Running...",
    message: "UnlimitedAI.Chat API Proxy"
  });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`UnlimitedAI.Chat API Proxy running on port ${PORT}`);
});
