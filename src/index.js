/**
 * bertho-ai/src/index.js
 * Point d'entrée officiel du Worker Bertho AI (Vision, Liaison Audit, Modèles Dynamiques & Contexte).
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
    // 5. CHAT, VISION & AGENT D'ACTION (POST /chat)
    // ============================================================
    if (request.method === "POST" && url.pathname === "/chat") {
      try {
        const body = await request.json();
        
        // A. Validation du message utilisateur
        if (!body.message || typeof body.message !== "string" || !body.message.trim()) {
          return json({ success: false, error: "message_required" }, 400);
        }
        
        // B. Construction du contexte complet et résolution de l'image (source unique)
        const rawCtx = (body.context && typeof body.context === "object") ? body.context : {};
        const normalizedCtx = createContext(body);
        
        // Priorité : racine (body.image) > objet contexte (context.image)
        const resolvedImage = (typeof body.image === "string" && body.image.trim()) ?
          body.image.trim() :
          (typeof rawCtx.image === "string" && rawCtx.image.trim() ? rawCtx.image.trim() : null);
        
        const fullContext = {
          ...rawCtx,
          ...normalizedCtx,
          model: body.model || rawCtx.model || "turbo",
          user: body.user || rawCtx.user || null,
          screenDetails: rawCtx.screenDetails || null,
          triggerSource: body.source || rawCtx.source || rawCtx.triggerSource || "berthoplay",
          image: resolvedImage
        };
        
        // C. Assainissement de l'historique multi-tours
        const history = Array.isArray(body.history) ?
          body.history.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') :
          [];
        
        // D. Exécution modulaire des outils (Audit de site web)
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
        
        // F. Assemblage des messages
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
        
        // G. Routage et inférence (texte standard ou vision automatique)
        const result = await generateResponse(
          env,
          messages,
          fullContext.model,
          fullContext.image
        );
        
        // H. Extraction et mise en forme de la réponse
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