/**
 * bertho-ai/src/model.js
 * Moteur d'inférence multi-modèles haute capacité (4096 Tokens) sur Cloudflare Workers AI.
 */

const AI_MODELS = {
  // ⚡ BERTHO AI TURBO (Défaut) : Llama 3.3 70B ultra-rapide et tout-terrain
  turbo: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  
  // 🧠 BERTHO AI NEURAL : Modèle de raisonnement profond (DeepSeek-R1 / Claude-level)
  neural: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
  
  // 🎮 BERTHO AI GAMING : Modèle 70B expert des jeux et compétitions
  gaming: "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
};

export async function generateResponse(env, messages, modelKey = 'turbo') {
  const targetModel = AI_MODELS[modelKey] || AI_MODELS.turbo;
  
  try {
    const result = await env.AI.run(targetModel, {
      messages,
      max_tokens: 4096, // Capacité maximale Cloudflare GPU (Fini les coupures de texte)
      temperature: modelKey === 'neural' ? 0.6 : 0.7
    });
    
    return result;
  } catch (error) {
    console.warn(`[AI Engine] Erreur sur ${targetModel}, bascule de repli sur Turbo 70B :`, error);
    
    // Repli automatique anti-panne sur le modèle 70B Turbo
    if (targetModel !== AI_MODELS.turbo) {
      return await env.AI.run(AI_MODELS.turbo, {
        messages,
        max_tokens: 4096
      });
    }
    
    throw error;
  }
}