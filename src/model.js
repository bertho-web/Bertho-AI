import { BERTHO_AI_SYSTEM_PROMPT } from "./prompts.js";

const MODEL = "@cf/meta/llama-3.1-8b-fast-v2";

export async function generateResponse(env, messages = []) {
  const conversation = [
    {
      role: "system",
      content: BERTHO_AI_SYSTEM_PROMPT
    },
    ...messages
  ];
  
  const response = await env.AI.run(MODEL, {
    messages: conversation
  });
  
  return response;
}