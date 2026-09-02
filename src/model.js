/**
 * bertho-ai/src/model.js
 * Moteur d'inférence multi-modèles (Texte 70B & Vision Multi-modale Llama 3.2).
 */

const AI_MODELS = {
 turbo: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  neural: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
  gaming: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  vision: "@cf/meta/llama-3.2-11b-vision-instruct",
  
  // 2. Modèles de Frontière Nouvelle Génération
  kimi: "@cf/moonshotai/kimi-k2.6",
  glm: "@cf/zhipuai/glm-5.3-flash",
  qwen: "@cf/qwen/qwen3.8-27b",
  deepseek_v4: "@cf/deepseek-ai/deepseek-v4-pro-0813"
};

// 🟢 CONFIGURATION DE LA PASSERELLE CLOUDFLARE (Observabilité & Résilience)
const GATEWAY_OPTIONS = {
  gateway: {
    id: "bertho-gateway",
    skipCache: true // Maintient des réponses vivantes et dynamiques
  }
};

function base64ToByteArray(base64String) {
  try {
    // Regex universelle insensible à la casse pour tous types MIME
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

export async function generateResponse(env, messages, modelKey = 'turbo', rawImageBase64 = null) {
  // 1. SI UNE IMAGE EST FOURNIE -> APPEL DU MODÈLE VISION MULTI-MODAL
  if (rawImageBase64) {
    const imageBytes = base64ToByteArray(rawImageBase64);
    if (imageBytes && imageBytes.length > 0) {
      
      // Extraction et combinaison System Prompt + User Prompt
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
      
      try {
        const visionResult = await env.AI.run(
          AI_MODELS.vision,
          {
            prompt: String(combinedPrompt),
            image: imageBytes,
            max_tokens: 2048
          },
          GATEWAY_OPTIONS // 👈 Liaison Passerelle
        );
        
        if (visionResult) return visionResult;
      } catch (visionError) {
        console.warn('[AI Vision Engine Warning]:', visionError);
        
        // Accord de licence automatique Meta si requis
        if (String(visionError).includes('agree') || String(visionError).includes('license')) {
          try {
            await env.AI.run(AI_MODELS.vision, { prompt: "agree" }, GATEWAY_OPTIONS);
            return await env.AI.run(
              AI_MODELS.vision,
              {
                prompt: String(combinedPrompt),
                image: imageBytes,
                max_tokens: 2048
              },
              GATEWAY_OPTIONS // 👈 Liaison Passerelle
            );
          } catch (e) {
            console.error('[AI Vision Agreement Error]:', e);
          }
        }
      }
    }
  }
  
  // 2. MODÈLES TEXTE STANDARDS (TURBO 70B / NEURAL / GAMING) AVEC FALLBACK
  const targetModel = AI_MODELS[modelKey] || AI_MODELS.turbo;
  
  try {
    const result = await env.AI.run(
      targetModel,
      {
        messages,
        max_tokens: 4096,
        temperature: modelKey === 'neural' ? 0.6 : 0.7
      },
      GATEWAY_OPTIONS // 👈 Liaison Passerelle
    );
    
    return result;
  } catch (error) {
    console.warn(`[AI Engine] Erreur sur ${targetModel}, repli sur Turbo :`, error);
    
    if (targetModel !== AI_MODELS.turbo) {
      return await env.AI.run(
        AI_MODELS.turbo,
        {
          messages,
          max_tokens: 4096,
          temperature: 0.7
        },
        GATEWAY_OPTIONS // 👈 Liaison Passerelle
      );
    }
    
    throw error;
  }
}