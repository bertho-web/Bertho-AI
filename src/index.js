import { generateResponse } from "./model.js";
import { SYSTEM_PROMPT } from "./prompts.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://bertho-ai.pages.dev",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: corsHeaders
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }
    
    // Health check
    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        success: true,
        service: "bertho-ai",
        status: "online"
      });
    }
if (request.method === "GET" && url.pathname === "/test-ai") {
  try {
    const result = await generateResponse(env, [
      {
        role: "user",
        content: "Réponds simplement : Bonjour, Bertho AI est opérationnelle."
      }
    ]);

    return json({
      success: true,
      result
    });

  } catch (error) {
    console.error("TEST AI ERROR:", error);

    return json(
      {
        success: false,
        error: error.message || String(error)
      },
      500
    );
  }
}
    // Chat
    if (request.method === "POST" && url.pathname === "/chat") {
      try {
        const body = await request.json();
        
        if (!body.message || typeof body.message !== "string") {
          return json(
            {
              success: false,
              error: "message_required"
            },
            400
          );
        }
        
        const messages = [
          {
            role: "system",
            content: SYSTEM_PROMPT
          },
          ...(Array.isArray(body.history) ? body.history : []),
          {
            role: "user",
            content: body.message
          }
        ];
        
        const result = await generateResponse(env, messages);
        
        return json({
          success: true,
          message: result.response || result
        });
        
      } catch (error) {
        console.error("AI request failed:", error);
        
        return json(
          {
            success: false,
            error: "ai_request_failed"
          },
          500
        );
      }
    }
    
    // Route inconnue
    return json(
      {
        success: false,
        error: "route_not_found"
      },
      404
    );
  }
};