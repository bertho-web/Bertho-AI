/**
 * bertho-ai/src/auth.js
 * Authentification cryptographique SHA-256 à temps constant (Zero Timing Leak).
 */

export async function isAuthorized(request, env) {
  const secret = env?.BERTHO_AI_SECRET;
  
  if (!secret || typeof secret !== "string" || !secret.trim()) {
    console.error("[Security Alert] BERTHO_AI_SECRET n'est pas configuré sur ce Worker.");
    return false;
  }
  
  const authorization = request.headers.get("Authorization");
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return false;
  }
  
  const providedToken = authorization.slice(7).trim();
  const expectedToken = secret.trim();
  
  const encoder = new TextEncoder();
  
  // SHA-256 normalise les deux valeurs à exactement 32 octets
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(providedToken)),
    crypto.subtle.digest("SHA-256", encoder.encode(expectedToken))
  ]);
  
  return crypto.subtle.timingSafeEqual(providedHash, expectedHash);
}