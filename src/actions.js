/**
 * bertho-ai/src/actions.js
 * Moteur d'outils et d'actions (Tool Calling) de Bertho AI.
 */

export class BerthoAIActions {
  /**
   * Détecte si le message contient une demande d'audit ou une URL
   */
  static isAuditIntent(message) {
    if (!message || typeof message !== 'string') return false;
    const lower = message.toLowerCase();
    const hasUrl = /https?:\/\/[^\s]+/i.test(message);
    const hasAuditKeyword = lower.includes('audit') || lower.includes('analyse') || lower.includes('diagnostique') || lower.includes('inspecte');
    return hasUrl || hasAuditKeyword;
  }
  
  /**
   * Extrait la première URL valide du texte
   */
  static extractTargetUrl(message) {
    const match = message.match(/https?:\/\/[^\s]+/i);
    return match ? match[0] : null;
  }
  
  /**
   * Exécute l'audit en direct via le Service Binding bertho-ai-audit
   */
  static async runWebsiteAudit(targetUrl, env) {
    if (!targetUrl || !env.BERTHO_AI_AUDIT) return null;
    
    try {
      const secret = env.BERTHO_AI_SECRET || "";
      const auditRequest = new Request("https://bertho-ai-audit.internal/audit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${secret}`
        },
        body: JSON.stringify({ url: targetUrl })
      });
      
      const response = await env.BERTHO_AI_AUDIT.fetch(auditRequest);
      if (!response.ok) return null;
      
      const data = await response.json();
      if (!data || !data.content) return null;
      
      return {
        url: targetUrl,
        rawContent: data.content.substring(0, 12000), // Extrait utile pour le modèle
        contentType: data.contentType || 'text/html'
      };
    } catch (error) {
      console.warn('[Actions Engine] Erreur audit externe:', error);
      return null;
    }
  }
  
  /**
   * Formate les données techniques de l'audit pour le modèle
   */
  static buildAuditInstructionPayload(auditResult) {
    if (!auditResult) return "";
    return `\n\n<website_audit_data url="${auditResult.url}">\n${auditResult.rawContent}\n</website_audit_data>\n\nConsigne : Utilise les données réelles ci-dessus pour réaliser un diagnostic professionnel complet (Offres, SEO, Ergonomie, Performance et Recommandations).`;
  }
}