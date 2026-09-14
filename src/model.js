/**
 * bertho-ai/src/model.js
 * Moteur d'inférence multi-modèles de frontière Edge (Zero-Downtime, Zéro Émoji).
 */

export const AI_MODELS = {
  // 1. MOTEUR UNIVERSEL & MULTIMODAL (320B MoE Natif - 1.3M Tokens - Z.ai)
  vision: "@cf/zai-org/glm-5.3-flash",
  glm: "@cf/zai-org/glm-5.3-flash",
  glm_coding: "@cf/zai-org/glm-5.3",
  
  // 2. MOTEUR DE RAISONNEMENT PROFOND & STRATÉGIE (1M Tokens)
  neural: "@cf/deepseek-ai/deepseek-v4-pro-0813",
  deepseek_v4: "@cf/deepseek-ai/deepseek-v4-pro-0813",
  kimi: "@cf/deepseek-ai/deepseek-v4-pro-0813", // Résolution de l'alias Lab
  deepseek_r1: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
  
  // 3. LOGIQUE MULTILINGUE & ORCHESTRATION (262k Tokens)
  qwen: "@cf/qwen/qwen3.8-27b",
  
  // 4. MOTEUR RAPIDE & FILET DE SÉCURITÉ DE SECOURS (Llama 3.3 70B Turbo)
  turbo: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  gaming: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  
  // 5. SECOURS VISION & STUDIO GRAPHIQUE
  llama_vision: "@cf/meta/llama-3.2-11b-vision-instruct",
  flux_image: "@cf/black-forest-labs/flux-1-schnell"
};

// Configuration Passerelle Cloudflare AI Gateway
const GATEWAY_OPTIONS = {
  gateway: {
    id: "bertho-gateway",
    skipCache: true
  }
};

function resolveModel(modelKey) {
  return AI_MODELS[modelKey] || modelKey || AI_MODELS.turbo;
}

function getFallbackModels(targetModel) {
  return [
    AI_MODELS.deepseek_r1,
    AI_MODELS.turbo
  ].filter(
    (model, idx, arr) =>
    model &&
    model !== targetModel &&
    arr.indexOf(model) === idx
  );
}

/**
 * Décode une image Base64 de façon sécurisée et compatible Workers AI.
 */
