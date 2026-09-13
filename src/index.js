/**
 * bertho-ai/src/index.js
 *
 * Point d'entrée officiel du Worker Bertho AI
 *
 * Architecture :
 *
 * MESSAGE
 *   ↓
 * CONTEXTE + HISTORIQUE
 *   ↓
 * ORCHESTRATOR
 *   ↓
 * VALIDATION
 *   ↓
 * ACTION
 *   ├── answer            → modèle conversationnel
 *   ├── ask_clarification → clarification
 *   ├── generate_image    → BERTHO_IMAGE_AI
 *   ├── search_web        → BERTHO_SEARCH_AI
 *   ├── website_audit     → BERTHO_AI_AUDIT
 *   └── sandbox           → BERTHO_SANDBOX_AI
 */

import { generateResponse } from "./model.js";
import { buildSystemPrompt } from "./prompts.js";
import { isAuthorized } from "./auth.js";
import { BerthoAIActions } from "./actions.js";
import { createContext, buildContextInstructions } from "./context.js";
import {
  decide,
  validateDecision,
  requiresTool
} from "./orchestrator.js";

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

/**
 * Extrait une URL d'un texte lorsque l'orchestrateur
 * n'en fournit pas directement.
 */
function extractUrl(text) {
  if (!text || typeof text !== "string") return null;

  const match = text.match(/https?:\/\/[^\s"'<>]+/i);

  return match ? match[0].replace(/[),.!?]+$/, "") : null;
}

/**
 * Nettoie la réponse textuelle du modèle.
 */
function extractResponseText(result) {
  if (!result) return "";

  if (typeof result === "string") {
    return result;
  }

  if (typeof result.response === "string") {
    return result.response;
  }

  if (typeof result.message === "string") {
    return result.message;
  }

  if (
    result.message &&
    typeof result.message.response === "string"
  ) {
    return result.message.response;
  }

  if (
    result.result &&
    typeof result.result.response === "string"
  ) {
    return result.result.response;
  }

  if (typeof result.result === "string") {
    return result.result;
  }

  return JSON.stringify(result);
}

/**
 * Supprime les éventuels blocs <think> retournés
 * par certains modèles.
 */
function cleanResponseText(text) {
  if (!text || typeof text !== "string") {
    return "";
  }

  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
}

/**
 * Exécute la génération d'image décidée par l'orchestrateur.
 */
async function executeImageAction(env, decision, body, fullContext) {
  if (!env.BERTHO_IMAGE_AI) {
    throw new Error("BERTHO_IMAGE_AI non configuré.");
  }

  const prompt =
    decision.toolInput ||
    decision.objective ||
    body.message.trim();

  if (!prompt) {
    throw new Error("image_prompt_required");
  }

  const requestedSteps = Math.min(
    Math.max(parseInt(body.steps, 10) || 4, 1),
    8
  );

  const response = await env.BERTHO_IMAGE_AI.fetch(
    new Request("https://bertho-ai-image.internal/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt,
        steps: requestedSteps
      })
    })
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error || `image_service_error_${response.status}`
    );
  }

  return {
    ...data,
    steps: requestedSteps,
    context: fullContext
  };
}

/**
 * Exécute la recherche web décidée par l'orchestrateur.
 */
async function executeSearchAction(env, decision, body, fullContext) {
  if (!env.BERTHO_SEARCH_AI) {
    throw new Error("BERTHO_SEARCH_AI non configuré.");
  }

  const query =
    decision.toolInput ||
    decision.objective ||
    body.message.trim();

  if (!query) {
    throw new Error("search_query_required");
  }

  const response = await env.BERTHO_SEARCH_AI.fetch(
    new Request("https://bertho-ai-search.internal/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query
      })
    })
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error || `search_service_error_${response.status}`
    );
  }

  return {
    ...data,
    context: fullContext
  };
}

/**
 * Exécute l'audit de site décidé par l'orchestrateur.
 */
async function executeWebsiteAuditAction(
  env,
  decision,
  body,
  fullContext
) {
  if (!env.BERTHO_AI_AUDIT) {
    throw new Error("BERTHO_AI_AUDIT non configuré.");
  }

  const targetUrl =
    extractUrl(decision.toolInput) ||
    extractUrl(decision.objective) ||
    extractUrl(body.message);

  if (!targetUrl) {
    throw new Error("audit_url_required");
  }

  const auditResult =
    await BerthoAIActions.runWebsiteAudit(
      targetUrl,
      env
    );

  if (!auditResult) {
    throw new Error("website_audit_failed");
  }

  return auditResult;
}

