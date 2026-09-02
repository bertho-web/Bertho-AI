/**
 * bertho-ai/src/model.js
 * Moteur d'inférence multi-modèles de frontière et orchestrateur de microservices Edge (0 Émoji).
 */

export const AI_MODELS = {
  // 1. MOTEURS PRINCIPAUX ASSIGNÉS AUX RÔLES UTILISATEURS
  turbo: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  neural: "@cf/moonshotai/kimi-k2.6", // Upgrade 1T MoE (Contexte 262k)
  gaming: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  vision: "@cf/zhipuai/glm-5.3-flash", // Upgrade Multimodal 320B
  
  // 2. MODÈLES DE FRONTÈRE & PARACHUTES DE SECOURS
  deepseek_r1: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
  qwen: "@cf/qwen/qwen3.8-27b",
  llama_vision: "@cf/meta/llama-3.2-11b-vision-instruct",
  deepseek_v4: "@cf/deepseek-ai/deepseek-v4-pro-0813",
  flux_image: "@cf/black-forest-labs/flux-1-schnell"
};

// CONFIGURATION DE LA PASSERELLE CLOUDFLARE (Observabilité & Haute Disponibilité)
const GATEWAY_OPTIONS = {
  gateway: {
    id: "bertho-gateway",
    skipCache: true
  }
};

/**
 * Décode une chaîne Base64 en tableau d'octets optimisé pour la vision Workers AI
 */
