/**
 * bertho-ai/src/capabilities.js
 * Source de vérité des capacités réellement disponibles.
 */

export function getCapabilities(env) {
  return {
    image_generation: Boolean(env.BERTHO_IMAGE_AI),
    web_search: Boolean(env.BERTHO_SEARCH_AI),
    website_audit: Boolean(env.BERTHO_AI_AUDIT),
    sandbox: Boolean(env.BERTHO_SANDBOX_AI),
    
    vision: Boolean(env.AI),
    coding: Boolean(env.AI),
    reasoning: Boolean(env.AI),
    conversation: Boolean(env.AI)
  };
}

export function hasCapability(capabilities, capability) {
  return capabilities?.[capability] === true;
}