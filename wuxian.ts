import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
const TARGET_URL_BASE = "https://rad.huddlz.xyz"
console.log(`代理服务器启动，目标服务器: ${TARGET_URL_BASE}`);
console.log("监听 http://localhost:8000");
serve(async (req: Request) => {
  console.log(`接收到请求: ${req.method} ${req.url}`);
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    console.warn("请求缺少 Authorization 标头");
    return new Response("Forbidden: Authorization header is required.", {
      status: 403,
    });
  }
  const apiKey = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
  const url = new URL(req.url);
  const targetUrl = new URL(url.pathname + url.search, TARGET_URL_BASE);
  const outgoingHeaders = new Headers(req.headers);
  outgoingHeaders.delete("Authorization");
  outgoingHeaders.set("X-API-Key", apiKey);
  outgoingHeaders.delete("Host");
  console.log(`转发请求至: ${targetUrl.toString()}`);
  try {
    const proxyResponse = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: outgoingHeaders,
      body: req.body,
      redirect: "manual",
    });
    console.log(
      `收到目标服务器响应: ${proxyResponse.status} ${proxyResponse.statusText}`,
    );
    const responseHeaders = new Headers(proxyResponse.headers);
    return new Response(proxyResponse.body, {
      status: proxyResponse.status,
      statusText: proxyResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("转发请求时出错:", error);
    return new Response("Proxy error: Could not reach target server.", {
      status: 502,
    });
  }
});
