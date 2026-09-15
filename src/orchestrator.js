/**
 * bertho-ai/src/orchestrator.js
 * BERTHO AI — INTENT ORCHESTRATOR (Haute Vélocité & Zéro Latence)
 */

import { AI_MODELS, runWithModelFallback } from "./model.js";
import { getCapabilities } from "./capabilities.js";

const VALID_ACTIONS = [
  "answer",
  "ask_clarification",
  "generate_image",
  "search_web",
  "website_audit",
  "sandbox"
];

const VALID_INTENTS = [
  "conversation",
  "question",
  "advice",
  "analysis",
  "creation",
  "image_generation",
  "web_search",
  "website_audit",
  "code_execution",
  "coding",
  "translation",
  "summarization",
  "other"
];

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0.5;
  }
  return Math.min(Math.max(number, 0), 1);
}

function normalizeDecision(decision = {}) {
  const intent = VALID_INTENTS.includes(decision.intent)
    ? decision.intent
    : "other";

  const action = VALID_ACTIONS.includes(decision.action)
    ? decision.action
    : "answer";

  return {
    intent,
    action,
    confidence: normalizeConfidence(decision.confidence),
    objective: cleanText(decision.objective),
    reasoning: cleanText(decision.reasoning),
    toolInput: cleanText(decision.toolInput),
    needsClarification: action === "ask_clarification",
    clarificationQuestion:
      action === "ask_clarification"
        ? cleanText(decision.clarificationQuestion)
        : ""
  };
}

/**
 * Fast-path déterministe (0 milliseconde de latence)
 * Résout immédiatement les salutations et les cas évidents sans gaspiller de GPU.
 */
