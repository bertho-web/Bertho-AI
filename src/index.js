/**
 * bertho-ai/src/index.js
 * Point d'entrée officiel du Worker Bertho AI (Zéro Perte de Contexte & Actions).
 */

import { generateResponse } from "./model.js";
import { buildSystemPrompt } from "./prompts.js";
import { isAuthorized } from "./auth.js";
import { BerthoAIActions } from "./actions.js";
import { createContext, buildContextInstructions } from "./context.js";

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
      return json({ success: false, error: "unauthorized" }, 401);
    }
    
    // ============================================================
    // 3. HEALTH MONITORING
    // ============================================================
    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        success: true,
        service: "bertho-ai",
        status: "online"
      });
    }
    
    // ============================================================
    // 4. TEST AI
    // ============================================================
    if (request.method === "GET" && url.pathname === "/test-ai") {
      try {
        const result = await generateResponse(env, [
          { role: "user", content: "Réponds simplement : Bertho AI est opérationnelle." }
        ], "turbo");
        
        return json({ success: true, result });
      } catch (error) {
        console.error("TEST AI ERROR:", error);
        return json({ success: false, error: error.message || String(error) }, 500);
      }
    }
    
    // ============================================================
    // 5. CHAT & AGENT D'ACTION (POST /chat)
    // ============================================================
    if (request.method === "POST" && url.pathname === "/chat") {
      try {
        const body = await request.json();
        
        // A. Validation du message
        if (!body.message || typeof body.message !== "string" || !body.message.trim()) {
          return json({ success: false, error: "message_required" }, 400);
        }
        
        // B. Construction du contexte complet (Normalisé + Préservation des métadonnées)
        const rawCtx = (body.context && typeof body.context === "object") ? body.context : {};
        const normalizedCtx = createContext(body);
        
        const fullContext = {
          ...rawCtx,
          ...normalizedCtx,
          model: rawCtx.model || body.model || "turbo",
          user: rawCtx.user || body.user || null,
          screenDetails: rawCtx.screenDetails || null,
          triggerSource: rawCtx.source || rawCtx.triggerSource || body.source || "berthoplay"
        };
        
        // C. Assainissement de l'historique multi-tours
        const history = Array.isArray(body.history) ?
          body.history.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') :
          [];
        
        // D. Exécution modulaire des outils (Audit de site, etc.)
        let toolDataPayload = "";
        if (BerthoAIActions.isAuditIntent(body.message)) {
          const targetUrl = BerthoAIActions.extractTargetUrl(body.message);
          if (targetUrl) {
            const auditResult = await BerthoAIActions.runWebsiteAudit(targetUrl, env);
            toolDataPayload = BerthoAIActions.buildAuditInstructionPayload(auditResult);
          }
        }
        
        // E. Construction du System Prompt enrichi
        const systemPrompt = buildSystemPrompt(fullContext.product, fullContext);
        const contextInstructions = buildContextInstructions(fullContext);
        
        // F. Assemblage des messages dans l'ordre strict
        const messages = [
          {
            role: "system",
            content: `${systemPrompt}\n\n${contextInstructions}`
          },
          ...history,
          {
            role: "user",
            content: body.message.trim() + toolDataPayload
          }
        ];
        
        // G. Inférence GPU (Llama 3.3 70B Turbo / DeepSeek-R1 Neural / Gaming)
        const result = await generateResponse(
          env,
          messages,
          fullContext.model
        );
        
        // H. Extraction et retour de la réponse
        const responseText = (result && typeof result.response === 'string') ?
          result.response :
          (typeof result === 'string' ? result : JSON.stringify(result));
        
        return json({
          success: true,
          message: responseText,
          context: fullContext
        });
        
      } catch (error) {
        console.error("AI REQUEST ERROR:", error);
        return json({
          success: false,
          error: error.message || "ai_request_failed"
        }, 500);
      }
    }
    
    // ============================================================
    // 6. ROUTE NON TROUVÉE
    // ============================================================
    return json({ success: false, error: "route_not_found" }, 404);
  }
};