const MODEL = "@cf/meta/llama-3.1-8b-instruct";

export async function generateResponse(env, messages) {
const response = await env.AI.run(MODEL, {
messages
});

return response;
}