function getFastPathDecision(message = "", context = {}) {
  const clean = cleanText(message).toLowerCase();

  // 1. Salutations directes (0 ms)
  const directGreetings = [
    "salut", "bonjour", "bonsoir", "coucou", "hello", "hi", "hey",
    "mbote", "yo", "kedu", "salut !", "bonjour !", "bonsoir !"
  ];
  if (directGreetings.includes(clean)) {
    return {
      intent: "conversation",
      action: "answer",
      confidence: 1.0,
      objective: "Saluer l'utilisateur avec stature et prestance",
      reasoning: "Fast-path : salutation directe identifiée (0ms)",
      toolInput: "",
      needsClarification: false,
      clarificationQuestion: ""
    };
  }

  // 2. Image présente dans le contexte sans commande d'outil externe
  const hasAuditKeyword = /(audit|analyse|diagnostique|inspecte|scan)/i.test(clean);
  const hasSearchKeyword = /(cherche|recherche sur le web|actualité)/i.test(clean);

  if (context?.image && !hasAuditKeyword && !hasSearchKeyword) {
    return {
      intent: "analysis",
      action: "answer",
      confidence: 1.0,
      objective: "Analyse visuelle multimodale approfondie de l'image transmise",
      reasoning: "Fast-path : image détectée dans le contexte (0ms)",
      toolInput: "",
      needsClarification: false,
      clarificationQuestion: ""
    };
  }

  // 3. Détection d'URL pour Audit avec auto-réparation de protocole
  const urlMatch = message.match(/(https?:\/\/[^\s"'<>]+|(?:\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s"'<>]*)?)/i);
  if (hasAuditKeyword && urlMatch) {
    let targetUrl = urlMatch[0].replace(/[),.!?]+$/, "");
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      targetUrl = `https://${targetUrl}`;
    }
    return {
      intent: "website_audit",
      action: "website_audit",
      confidence: 0.98,
      objective: `Audit technique du site web : ${targetUrl}`,
      reasoning: "Fast-path : audit détecté avec URL valide (0ms)",
      toolInput: targetUrl,
      needsClarification: false,
      clarificationQuestion: ""
    };
  }

  return null;
}

function buildDecisionPrompt(
  message,
  history,
  context,
  capabilities
) {
  const safeHistory = Array.isArray(history)
    ? history.slice(-6)
    : [];

  const historyText = safeHistory
    .map(item => {
      const role =
        item?.role === "assistant"
          ? "ASSISTANT"
          : "USER";

      const content =
        typeof item?.content === "string"
          ? item.content
          : "";

      return `${role}: ${content}`;
    })
    .join("\n");

  return `Tu es le moteur de décision sémantique ultra-rapide de Bertho AI.
Ta mission est de classifier la demande et de retourner UNIQUEMENT un objet JSON valide, sans aucun texte autour.

ACTIONS :
1. "answer" : Réponse textuelle, conseil, stratégie, code sans exécution, ou analyse d'image.
2. "ask_clarification" : Impossible de comprendre sans précision.
3. "generate_image" : Demande formelle de créer/générer une image maintenant.
4. "search_web" : Demande de faits actuels ou recherche externe requise.
5. "website_audit" : Audit d'une URL de site web.
6. "sandbox" : Exécution réelle de code ou calcul complexe dans un bac à sable.

CONTEXTE :
Produit : ${context?.product || "inconnu"}
Capacités : ${JSON.stringify(capabilities)}
Historique :
${historyText || "Aucun"}

MESSAGE :
${message}

FORMAT JSON STRICT REQUIS :
{
  "intent": "conversation",
  "action": "answer",
  "confidence": 0.95,
  "objective": "Objectif réel de l'utilisateur",
  "reasoning": "Courte justification",
  "toolInput": "",
  "clarificationQuestion": ""
}`.trim();
}

function AI_MODELS_SAFE(env) {
  // L'orchestrateur utilise TOUJOURS Llama 70B Turbo pour une décision en quelques millisecondes
  return (
    env?.BERTHO_ORCHESTRATOR_MODEL ||
    AI_MODELS.turbo
  );
}

function extractModelText(result) {
  if (!result) return "";
  if (typeof result === "string") return result;
  if (typeof result.response === "string") return result.response;
  if (typeof result.result === "string") return result.result;
  if (result.result && typeof result.result.response === "string") return result.result.response;
  if (typeof result.message === "string") return result.message;
  if (result.message && typeof result.message.response === "string") return result.message.response;
  return "";
}

function parseDecisionJSON(text) {
  if (!text) return {};

  // Élimination des balises <think> pour ne pas polluer le découpage JSON
  let clean = String(text)
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const firstBrace = clean.indexOf("{");
  const lastBrace = clean.lastIndexOf("}");

  if (
    firstBrace !== -1 &&
    lastBrace !== -1 &&
    lastBrace > firstBrace
  ) {
    clean = clean.slice(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(clean);
  } catch (error) {
    console.warn("[Orchestrator] JSON decision invalide :", clean);
    return {};
  }
}

export async function decide(
  env,
  {
    message,
    history = [],
    context = {}
  } = {}
) {
  const cleanMessage = cleanText(message);

  if (!cleanMessage && !context?.image) {
    return {
      intent: "other",
      action: "ask_clarification",
      confidence: 1,
      objective: "",
      reasoning: "Aucun message exploitable.",
      toolInput: "",
      needsClarification: true,
      clarificationQuestion: "Que souhaitez-vous faire ?"
    };
  }

  // 1. FAST-PATH DÉTERMINISTE (0 milliseconde)
  const fastDecision = getFastPathDecision(cleanMessage, context);
  if (fastDecision) {
    return fastDecision;
  }

  // 2. Décision assistée par classifieur rapide (256 tokens max)
  const capabilities = getCapabilities(env);
  const prompt = buildDecisionPrompt(
    cleanMessage,
    history,
    context,
    capabilities
  );

  const decisionModel = AI_MODELS_SAFE(env);

  try {
    const rawResult = await runWithModelFallback(
      env,
      decisionModel,
      {
        messages: [
          {
            role: "system",
            content:
              "Tu es le moteur de décision sémantique de Bertho AI. Retourne exclusivement l'objet JSON demandé. Ne réponds jamais directement à l'utilisateur."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 256, // Plafond strict : décision instantanée
        temperature: 0.1
      }
    );

    const text = extractModelText(rawResult);
    const parsed = parseDecisionJSON(text);

    return normalizeDecision(parsed);

  } catch (error) {
    console.error(
      "[Orchestrator] Erreur modèle décision :",
      error?.message || String(error)
    );

    return {
      intent: "conversation",
      action: "answer",
      confidence: 0.8,
      objective: cleanMessage,
      reasoning: "Repli immédiat sur réponse conversationnelle directe.",
      toolInput: "",
      needsClarification: false,
      clarificationQuestion: ""
    };
  }
}

export function requiresTool(decision) {
  if (!decision) return false;
  return [
    "generate_image",
    "search_web",
    "website_audit",
    "sandbox"
  ].includes(decision.action);
}

export function validateDecision(decision) {
  const normalized = normalizeDecision(decision);

  if (
    normalized.action !== "answer" &&
    normalized.confidence < 0.65
  ) {
    return {
      ...normalized,
      action: "ask_clarification",
      needsClarification: true,
      clarificationQuestion:
        "Pouvez-vous préciser ce que vous souhaitez que je fasse exactement ?"
    };
  }

  if (
    normalized.action === "generate_image" &&
    !normalized.objective
  ) {
    return {
      ...normalized,
      action: "ask_clarification",
      needsClarification: true,
      clarificationQuestion:
        "Que souhaitez-vous que je crée exactement comme visuel ?"
    };
  }

  if (
    normalized.action === "website_audit" &&
    !normalized.toolInput
  ) {
    return {
      ...normalized,
      action: "ask_clarification",
      needsClarification: true,
      clarificationQuestion:
        "Quel est l'URL du site web que vous souhaitez que j'audite ?"
    };
  }

  return normalized;
}