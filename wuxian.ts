// No external imports needed for Deno.serve

const LANGTAIL_API_URL = "https://app.langtail.com/api/playground";

// Hardcoded models in OpenAI format
const OPENAI_MODELS = {
  object: "list",
  data: [
    // OpenAI Models
    { id: "o3", object: "model", created: 0, owned_by: "openai", permission: [] },
    { id: "o4-mini", object: "model", created: 0, owned_by: "openai", permission: [] },
    { id: "o1", object: "model", created: 0, owned_by: "openai", permission: [] },
    { id: "o1-preview", object: "model", created: 0, owned_by: "openai", permission: [] },
    { id: "o1-mini", object: "model", created: 0, owned_by: "openai", permission: [] },
    { id: "o3-mini", object: "model", created: 0, owned_by: "openai", permission: [] },
    { id: "gpt-4.1", object: "model", created: 0, owned_by: "openai", permission: [] },
    { id: "gpt-4.1-mini", object: "model", created: 0, owned_by: "openai", permission: [] },
    { id: "gpt-4.1-nano", object: "model", created: 0, owned_by: "openai", permission: [] },
    { id: "gpt-4.5-preview", object: "model", created: 0, owned_by: "openai", permission: [] },
    { id: "gpt-4o", object: "model", created: 0, owned_by: "openai", permission: [] },
    { id: "gpt-4o-mini", object: "model", created: 0, owned_by: "openai", permission: [] },
    { id: "gpt-4o-2024-08-06", object: "model", created: 0, owned_by: "openai", permission: [] },
    { id: "gpt-4-turbo", object: "model", created: 0, owned_by: "openai", permission: [] },
    { id: "gpt-4", object: "model", created: 0, owned_by: "openai", permission: [] },
    { id: "gpt-3.5-turbo", object: "model", created: 0, owned_by: "openai", permission: [] },

    // Anthropic Models
    { id: "anthropic:claude-3-7-sonnet-latest", object: "model", created: 0, owned_by: "anthropic", permission: [] },
    { id: "anthropic:claude-3-7-sonnet-20250219", object: "model", created: 0, owned_by: "anthropic", permission: [] },
    { id: "anthropic:claude-3-5-haiku-latest", object: "model", created: 0, owned_by: "anthropic", permission: [] },
    { id: "anthropic:claude-3-opus-20240229", object: "model", created: 0, owned_by: "anthropic", permission: [] },
    { id: "anthropic:claude-3-sonnet-20240229", object: "model", created: 0, owned_by: "anthropic", permission: [] },
    { id: "anthropic:claude-3-haiku-20240307", object: "model", created: 0, owned_by: "anthropic", permission: [] },
    { id: "anthropic:claude-3-5-sonnet-20240620", object: "model", created: 0, owned_by: "anthropic", permission: [] },
    { id: "anthropic:claude-3-5-sonnet-latest", object: "model", created: 0, owned_by: "anthropic", permission: [] },

    // Google Models
    { id: "google:gemini-2.5-flash-preview-04-17", object: "model", created: 0, owned_by: "google", permission: [] },
    { id: "google:gemini-2.5-pro-preview-03-25", object: "model", created: 0, owned_by: "google", permission: [] },
    { id: "google:gemini-2.5-pro-exp-03-25", object: "model", created: 0, owned_by: "google", permission: [] },
    { id: "google:gemini-2.0-flash", object: "model", created: 0, owned_by: "google", permission: [] },
    { id: "google:gemini-2.0-flash-lite-preview-02-05", object: "model", created: 0, owned_by: "google", permission: [] },
    { id: "google:gemini-2.0-flash-thinking-exp-01-21", object: "model", created: 0, owned_by: "google", permission: [] },
    { id: "google:gemini-2.0-pro-exp-02-05", object: "model", created: 0, owned_by: "google", permission: [] },
    { id: "google:gemini-1.5-flash-8b", object: "model", created: 0, owned_by: "google", permission: [] },
    { id: "google:gemini-1.5-flash", object: "model", created: 0, owned_by: "google", permission: [] },
    { id: "google:gemini-1.5-flash-001", object: "model", created: 0, owned_by: "google", permission: [] },
    { id: "google:gemini-1.5-flash-002", object: "model", created: 0, owned_by: "google", permission: [] },
    { id: "google:gemini-1.5-pro", object: "model", created: 0, owned_by: "google", permission: [] },
    { id: "google:gemini-2.0-flash-exp", object: "model", created: 0, owned_by: "google", permission: [] },
    { id: "google:gemini-exp-1206", object: "model", created: 0, owned_by: "google", permission: [] },
  ].map(model => ({
    ...model,
    created: Math.floor(Date.now() / 1000), // Use current timestamp for created
    permission: [{
      id: `modelperm-${Math.random().toString(36).substring(2, 15)}`, // Generate a random ID
      object: "model_permission",
      created: Math.floor(Date.now() / 1000),
      allow_create_engine: true,
      allow_sampling: true,
      allow_logprobs: true,
      allow_search_indices: true,
      allow_view: true,
      allow_fine_tuning: false,
      organization: "*",
      group: null,
      is_blocking: false,
    }]
  }))
};

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // Check for supported prefixes
  const isSupportedPath = path === "/" || path === "/v1" || path === "/v1/chat/completions" || path === "/v1/models";

  if (!isSupportedPath) {
    return new Response("Not Found", { status: 404 });
  }

  // Handle models endpoint
  if (path === "/v1/models") {
    return new Response(JSON.stringify(OPENAI_MODELS), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Handle chat completions endpoint
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let cookies: string | undefined;
  let organizationId: string | undefined;
  let projectId: string | undefined;

  try {
    // Extract cookies and project info from the custom header
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response("Missing or invalid Authorization header. Use Bearer <__Host-authjs.csrf-token>;;<next-auth.session-token>;;<organizationId>;;<projectId>", { status: 401 });
    }

    const authParts = authHeader.substring(7).split(";;");
    if (authParts.length !== 4) {
      return new Response("Invalid Authorization header format. Use Bearer <__Host-authjs.csrf-token>;;<next-auth.session-token>;;<organizationId>;;<projectId>", { status: 400 });
    }

    const csrfToken = authParts[0];
    const sessionToken = authParts[1];
    organizationId = authParts[2];
    projectId = authParts[3];

    cookies = `__Host-authjs.csrf-token=${csrfToken}; next-auth.session-token=${sessionToken}`;

  } catch (error) {
    console.error("Error parsing auth header:", error);
    return new Response("Error processing Authorization header", { status: 400 });
  }

  try {
    const openaiPayload = await request.json();

    // Transform OpenAI payload to Langtail payload
    const langtailPayload = {
      llm: {
        messages: openaiPayload.messages,
        model: openaiPayload.model || "anthropic:claude-3-7-sonnet-latest", // Default model
        temperature: openaiPayload.temperature ?? 0.5,
        max_tokens: openaiPayload.max_tokens ?? 4000,
        top_p: openaiPayload.top_p ?? 1,
        presence_penalty: openaiPayload.presence_penalty ?? 0,
        frequency_penalty: openaiPayload.frequency_penalty ?? 0,
        stream: openaiPayload.stream ?? false,
      },
      organizationId: organizationId,
      projectId: projectId,
      variables: {}, // Assuming no variables are passed in this setup
    };

    const headers = new Headers(request.headers);
    headers.set("Content-Type", "application/json");
    if (cookies) {
      headers.set("Cookie", cookies);
    }
    // Remove the custom Authorization header
    headers.delete("Authorization");

    const langtailResponse = await fetch(LANGTAIL_API_URL, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(langtailPayload),
    });

    // Langtail's response is already in OpenAI format, so we can return it directly
    return langtailResponse;

  } catch (error) {
    console.error("Error processing request or fetching from Langtail:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

// Use Deno.serve directly
Deno.serve({ port: 8000 }, handleRequest);
