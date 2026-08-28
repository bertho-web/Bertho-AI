/**
 * bertho-ai/src/index.js
 * Point d'entrée officiel du Worker Bertho AI (Liaison Audit, Modèles Dynamiques & Contexte).
 */

import { generateResponse } from "./model.js";
import { buildSystemPrompt } from "./prompts.js";
import { isAuthorized } from "./auth.js";

import {
  createContext,
  buildContextInstructions
} from "./context.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
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

    // ============================================================
    // CORS PREFLIGHT
    // ============================================================

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // ============================================================
    // AUTHENTICATION
    // ============================================================

    if (!isAuthorized(request, env)) {
      return json(
        {
          success: false,
          error: "unauthorized"
        },
        401
      );
    }

    // ============================================================
    // HEALTH
    // ============================================================

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

    // ============================================================
    // TEST AI
    // ============================================================

    if (
      request.method === "GET" &&
      url.pathname === "/test-ai"
    ) {
      try {
        const result = await generateResponse(env, [
          {
            role: "user",
            content:
              "Réponds simplement : Bertho AI est opérationnelle."
          }
        ], "turbo");

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

    // ============================================================
    // CHAT
    // ============================================================

    if (
      request.method === "POST" &&
      url.pathname === "/chat"
    ) {
      try {

        const body =
          await request.json();

        // --------------------------------------------------------
        // CONTEXT
        // --------------------------------------------------------

        const context =
          createContext(body);

        // --------------------------------------------------------
        // MESSAGE VALIDATION
        // --------------------------------------------------------

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

        // --------------------------------------------------------
        // HISTORY
        // --------------------------------------------------------

        const history =
          Array.isArray(body.history)
            ? body.history
            : [];

        // --------------------------------------------------------
        // DÉTECTION ET APPEL AUTOMATIQUE DE L'AUDIT DE SITE WEB
        // --------------------------------------------------------

        let auditDataText = "";
        const urlMatch = body.message.match(/https?:\/\/[^\s]+/i);

        if (urlMatch && env.BERTHO_AI_AUDIT) {
          try {
            const targetUrl = urlMatch[0];
            const auditReq = new Request("https://bertho-ai-audit.internal/audit", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${env.BERTHO_AI_SECRET}`
              },
              body: JSON.stringify({ url: targetUrl })
            });

            const auditRes = await env.BERTHO_AI_AUDIT.fetch(auditReq);
            if (auditRes.ok) {
              const rawAudit = await auditRes.json();
              if (rawAudit && rawAudit.content) {
                // Injection des données HTML réelles du site pour le modèle
                auditDataText = `\n\n[DONNÉES BRUTES RÉELLES DU SITE AUDITÉ (${targetUrl})]\n${rawAudit.content.substring(0, 12000)}\n[FIN DES DONNÉES DU SITE]`;
              }
            }
          } catch (e) {
            console.warn('[Audit Bridge Warning]:', e);
          }
        }

        // --------------------------------------------------------
        // SYSTEM PROMPT & INSTRUCTIONS
        // --------------------------------------------------------

        const systemPrompt =
          buildSystemPrompt(
            context.product,
            context
          );

        const contextInstructions =
          buildContextInstructions(
            context
          );

        // --------------------------------------------------------
        // FINAL MESSAGES
        // --------------------------------------------------------

        const messages = [

          {
            role: "system",
            content:
              systemPrompt +
              "\n\n" +
              contextInstructions
          },

          ...history,

          {
            role: "user",
            content:
              body.message + auditDataText
          }

        ];

        // --------------------------------------------------------
        // ROUTAGE DYNAMIQUE DU MODÈLE (TURBO / NEURAL / GAMING)
        // --------------------------------------------------------

        const requestedModel =
          context.model ||
          body.model ||
          (body.context && body.context.model) ||
          "turbo";

        const result =
          await generateResponse(
            env,
            messages,
            requestedModel
          );

        // --------------------------------------------------------
        // RESPONSE
        // --------------------------------------------------------

        return json({

          success: true,

          message:
            result.response ||
            result,

          context

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

    // ============================================================
    // ROUTE NOT FOUND
    // ============================================================

    return json(
      {
        success: false,
        error: "route_not_found"
      },
      404
    );
  }
};