import { generateResponse } from "./model.js";
import { SYSTEM_PROMPT } from "./prompts.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
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

    // ─────────────────────────────
    // CORS
    // ─────────────────────────────

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // ─────────────────────────────
    // HEALTH CHECK
    // ─────────────────────────────

    if (
      request.method === "GET" &&
      url.pathname === "/health"
    ) {
      return json({
        success: true,
        service: "bertho-ai",
        status: "online"
      });
    }

    // ─────────────────────────────
    // DIRECT AI TEST
    // ─────────────────────────────

    if (
      request.method === "GET" &&
      url.pathname === "/test-ai"
    ) {
      try {
        const result = await generateResponse(env, [
          {
            role: "user",
            content:
              "Réponds simplement : Bonjour, Bertho AI est opérationnelle."
          }
        ]);

        return json({
          success: true,
          result
        });

      } catch (error) {
        console.error(
          "TEST AI ERROR:",
          error
        );

        return json(
          {
            success: false,
            error:
              error.message ||
              String(error)
          },
          500
        );
      }
    }

    // ─────────────────────────────
    // CHAT
    // ─────────────────────────────

    if (
      request.method === "POST" &&
      url.pathname === "/chat"
    ) {
      try {
        const body =
          await request.json();

        if (
          !body.message ||
          typeof body.message !== "string"
        ) {
          return json(
            {
              success: false,
              error: "message_required"
            },
            400
          );
        }

        const history =
          Array.isArray(body.history)
            ? body.history
            : [];

        const messages = [
          {
            role: "system",
            content: SYSTEM_PROMPT
          },

          ...history,

          {
            role: "user",
            content: body.message
          }
        ];

        const result =
          await generateResponse(
            env,
            messages
          );

        return json({
          success: true,
          message:
            result.response || result
        });

      } catch (error) {
        console.error(
          "AI REQUEST ERROR:",
          error
        );

        return json(
          {
            success: false,
            error:
              error.message ||
              "ai_request_failed"
          },
          500
        );
      }
    }

    // ─────────────────────────────
    // ROUTE NOT FOUND
    // ─────────────────────────────

    return json(
      {
        success: false,
        error: "route_not_found"
      },
      404
    );
  }
};