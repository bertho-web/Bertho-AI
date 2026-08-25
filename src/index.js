import { generateResponse } from "./model.js";
import { SYSTEM_PROMPT } from "./prompts.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({
        success: true,
        service: "bertho-ai",
        status: "online"
      });
    }

    if (request.method === "POST" && url.pathname === "/chat") {
      try {
        const body = await request.json();

        if (!body.message) {
          return Response.json(
            {
              success: false,
              error: "message_required"
            },
            { status: 400 }
          );
        }

        const messages = [
          {
            role: "system",
            content: SYSTEM_PROMPT
          },
          ...(body.history || []),
          {
            role: "user",
            content: body.message
          }
        ];

        const result = await generateResponse(env, messages);

        return Response.json({
          success: true,
          message: result.response || result
        });

      } catch (error) {
        return Response.json(
          {
            success: false,
            error: "ai_request_failed"
          },
          { status: 500 }
        );
      }
    }

    return Response.json(
      {
        success: false,
        error: "route_not_found"
      },
      { status: 404 }
    );
  }
};