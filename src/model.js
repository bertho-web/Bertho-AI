/**
 * bertho-ai/src/model.js
 * Moteur d'inférence multi-modèles (Texte 70B, Raisonnement R1 & Vision Multimodale Llama 3.2).
 */

const AI_MODELS = {
  // ⚡ BERTHO AI TURBO : Llama 3.3 70B ultra-rapide (Texte)
  turbo: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  
  // 🧠 BERTHO AI NEURAL : Raisonnement profond (DeepSeek-R1)
  neural: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
  
  // 🎮 BERTHO AI GAMING : Modèle 70B expert des jeux
  gaming: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  
  // 👁️ BERTHO AI VISION : Modèle Multimodal avec compréhension d'images
  vision: "@cf/meta/llama-3.2-11b-vision-instruct"
};

export async function generateResponse(env, messages, modelKey = 'turbo', imageBase64 = null) {
  // Si une image est présente, bascule automatique sur le modèle Vision
  if (imageBase64) {
    try {
      // Extraction des octets base64 pour le modèle Vision Cloudflare
      const base64Data = imageBase64.includes('base64,') ? imageBase64.split('base64,')[1] : imageBase64;
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const imageArray = [...bytes];
      
      const lastUserMsg = messages[messages.length - 1]?.content || "Analyse cette image.";
      
      const visionResult = await env.AI.run(AI_MODELS.vision, {
        prompt: lastUserMsg,
        image: imageArray,
        max_tokens: 1500
      });
      
      return visionResult;
    } catch (visionErr) {
      console.warn('[AI Vision Warning]:', visionErr);
    }
  }
  
  // Modèle Texte standard
  const targetModel = AI_MODELS[modelKey] || AI_MODELS.turbo;
  
  try {
    const result = await env.AI.run(targetModel, {
      messages,
      max_tokens: 4096,
      temperature: modelKey === 'neural' ? 0.6 : 0.7
    });
    
    return result;
  } catch (error) {
    console.warn(`[AI Engine] Erreur sur ${targetModel}, repli sur Turbo 70B :`, error);
    
    if (targetModel !== AI_MODELS.turbo) {
      return await env.AI.run(AI_MODELS.turbo, {
        messages,
        max_tokens: 4096
      });
    }
    
    throw error;
  }
}