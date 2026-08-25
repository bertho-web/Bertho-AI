const MODEL = "@cf/meta/llama-3.1-8b-fast-v2";

export async function generateResponse(env, messages) {
  return await env.AI.run(MODEL, {
    messages
  });
}