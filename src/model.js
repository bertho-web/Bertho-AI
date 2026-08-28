/**
 * bertho-ai/src/model.js
 * Moteur d'inférence multi-modèles haute performance sur Cloudflare Workers AI.
 */

const AI_MODELS = {
  // ⚡ BERTHO AI TURBO (Défaut) : Modèle 70 Milliards de paramètres ultra-rapide
  turbo: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  
  // 🧠 BERTHO AI NEURAL : Modèle de raisonnement profond (Niveau DeepSeek-R1 / Claude)
  neural: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
  
  // 🎮 BERTHO AI GAMING : Modèle 70B calibré pour le coaching tactique
  gaming: "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
};

export async function generateResponse(env, messages, modelKey = 'turbo') {
  // Sélection du modèle demandé (ou Turbo par défaut)
  const targetModel = AI_MODELS[modelKey] || AI_MODELS.turbo;
  
  try {
    const result = await env.AI.run(targetModel, {
      messages,
      max_tokens: 1500,
      temperature: modelKey === 'neural' ? 0.6 : 0.7
    });
    
    return result;
  } catch (error) {
    console.warn(`[AI Engine] Erreur sur ${targetModel}, tentative de repli sur Turbo :`, error);
    
    // Sécurité anti-panne : si le modèle de raisonnement est saturé, repli instantané sur Turbo 70B
    if (targetModel !== AI_MODELS.turbo) {
      return await env.AI.run(AI_MODELS.turbo, {
        messages,
        max_tokens: 1000
      });
    }
    
    throw error;
  }
}