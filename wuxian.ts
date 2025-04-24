import { serve } from "https://deno.land/std@0.220.1/http/server.ts";

const UNLIMITED_AI_URL = "https://app.unlimitedai.chat/api/chat";
const PORT = 3000;
const MAX_RETRIES = 3;

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

function convertOpenAIToUnlimitedMessages(messages: OpenAIMessage[]): UnlimitedAIMessage[] {
  const systemMessages = messages.filter(msg => msg.role === "system");
  const nonSystemMessages = messages.filter(msg => msg.role !== "system");
  
  const result: UnlimitedAIMessage[] = [];
  
  if (systemMessages.length > 0) {
    const systemContent = systemMessages.map(msg => msg.content).join("\n\n");
    
    result.push({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      role: "user",
      content: systemContent,
      parts: [{ type: "text", text: systemContent }],
    });
    
    result.push({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      role: "assistant",
      content: "Ok, I got it, I'll remember it and do it.",
      parts: [{ type: "text", text: "Ok, I got it, I'll remember it and do it." }],
    });
  }
  
  nonSystemMessages.forEach(msg => {
    result.push({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      role: msg.role,
      content: msg.content,
      parts: [{ type: "text", text: msg.content }],
    });
  });
  
  return result;
}

function convertOpenAIToUnlimitedBody(openaiBody: any): any {
  return {
    id: crypto.randomUUID(),
    messages: convertOpenAIToUnlimitedMessages(openaiBody.messages),
    selectedChatModel: openaiBody.model || "chat-model-reasoning",
  };
}

async function* transformStreamResponse(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<string> {
  let buffer = "";
  const decoder = new TextDecoder();
  let messageId = crypto.randomUUID();
  let hasContentStarted = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        yield "data: [DONE]\n\n";
        break;
      }
      
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
          try {
            const obj = JSON.parse(val);
            messageId = obj.messageId || messageId;
          } catch {}
        } 
        
        const contentChunk = key === "g" || key === "0" ? val.replace(/\\n/g, "\n") : "";
        if (contentChunk) {
          const delta = key === "g" && !hasContentStarted 
            ? { role: "assistant", content: contentChunk }
            : { content: contentChunk };
          
          const chunk = {
            id: messageId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: "chat-model-reasoning",
            choices: [{
              delta,
              index: 0,
              finish_reason: null,
            }],
          };
          
          yield `data: ${JSON.stringify(chunk)}\n\n`;
          hasContentStarted = true;
        }
        
        if (key === "e" || key === "d") {
          yield "data: [DONE]\n\n";
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function handleChatCompletions(
  openaiBody: any,
  isStream: boolean,
  retryCount = 0
): Promise<Response> {
  try {
    const unlimitedBody = convertOpenAIToUnlimitedBody(openaiBody);
    
    const upstreamHeaders = {
      "Host": "app.unlimitedai.chat",
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (X11; Windows x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    };
    
    const upstreamRes = await fetch(UNLIMITED_AI_URL, {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify(unlimitedBody),
    });
    
    if (!upstreamRes.ok) {
      if (upstreamRes.status >= 500 && retryCount < MAX_RETRIES) {
        return handleChatCompletions(openaiBody, isStream, retryCount + 1);
      }
      throw new Error(`Chat completion failed: ${upstreamRes.status}`);
    }
    
    if (isStream) {
      const reader = upstreamRes.body?.getReader();
      if (!reader) throw new Error("Failed to get reader");
      
      const stream = new ReadableStream({
        async start(controller) {
          for await (const chunk of transformStreamResponse(reader)) {
            controller.enqueue(new TextEncoder().encode(chunk));
          }
          controller.close();
        }
      });
      
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } else {
      const responseData = await upstreamRes.json();
      
      return new Response(JSON.stringify({
        id: responseData.messageId || crypto.randomUUID(),
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "chat-model-reasoning",
        choices: [{
          message: {
            role: "assistant",
            content: responseData.content,
          },
          finish_reason: "stop",
        }],
      }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      return handleChatCompletions(openaiBody, isStream, retryCount + 1);
    }
    return new Response(
      JSON.stringify({ error: "Internal server error", message: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
}

async function handler(req: Request): Promise<Response> {
  // ... [保持原有CORS和路由逻辑不变，仅在非流式处理处调用新的响应转换]
}

serve(handler, { port: PORT });
