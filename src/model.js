/**
 * bertho-ai/src/model.js
 * Moteur d'inférence multi-modèles (Texte 70B & Vision Multi-modale Llama 3.2).
 */

const AI_MODELS = {
  // ⚡ BERTHO AI TURBO (Défaut texte) : Llama 3.3 70B ultra-rapide
  turbo: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  
  // 🧠 BERTHO AI NEURAL : Raisonnement profond DeepSeek-R1
  neural: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
  
  // 🎮 BERTHO AI GAMING : Modèle 70B pour le coaching
  gaming: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  
  // 👁️ BERTHO AI VISION : Modèle officiel Cloudflare pour lire les images & captures
  vision: "@cf/meta/llama-3.2-11b-vision-instruct"
};

/**
 * Convertit une image Base64 en tableau d'octets pour Cloudflare Workers AI
 */
function base64ToByteArray(base64String) {
  try {
    const cleanBase64 = base64String.replace(/^data:image\/[a-z]+;base64,/, '');
    const binary = atob(cleanBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return [...bytes];
  } catch (e) {
    console.error('[Vision Error] Échec conversion base64 en bytes:', e);
    return null;
  }
}

export async function generateResponse(env, messages, modelKey = 'turbo', rawImageBase64 = null) {
  // 1. SI UNE IMAGE EST PRÉSENTE -> BASCULE AUTOMATIQUE SUR LE MODÈLE VISION
  if (rawImageBase64) {
    const imageBytes = base64ToByteArray(rawImageBase64);
    if (imageBytes) {
      try {
        const result = await env.AI.run(AI_MODELS.vision, {
          messages,
          image: imageBytes,
          max_tokens: 2048
        });
        return result;
      } catch (visionError) {
        console.error('[AI Vision Engine Error]:', visionError);
      }
    }
  }
  
  // 2. MODÈLES TEXTE STANDARDS (TURBO / NEURAL / GAMING)
  const targetModel = AI_MODELS[modelKey] || AI_MODELS.turbo;
  
  try {
    const result = await env.AI.run(targetModel, {
      messages,
      max_tokens: 4096,
      temperature: modelKey === 'neural' ? 0.6 : 0.7
    });
    
    return result;
  } catch (error) {
    console.warn(`[AI Engine] Erreur sur ${targetModel}, repli automatique sur Turbo :`, error);
    
    if (targetModel !== AI_MODELS.turbo) {
      return await env.AI.run(AI_MODELS.turbo, {
        messages,
        max_tokens: 4096
      });
    }
    
    throw error;
  }
}