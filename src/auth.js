/**
 * bertho-ai/src/auth.js
 * Authentification officielle Bertho AI.
 */
export function isAuthorized(request, env) {
  const authorization = request.headers.get("Authorization");
  
  if (!authorization) {
    return false;
  }
  
  return (
    authorization ===
    `Bearer ${env.BERTHO_AI_SECRET}`
  );
}