function base64ToByteArray(base64String) {
  try {
    const cleanBase64 = base64String.replace(/^data:[^;]+;base64,/i, '');
    const binary = atob(cleanBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return Array.from(bytes);
  } catch (e) {
    console.error('[Vision Error] Échec conversion base64 en bytes:', e);
    return null;
  }
}

// ============================================================================
// 1. MOTEUR D'INFÉRENCE PRINCIPAL (TEXTE, RAISONNEMENT & VISION MULTIMODALE)
// ============================================================================
export async function generateResponse(env, messages, modelKey = 'turbo', rawImageBase64 = null) {
  
  // A. BRANCHE VISION MULTI-MODALE (Si une image est fournie)
  if (rawImageBase64) {
    const imageBytes = base64ToByteArray(rawImageBase64);
    if (imageBytes && imageBytes.length > 0) {
      
      let systemPrompt = "";
      let userPrompt = "Analyse et décris cette image en détail.";
      
      if (Array.isArray(messages)) {
        const sysMsg = messages.find(m => m.role === 'system');
        const lastUser = messages.filter(m => m.role === 'user').pop();
        
        if (sysMsg && sysMsg.content) systemPrompt = sysMsg.content;
        if (lastUser && lastUser.content) userPrompt = lastUser.content;
      }
      
      const combinedPrompt = systemPrompt ?
        `${systemPrompt}\n\nInstruction utilisateur : ${userPrompt}` :
        userPrompt;
      
      // Essai 1 : Modèle de vision principal (GLM-5.3 Multimodal)
      try {
        const visionResult = await env.AI.run(
          AI_MODELS.vision,
          {
            prompt: String(combinedPrompt),
            image: imageBytes,
            max_tokens: 2048
          },
          GATEWAY_OPTIONS
        );
        if (visionResult) return visionResult;
      } catch (visionError) {
        console.warn('[Vision Primary Warning]:', visionError);
        
        // Essai 2 : Fallback sur Llama 3.2 Vision avec accord de licence automatique
        try {
          if (String(visionError).includes('agree') || String(visionError).includes('license')) {
            await env.AI.run(AI_MODELS.llama_vision, { prompt: "agree" }, GATEWAY_OPTIONS);
          }
          const backupVisionResult = await env.AI.run(
            AI_MODELS.llama_vision,
            {
              prompt: String(combinedPrompt),
              image: imageBytes,
              max_tokens: 2048
            },
            GATEWAY_OPTIONS
          );
          if (backupVisionResult) return backupVisionResult;
        } catch (backupErr) {
          console.error('[Vision Backup Error]:', backupErr);
        }
      }
    }
  }
  
  // B. BRANCHE TEXTE & RAISONNEMENT AVEC CASCADE DE SECOURS (ZÉRO PANNE)
  const targetModel = AI_MODELS[modelKey] || AI_MODELS.turbo;
  const isNeural = modelKey === 'neural' || modelKey === 'kimi' || modelKey === 'glm';
  
  try {
    // 1er Palier : Tentative sur le modèle cible sélectionné
    return await env.AI.run(
      targetModel,
      {
        messages,
        max_tokens: 4096,
        temperature: isNeural ? 0.6 : 0.7
      },
      GATEWAY_OPTIONS
    );
  } catch (primaryError) {
    console.warn(`[AI Engine] Erreur sur ${targetModel}, repli sur palier 2 (DeepSeek-R1) :`, primaryError);
    
    // 2ème Palier : Repli sur DeepSeek-R1 (32B) si le modèle était un géant
    if (targetModel !== AI_MODELS.deepseek_r1 && targetModel !== AI_MODELS.turbo) {
      try {
        return await env.AI.run(
          AI_MODELS.deepseek_r1,
          {
            messages,
            max_tokens: 4096,
            temperature: 0.6
          },
          GATEWAY_OPTIONS
        );
      } catch (secondaryError) {
        console.warn('[AI Engine] Échec palier 2, repli final sur Llama 70B Turbo :', secondaryError);
      }
    }
    
    // 3ème Palier (Filet de sécurité absolu) : Llama 3.3 70B Turbo
    if (targetModel !== AI_MODELS.turbo) {
      return await env.AI.run(
        AI_MODELS.turbo,
        {
          messages,
          max_tokens: 4096,
          temperature: 0.7
        },
        GATEWAY_OPTIONS
      );
    }
    
    throw primaryError;
  }
}

// ============================================================================
// 2. ORCHESTRATEUR DE MICROSERVICES SATELLITES (IMAGE, SEARCH, SANDBOX)
// ============================================================================

/**
 * Génère une image haute résolution via le microservice ou directement avec FLUX.1
 */
export async function generateImage(env, prompt, steps = 4) {
  if (!prompt || typeof prompt !== 'string') throw new Error('Prompt image requis.');
  const cleanSteps = Math.min(Math.max(parseInt(steps, 10) || 4, 1), 8);
  
  // 1. Appel via le Worker satellite si la liaison de service existe
  if (env.BERTHO_IMAGE_AI) {
    const res = await env.BERTHO_IMAGE_AI.fetch(new Request('https://bertho-ai-image.internal/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt.trim(), steps: cleanSteps })
    }));
    return await res.json();
  }
  
  // 2. Appel direct de secours en mémoire vive si le worker satellite n'est pas bindé
  const response = await env.AI.run(AI_MODELS.flux_image, {
    prompt: prompt.trim(),
    steps: cleanSteps
  });
  
  const buffer = response instanceof ArrayBuffer ?
    response :
    (response instanceof Uint8Array ? response.buffer : await new Response(response).arrayBuffer());
  
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return {
    success: true,
    prompt: prompt.trim(),
    image: `data:image/jpeg;base64,${btoa(binary)}`
  };
}

/**
 * Recherche des actualités en direct sur le web via le microservice de recherche
 */
export async function searchWeb(env, query) {
  if (!query || typeof query !== 'string') throw new Error('Requête de recherche requise.');
  
  if (env.BERTHO_SEARCH_AI) {
    const res = await env.BERTHO_SEARCH_AI.fetch(new Request('https://bertho-ai-search.internal/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query.trim() })
    }));
    return await res.json();
  }
  
  return { success: false, error: 'search_service_unavailable' };
}

/**
 * Exécute du code ou un calcul dans le microservice de bac à sable isolé
 */
export async function executeSandbox(env, code, language = 'javascript') {
  if (!code || typeof code !== 'string') throw new Error('Code à exécuter requis.');
  
  if (env.BERTHO_SANDBOX_AI) {
    const res = await env.BERTHO_SANDBOX_AI.fetch(new Request('https://bertho-ai-sandbox.internal/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim(), language: language })
    }));
    return await res.json();
  }
  
  return { success: false, error: 'sandbox_service_unavailable' };
}