/**
 * Exécute le sandbox décidé par l'orchestrateur.
 */
async function executeSandboxAction(
  env,
  decision,
  body,
  fullContext
) {
  if (!env.BERTHO_SANDBOX_AI) {
    throw new Error("BERTHO_SANDBOX_AI non configuré.");
  }

  const code =
    decision.toolInput ||
    body.message.trim();

  if (!code) {
    throw new Error("code_required");
  }

  const response = await env.BERTHO_SANDBOX_AI.fetch(
    new Request("https://bertho-ai-sandbox.internal/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        code,
        language: body.language || "javascript"
      })
    })
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error || `sandbox_service_error_${response.status}`
    );
  }

  return {
    ...data,
    context: fullContext
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ============================================================
    // 1. CORS PREFLIGHT
    // ============================================================

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // ============================================================
    // 2. AUTHENTICATION SERVEUR-À-SERVEUR
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
    // 3. HEALTH MONITORING
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
    // 4. TEST AI
    // ============================================================

    if (
      request.method === "GET" &&
      url.pathname === "/test-ai"
    ) {
      try {
        const result = await generateResponse(
          env,
          [
            {
              role: "user",
              content:
                "Réponds simplement : Bertho AI est opérationnelle."
            }
          ],
          "turbo"
        );

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
    // 5. ROUTE DIRECTE IMAGE
    // ============================================================

    if (
      request.method === "POST" &&
      url.pathname === "/image"
    ) {
      try {
        const body = await request.json();

        const prompt =
          body.prompt ||
          body.message;

        if (
          !prompt ||
          typeof prompt !== "string" ||
          !prompt.trim()
        ) {
          return json(
            {
              success: false,
              error: "prompt_required"
            },
            400
          );
        }

        const imageResponse =
          await env.BERTHO_IMAGE_AI.fetch(
            new Request(
              "https://bertho-ai-image.internal/",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  prompt: prompt.trim(),
                  steps: body.steps || 4
                })
              }
            )
          );

        const data =
          await imageResponse.json();

        return json(
          data,
          imageResponse.status
        );
      } catch (error) {
        return json(
          {
            success: false,
            error:
              error.message ||
              "image_service_error"
          },
          500
        );
      }
    }

    // ============================================================
    // 6. ROUTE DIRECTE RECHERCHE WEB
    // ============================================================

    if (
      request.method === "POST" &&
      url.pathname === "/search"
    ) {
      try {
        const body = await request.json();

        const query =
          body.query ||
          body.message;

        if (
          !query ||
          typeof query !== "string" ||
          !query.trim()
        ) {
          return json(
            {
              success: false,
              error: "query_required"
            },
            400
          );
        }

        const searchResponse =
          await env.BERTHO_SEARCH_AI.fetch(
            new Request(
              "https://bertho-ai-search.internal/",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  query: query.trim()
                })
              }
            )
          );

        const data =
          await searchResponse.json();

        return json(
          data,
          searchResponse.status
        );
      } catch (error) {
        return json(
          {
            success: false,
            error:
              error.message ||
              "search_service_error"
          },
          500
        );
      }
    }

    // ============================================================
    // 7. ROUTE DIRECTE SANDBOX
    // ============================================================

    if (
      request.method === "POST" &&
      url.pathname === "/sandbox"
    ) {
      try {
        const body = await request.json();

        const code =
          body.code ||
          body.script ||
          body.message;

        if (
          !code ||
          typeof code !== "string" ||
          !code.trim()
        ) {
          return json(
            {
              success: false,
              error: "code_required"
            },
            400
          );
        }

        const sandboxResponse =
          await env.BERTHO_SANDBOX_AI.fetch(
            new Request(
              "https://bertho-ai-sandbox.internal/",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  code: code.trim(),
                  language:
                    body.language ||
                    "javascript"
                })
              }
            )
          );

        const data =
          await sandboxResponse.json();

        return json(
          data,
          sandboxResponse.status
        );
      } catch (error) {
        return json(
          {
            success: false,
            error:
              error.message ||
              "sandbox_service_error"
          },
          500
        );
      }
    }

    // ============================================================
    // 8. CHAT / AGENT PRINCIPAL
    // ============================================================

    if (
      request.method === "POST" &&
      url.pathname === "/chat"
    ) {
      try {
        const body =
          await request.json();

        // --------------------------------------------------------
        // A. VALIDATION
        // --------------------------------------------------------

        if (
          !body.message ||
          typeof body.message !== "string" ||
          !body.message.trim()
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
        // B. CONTEXTE
        // --------------------------------------------------------

        const rawCtx =
          body.context &&
          typeof body.context === "object"
            ? body.context
            : {};

        const normalizedCtx =
          createContext(body);

        const resolvedImage =
          typeof body.image === "string" &&
          body.image.trim()
            ? body.image.trim()
            : typeof rawCtx.image === "string" &&
              rawCtx.image.trim()
              ? rawCtx.image.trim()
              : null;

        const fullContext = {
          ...rawCtx,
          ...normalizedCtx,
          model:
            body.model ||
            rawCtx.model ||
            "turbo",
          user:
            body.user ||
            rawCtx.user ||
            null,
          screenDetails:
            rawCtx.screenDetails ||
            null,
          triggerSource:
            body.source ||
            rawCtx.source ||
            rawCtx.triggerSource ||
            "berthoplay",
          image: resolvedImage
        };

        // --------------------------------------------------------
        // C. HISTORIQUE
        // --------------------------------------------------------

        const history =
          Array.isArray(body.history)
            ? body.history.filter(
                item =>
                  item &&
                  (
                    item.role === "user" ||
                    item.role === "assistant"
                  ) &&
                  typeof item.content === "string"
              )
            : [];

        // --------------------------------------------------------
        // D. COMPRÉHENSION / DÉCISION
        // --------------------------------------------------------

        let decision =
          await decide(env, {
            message: body.message.trim(),
            history,
            context: fullContext
          });

        decision =
          validateDecision(decision);

        console.log(
          "[Orchestrator] Decision:",
          JSON.stringify(decision)
        );

        // --------------------------------------------------------
        // E. CLARIFICATION
        // --------------------------------------------------------

        if (
          decision.action ===
          "ask_clarification"
        ) {
          return json({
            success: true,
            message:
              decision.clarificationQuestion ||
              "Pouvez-vous préciser ce que vous souhaitez ?",
            context: fullContext,
            decision: {
              intent: decision.intent,
              action: decision.action,
              confidence:
                decision.confidence
            }
          });
        }

        // --------------------------------------------------------
        // F. ACTIONS SPÉCIALISÉES
        // --------------------------------------------------------

        if (requiresTool(decision)) {

          // ======================================================
          // F1. IMAGE
          // ======================================================

          if (
            decision.action ===
            "generate_image"
          ) {
            const result =
              await executeImageAction(
                env,
                decision,
                body,
                fullContext
              );

            return json({
              success:
                result?.success !== false,
              message:
                result?.message ||
                "Voici votre création graphique.",
              generatedImage:
                result?.image ||
                result?.generatedImage ||
                null,
              steps:
                result?.steps || 4,
              context: fullContext,
              decision: {
                intent:
                  decision.intent,
                action:
                  decision.action,
                confidence:
                  decision.confidence,
                objective:
                  decision.objective
              }
            });
          }

          // ======================================================
          // F2. RECHERCHE WEB
          // ======================================================

          if (
            decision.action ===
            "search_web"
          ) {
            const result =
              await executeSearchAction(
                env,
                decision,
                body,
                fullContext
              );

            /*
             * La recherche est ensuite remise au modèle
             * conversationnel afin que Bertho AI puisse
             * transformer les résultats bruts en réponse
             * naturelle.
             */

            const searchContent =
              result?.content ||
              result?.message ||
              result?.result ||
              JSON.stringify(result);

            const systemPrompt =
              buildSystemPrompt(
                fullContext.product,
                fullContext
              );

            const contextInstructions =
              fullContext.image
                ? ""
                : buildContextInstructions(
                    fullContext
                  );

            const fullSystemContent =
              contextInstructions
                ? `${systemPrompt}\n\n${contextInstructions}`
                : systemPrompt;

            const messages = [
              {
                role: "system",
                content: fullSystemContent
              },
              ...history,
              {
                role: "user",
                content:
                  `${body.message.trim()}\n\n` +
                  `<web_search_data>\n` +
                  `${String(searchContent).slice(
                    0,
                    20000
                  )}\n` +
                  `</web_search_data>\n\n` +
                  `Utilise les résultats ci-dessus ` +
                  `pour répondre à la demande de l'utilisateur.`
              }
            ];

            const aiResult =
              await generateResponse(
                env,
                messages,
                fullContext.model,
                fullContext.image
              );

            const responseText =
              cleanResponseText(
                extractResponseText(
                  aiResult
                )
              );

            return json({
              success: true,
              message:
                responseText ||
                "Recherche effectuée.",
              context: fullContext,
              decision: {
                intent:
                  decision.intent,
                action:
                  decision.action,
                confidence:
                  decision.confidence,
                objective:
                  decision.objective
              }
            });
          }

          // ======================================================
          // F3. AUDIT SITE WEB
          // ======================================================

          if (
            decision.action ===
            "website_audit"
          ) {
            const auditResult =
              await executeWebsiteAuditAction(
                env,
                decision,
                body,
                fullContext
              );

            const auditPayload =
              BerthoAIActions
                .buildAuditInstructionPayload(
                  auditResult
                );

            const systemPrompt =
              buildSystemPrompt(
                fullContext.product,
                fullContext
              );

            const contextInstructions =
              buildContextInstructions(
                fullContext
              );

            const messages = [
              {
                role: "system",
                content:
                  `${systemPrompt}\n\n` +
                  `${contextInstructions}`
              },
              ...history,
              {
                role: "user",
                content:
                  `${body.message.trim()}` +
                  auditPayload
              }
            ];

            const aiResult =
              await generateResponse(
                env,
                messages,
                fullContext.model,
                null
              );

            const responseText =
              cleanResponseText(
                extractResponseText(
                  aiResult
                )
              );

            return json({
              success: true,
              message:
                responseText ||
                "Audit effectué.",
              context: fullContext,
              decision: {
                intent:
                  decision.intent,
                action:
                  decision.action,
                confidence:
                  decision.confidence,
                objective:
                  decision.objective
              },
              audit: {
                url: auditResult.url
              }
            });
          }

          // ======================================================
          // F4. SANDBOX
          // ======================================================

          if (
            decision.action ===
            "sandbox"
          ) {
            const result =
              await executeSandboxAction(
                env,
                decision,
                body,
                fullContext
              );

            const sandboxContent =
              result?.content ||
              result?.message ||
              result?.result ||
              JSON.stringify(result);

            const systemPrompt =
              buildSystemPrompt(
                fullContext.product,
                fullContext
              );

            const contextInstructions =
              buildContextInstructions(
                fullContext
              );

            const messages = [
              {
                role: "system",
                content:
                  `${systemPrompt}\n\n` +
                  `${contextInstructions}`
              },
              ...history,
              {
                role: "user",
                content:
                  `${body.message.trim()}\n\n` +
                  `<sandbox_result>\n` +
                  `${String(sandboxContent).slice(
                    0,
                    20000
                  )}\n` +
                  `</sandbox_result>\n\n` +
                  `Explique le résultat à l'utilisateur ` +
                  `de manière claire et utile.`
              }
            ];

            const aiResult =
              await generateResponse(
                env,
                messages,
                fullContext.model,
                fullContext.image
              );

            const responseText =
              cleanResponseText(
                extractResponseText(
                  aiResult
                )
              );

            return json({
              success: true,
              message:
                responseText ||
                String(sandboxContent),
              context: fullContext,
              decision: {
                intent:
                  decision.intent,
                action:
                  decision.action,
                confidence:
                  decision.confidence,
                objective:
                  decision.objective
              },
              sandbox: result
            });
          }
        }

        // --------------------------------------------------------
        // G. RÉPONSE CONVERSATIONNELLE NORMALE
        // --------------------------------------------------------

        const systemPrompt =
          buildSystemPrompt(
            fullContext.product,
            fullContext
          );

        const contextInstructions =
          fullContext.image
            ? ""
            : buildContextInstructions(
                fullContext
              );

        const fullSystemContent =
          contextInstructions
            ? `${systemPrompt}\n\n${contextInstructions}`
            : systemPrompt;

        const messages = [
          {
            role: "system",
            content: fullSystemContent
          },
          ...history,
          {
            role: "user",
            content:
              body.message.trim()
          }
        ];

        const result =
          await generateResponse(
            env,
            messages,
            fullContext.model,
            fullContext.image
          );

        const responseText =
          cleanResponseText(
            extractResponseText(result)
          );

        return json({
          success: true,
          message:
            responseText ||
            "Je n'ai pas pu produire de réponse.",
          context: fullContext,
          decision: {
            intent:
              decision.intent,
            action:
              decision.action,
            confidence:
              decision.confidence,
            objective:
              decision.objective
          }
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
    // 9. ROUTE NON TROUVÉE
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