function base64ToImagePayload(base64String) {
  try {
    const cleanBase64 = base64String.replace(/^data:[^;]+;base64,/i, "").trim();
    const binary = atob(cleanBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    // Si < 2 Mo, Array standard pour compatibilité universelle avec le binding
    // Si > 2 Mo, Uint8Array direct pour protéger la mémoire RAM (128 Mo)
    return bytes.length < 2 * 1024 * 1024 ? Array.from(bytes) : bytes;
  } catch (error) {
    console.error("[Vision Engine] Échec décodage image base64:", error);
    return null;
  }
}

/**
 * Exécute un modèle avec cascade de repli intelligente.
 * Utilisé par orchestrator.js et en interne.
 */
export async function runWithModelFallback(env, modelKey, input, options = {}) {
  const targetModel = resolveModel(modelKey);
  const modelsToTry = [targetModel, ...getFallbackModels(targetModel)];
  
  let lastError = null;
  
  for (let i = 0; i < modelsToTry.length; i++) {
    const model = modelsToTry[i];
    try {
      console.log(`[AI Engine] Tentative ${i + 1}/${modelsToTry.length} : ${model}`);
      return await env.AI.run(model, input, {
        ...GATEWAY_OPTIONS,
        ...options
      });
    } catch (err) {
      lastError = err;
      console.warn(`[AI Engine] Échec sur ${model} :`, err?.message || String(err));
    }
  }
  
  throw lastError || new Error("Tous les modèles de la cascade ont échoué.");
}

/**
 * Point d'entrée d'inférence universel (Texte, Raisonnement et Vision Multimodale).
 * Importé par index.js.
 */
export async function generateResponse(env, messages, modelKey = "turbo", rawImageBase64 = null) {
  
  // ==========================================================
  // BRANCHE A : VISION MULTIMODALE (Image transmise)
  // ==========================================================
  if (rawImageBase64) {
    const imagePayload = base64ToImagePayload(rawImageBase64);
    
    if (imagePayload && imagePayload.length > 0) {
      let systemPrompt = "";
      let conversationHistory = [];
      let latestUserPrompt = "Analyse et décris cette image avec une précision chirurgicale.";
      
      if (Array.isArray(messages)) {
        for (const msg of messages) {
          if (msg.role === "system") {
            systemPrompt = msg.content;
          } else if (msg.role === "user") {
            latestUserPrompt = msg.content;
            conversationHistory.push(`UTILISATEUR: ${msg.content}`);
          } else if (msg.role === "assistant") {
            conversationHistory.push(`BERTHO AI: ${msg.content}`);
          }
        }
      }
      
      // Reconstruction intégrale du dialogue pour ne jamais perdre le fil
      const formattedPrompt = [
        systemPrompt ? `[DIRECTIVES SYSTÈME]\n${systemPrompt}` : "",
        conversationHistory.length > 1 ? `[HISTORIQUE CONVERSATIONNEL]\n${conversationHistory.slice(0, -1).join("\n\n")}` : "",
        `[INSTRUCTION ACTUELLE]: ${latestUserPrompt}`
      ].filter(Boolean).join("\n\n");
      
      // Essai 1 : GLM-5.3 Flash (Multimodal natif 1.3M tokens)
      try {
        const visionResult = await env.AI.run(
          AI_MODELS.vision,
          {
            prompt: formattedPrompt,
            image: imagePayload,
            max_tokens: 4096
          },
          GATEWAY_OPTIONS
        );
        if (visionResult) return visionResult;
      } catch (primaryVisionError) {
        console.warn("[Vision Engine] Échec GLM-5.3 Flash, bascule sur Llama Vision :", primaryVisionError);
        
        // Essai 2 : Fallback sur Llama 3.2 Vision
        try {
          return await env.AI.run(
            AI_MODELS.llama_vision,
            {
              prompt: formattedPrompt,
              image: imagePayload,
              max_tokens: 2048
            },
            GATEWAY_OPTIONS
          );
        } catch (secondaryVisionError) {
          console.error("[Vision Engine] Échec critique vision :", secondaryVisionError);
        }
      }
    }
  }
  
  // ==========================================================
  // BRANCHE B : TEXTE, CODE & RAISONNEMENT (Cascade Zero-Panne)
  // ==========================================================
  const targetModel = resolveModel(modelKey);
  const isDeepReasoning =
    targetModel === AI_MODELS.neural ||
    targetModel === AI_MODELS.deepseek_v4 ||
    targetModel === AI_MODELS.deepseek_r1;
  
  return await runWithModelFallback(
    env,
    targetModel,
    {
      messages,
      max_tokens: 4096,
      temperature: isDeepReasoning ? 0.6 : 0.7
    }
  );
}

// Utilitaires de secours directs
export async function generateImage(env, prompt, steps = 4) {
  if (!prompt || typeof prompt !== "string") throw new Error("Prompt image requis.");
  const cleanSteps = Math.min(Math.max(parseInt(steps, 10) || 4, 1), 8);
  
  if (env.BERTHO_IMAGE_AI) {
    const res = await env.BERTHO_IMAGE_AI.fetch(
      new Request("https://bertho-ai-image.internal/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), steps: cleanSteps })
      })
    );
    return await res.json();
  }
  
  const response = await env.AI.run(AI_MODELS.flux_image, {
    prompt: prompt.trim(),
    steps: cleanSteps
  });
  
  const buffer = response instanceof ArrayBuffer ?
    response :
    (response instanceof Uint8Array ? response.buffer : await new Response(response).arrayBuffer());
  
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return {
    success: true,
    prompt: prompt.trim(),
    image: `data:image/jpeg;base64,${btoa(binary)}`
  };
}

export async function searchWeb(env, query) {
  if (!query || typeof query !== "string") throw new Error("Requête de recherche requise.");
  if (env.BERTHO_SEARCH_AI) {
    const res = await env.BERTHO_SEARCH_AI.fetch(
      new Request("https://bertho-ai-search.internal/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() })
      })
    );
    return await res.json();
  }
  return { success: false, error: "search_service_unavailable" };
}

export async function executeSandbox(env, code, language = "javascript") {
  if (!code || typeof code !== "string") throw new Error("Code à exécuter requis.");
  if (env.BERTHO_SANDBOX_AI) {
    const res = await env.BERTHO_SANDBOX_AI.fetch(
      new Request("https://bertho-ai-sandbox.internal/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), language })
      })
    );
    return await res.json();
  }
  return { success: false, error: "sandbox_service_unavailable" };
}