/**
 * bertho-ai/src/orchestrator.js
 * BERTHO AI — INTENT ORCHESTRATOR
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

function buildDecisionPrompt(message, history, context, capabilities) {
  const safeHistory = Array.isArray(history) ? history.slice(-12) : [];
  const historyText = safeHistory
    .map(item => {
      const role = item.role === "assistant" ? "ASSISTANT" : "USER";
      return `${role}: ${item.content}`;
    })
    .join("\n");

  return `
Tu es le moteur de décision de Bertho AI.
Ta mission n'est PAS de répondre à l'utilisateur.
Ta mission est de comprendre ce qu'il cherche réellement à accomplir et de décider si une action spécialisée est nécessaire.

PRINCIPE CRITIQUE :
NE DÉCLENCHE JAMAIS UN OUTIL UNIQUEMENT À CAUSE D'UN MOT-CLÉ.
Tu dois comprendre l'intention dans son contexte.

Exemple :
"Je crée une image pour mon ebook, tu me conseilles quoi ?"
Ce n'est PAS une demande de génération d'image. C'est une demande de CONSEIL.

À l'inverse :
"Crée-moi maintenant la couverture de mon ebook."
est une demande de GÉNÉRATION D'IMAGE.

==================================================
CONTEXTE
==================================================
Produit : ${context?.product || "inconnu"}
Espace : ${context?.area || "inconnu"}
Page : ${context?.page || "inconnue"}
Source : ${context?.source || "inconnue"}
Langue : ${context?.language || "fr"}
Modèle sélectionné : ${context?.model || "turbo"}
==================================================
CAPACITÉS RÉELLEMENT DISPONIBLES
==================================================
${JSON.stringify(capabilities, null, 2)}
==================================================
HISTORIQUE RÉCENT
==================================================
${historyText || "Aucun historique disponible."}

==================================================
MESSAGE ACTUEL
==================================================
${message}

==================================================
DÉCISION
==================================================
Choisis UNE intention principale parmi :
${VALID_INTENTS.join(", ")}

Puis choisis UNE action principale parmi :
${VALID_ACTIONS.join(", ")}

RÈGLES DE DÉCISION :
1. "answer" : Utilise cette action lorsqu'une réponse textuelle normale ou un conseil suffit.
2. "ask_clarification" : Utilise-la uniquement lorsqu'il est réellement impossible de comprendre l'objectif sans une précision.
3. "generate_image" : Utilise-la uniquement lorsque l'utilisateur demande réellement de générer, créer, produire ou modifier une image maintenant.
4. "search_web" : Utilise-la lorsque la demande nécessite réellement des informations actuelles ou une recherche externe.
5. "website_audit" : Utilise-la lorsqu'un utilisateur demande réellement d'auditer un site web et qu'une URL est fournie.
6. "sandbox" : Utilise-la lorsqu'une exécution réelle de code ou d'un calcul est nécessaire.
7. Si l'utilisateur demande du code mais ne demande pas de l'exécuter : action = answer.
8. Si l'utilisateur demande une stratégie, un conseil ou une explication : action = answer.
9. "creation" ne signifie pas automatiquement "image_generation". Une création peut être un texte, une stratégie, du code, une structure ou une idée.
10. Une mention d'image, photo, logo, couverture, illustration ou visuel ne constitue PAS à elle seule une demande de génération.
11. Une demande de conseil, d'avis, de recommandation ou d'idée concernant une image doit rester "answer", sauf si l'utilisateur demande explicitement de produire l'image.
12. Le dernier message doit être interprété comme une continuation naturelle de la conversation lorsqu'il dépend des tours précédents.
13. Les expressions comme "finalement", "plutôt", "je préfère", "change", "modifie", "garde ça mais...", "fais plutôt..." peuvent modifier une demande précédente. Analyse alors l'ensemble du contexte avant de décider.
14. Ne demande pas à l'utilisateur de répéter une information déjà présente dans l'historique.

==================================================
FORMAT DE SORTIE
==================================================
Réponds UNIQUEMENT avec un JSON valide.
Format exact :
{
  "intent": "conversation",
  "action": "answer",
  "confidence": 0.95,
  "objective": "Objectif réel de l'utilisateur",
  "reasoning": "Courte justification de la décision",
  "toolInput": "",
  "clarificationQuestion": ""
}
`.trim();
}

function AI_MODELS_SAFE(env) {
  return (
    env?.BERTHO_ORCHESTRATOR_MODEL ||
    AI_MODELS.neural ||
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
  return "";
}

function parseDecisionJSON(text) {
  if (!text) return {};
  let clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const firstBrace = clean.indexOf("{");
  const lastBrace = clean.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    clean = clean.slice(firstBrace, lastBrace + 1);
  }
  try {
    return JSON.parse(clean);
  } catch (error) {
    console.warn("[Orchestrator] JSON decision invalide:", clean);
    return {};
  }
}

export async function decide(env, {
  message,
  history = [],
  context = {}
} = {}) {
  const cleanMessage = cleanText(message);
  if (!cleanMessage) {
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

const capabilities = getCapabilities(env);

const prompt = buildDecisionPrompt(
  cleanMessage,
  history,
  context,
  capabilities
);
  const decisionModel = AI_MODELS_SAFE(env);

try {


  const jsonModeSupportedModels = new Set([
    AI_MODELS.turbo,
    AI_MODELS.deepseek_r1
  ]);

  const useJsonMode = jsonModeSupportedModels.has(decisionModel);

  const modelOptions = useJsonMode
    ? {
        response_format: {
          type: "json_schema",
          json_schema: {
            type: "object",
            properties: {
              intent: {
                type: "string",
                enum: VALID_INTENTS
              },
              action: {
                type: "string",
                enum: VALID_ACTIONS
              },
              confidence: {
                type: "number",
                minimum: 0,
                maximum: 1
              },
              objective: {
                type: "string"
              },
              reasoning: {
                type: "string"
              },
              toolInput: {
                type: "string"
              },
              clarificationQuestion: {
                type: "string"
              }
            },
            required: [
              "intent",
              "action",
              "confidence",
              "objective",
              "reasoning",
              "toolInput",
              "clarificationQuestion"
            ]
          }
        }
      }
    : {};

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
      max_tokens: 4096,
      temperature: 0.1,
      ...modelOptions
    }
  );

  const text = extractModelText(rawResult);
  const parsed = parseDecisionJSON(text);

  return normalizeDecision(parsed);

} catch (error) {
  console.error(
    "[Orchestrator] Decision model error:",
    error?.message || String(error),
    error
  );

  return {
    intent: "other",
    action: "answer",
    confidence: 0,
    objective: cleanMessage,
    reasoning: "Orchestrateur indisponible : réponse standard.",
    toolInput: "",
    needsClarification: false,
    clarificationQuestion: ""
  };
}
}

export function requiresTool(decision) {
  if (!decision) return false;
  return ["generate_image", "search_web", "website_audit", "sandbox"].includes(decision.action);
}

export function validateDecision(decision) {
  const normalized = normalizeDecision(decision);

  // 1. Niveau de confiance suffisant
  if (normalized.action !== "answer" && normalized.confidence < 0.65) {
    return {
      ...normalized,
      action: "ask_clarification",
      needsClarification: true,
      clarificationQuestion:
        "Pouvez-vous préciser ce que vous souhaitez que je fasse exactement ?"
    };
  }

  // 2. Vérification des paramètres requis pour la génération d'image
  if (normalized.action === "generate_image" && !normalized.objective) {
    return {
      ...normalized,
      action: "ask_clarification",
      needsClarification: true,
      clarificationQuestion:
        "Que souhaitez-vous que je crée exactement comme visuel ?"
    };
  }

  // 3. Vérification des paramètres requis pour l'audit de site web
  if (normalized.action === "website_audit" && !normalized.toolInput) {
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
