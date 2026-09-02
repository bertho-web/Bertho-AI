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
// A. ROUTE DIRECTE : GÉNÉRATION D'IMAGES FLUX.1 (POST /image)
if (request.method === "POST" && url.pathname === "/image") {
  try {
    const body = await request.json();
    const prompt = body.prompt || body.message;
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return json({ success: false, error: "prompt_required" }, 400);
    }
    
    const imageResponse = await env.BERTHO_IMAGE_AI.fetch(new Request("https://bertho-ai-image.internal/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: prompt.trim(), steps: body.steps || 4 })
    }));
    
    const data = await imageResponse.json();
    return json(data, imageResponse.status);
  } catch (e) {
    return json({ success: false, error: e.message || "image_service_error" }, 500);
  }
}

// B. ROUTE DIRECTE : RECHERCHE WEB EN TEMPS RÉEL (POST /search)
if (request.method === "POST" && url.pathname === "/search") {
  try {
    const body = await request.json();
    const query = body.query || body.message;
    if (!query || typeof query !== "string" || !query.trim()) {
      return json({ success: false, error: "query_required" }, 400);
    }
    
    const searchResponse = await env.BERTHO_SEARCH_AI.fetch(new Request("https://bertho-ai-search.internal/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: query.trim() })
    }));
    
    const data = await searchResponse.json();
    return json(data, searchResponse.status);
  } catch (e) {
    return json({ success: false, error: e.message || "search_service_error" }, 500);
  }
}

// C. ROUTE DIRECTE : EXÉCUTION BAC À SABLE V8 (POST /sandbox)
if (request.method === "POST" && url.pathname === "/sandbox") {
  try {
    const body = await request.json();
    const code = body.code || body.script || body.message;
    if (!code || typeof code !== "string" || !code.trim()) {
      return json({ success: false, error: "code_required" }, 400);
    }
    
    const sandboxResponse = await env.BERTHO_SANDBOX_AI.fetch(new Request("https://bertho-ai-sandbox.internal/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim(), language: body.language || "javascript" })
    }));
    
    const data = await sandboxResponse.json();
    return json(data, sandboxResponse.status);
  } catch (e) {
    return json({ success: false, error: e.message || "sandbox_service_error" }, 500);
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
        
// D1. Exécution modulaire des outils (Audit de site web)
let toolDataPayload = "";
if (BerthoAIActions.isAuditIntent(body.message)) {
  const targetUrl = BerthoAIActions.extractTargetUrl(body.message);
  if (targetUrl) {
    const auditResult = await BerthoAIActions.runWebsiteAudit(targetUrl, env);
    toolDataPayload = BerthoAIActions.buildAuditInstructionPayload(auditResult);
  }
}

// D2. Interception automatique de génération d'image FLUX.1
const msgClean = body.message.toLowerCase().trim();
const isImageIntent = (
  msgClean.startsWith("génère une image") ||
  msgClean.startsWith("genere une image") ||
  msgClean.startsWith("crée une image") ||
  msgClean.startsWith("cree une image") ||
  msgClean.startsWith("dessine") ||
  msgClean.startsWith("fais une image") ||
  msgClean.startsWith("generate image") ||
  msgClean.startsWith("draw")
);

if (isImageIntent) {
  const imagePrompt = body.message
    .replace(/^(génère une image de|genere une image de|crée une image de|cree une image de|dessine-moi|dessine|génère une image|genere une image|crée une image|cree une image|generate image of|generate image|draw)/i, '')
    .trim() || body.message.trim();
  
  const requestedSteps = Math.min(Math.max(parseInt(body.steps, 10) || 4, 1), 8);
  
  const imgResponse = await env.BERTHO_IMAGE_AI.fetch(new Request("https://bertho-ai-image.internal/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: imagePrompt, steps: requestedSteps })
  }));
  
  const imgData = await imgResponse.json();
  
  if (imgData.success && imgData.image) {
    return json({
      success: true,
      message: "Voici votre création graphique haute définition :",
      generatedImage: imgData.image,
      steps: requestedSteps,
      context: fullContext
    });
  }
}
        
        // E. Construction du System Prompt enrichi
const systemPrompt = buildSystemPrompt(fullContext.product, fullContext);
// Si une image est fournie, on n'ajoute pas les règles d'écran pour ne pas saturer l'OCR
const contextInstructions = fullContext.image ? "" : buildContextInstructions(fullContext);
const fullSystemContent = contextInstructions ? `${systemPrompt}\n\n${contextInstructions}` : systemPrompt;

// F. Assemblage des messages
const messages = [
  {
    role: "system",
    content: fullSystemContent
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
        
// H. Extraction et mise en forme de la réponse (Nettoyage de <think> DeepSeek-R1)
let responseText = (result && typeof result.response === 'string') ?
  result.response :
  (typeof result === 'string' ? result : JSON.stringify(result));

// Supprime le bloc de raisonnement interne pour livrer une réponse directe et propre
responseText = responseText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

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