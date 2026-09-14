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

function buildDecisionPrompt(
  message,
  history,
  context,
  capabilities
) {
  const safeHistory = Array.isArray(history)
    ? history.slice(-12)
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

  return `
Tu es le moteur de décision sémantique de Bertho AI.

Ta mission n'est PAS de répondre à l'utilisateur.
Ta mission est de comprendre ce qu'il cherche réellement à accomplir et de déterminer l'action appropriée.

PRINCIPE CRITIQUE :
NE DÉCLENCHE JAMAIS UN OUTIL UNIQUEMENT À CAUSE D'UN MOT-CLÉ.
Analyse toujours l'intention complète et le contexte.

Exemple :
"Je crée une image pour mon ebook, tu me conseilles quoi ?"
=> CONSEIL, donc action = "answer".

"Crée-moi maintenant la couverture de mon ebook."
=> GÉNÉRATION D'IMAGE, donc action = "generate_image".

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
INTENTIONS DISPONIBLES
==================================================

${VALID_INTENTS.join(", ")}

==================================================
ACTIONS DISPONIBLES
==================================================

${VALID_ACTIONS.join(", ")}

==================================================
RÈGLES DE DÉCISION
==================================================

1. "answer"
Utilise cette action lorsqu'une réponse textuelle normale, une explication, une recommandation, une stratégie, une analyse ou un conseil suffit.

2. "ask_clarification"
Utilise cette action uniquement lorsqu'il est réellement impossible de comprendre l'objectif sans précision supplémentaire.

3. "generate_image"
Utilise cette action uniquement lorsque l'utilisateur demande réellement de générer, créer, produire ou modifier une image maintenant.

4. "search_web"
Utilise cette action lorsque la demande nécessite réellement une recherche externe ou des informations actuelles.

5. "website_audit"
Utilise cette action lorsqu'un audit réel de site web est demandé et qu'une URL exploitable est disponible.

6. "sandbox"
Utilise cette action lorsqu'une exécution réelle de code, un calcul ou une vérification dans un environnement d'exécution est nécessaire.

7. Si l'utilisateur demande du code mais ne demande pas de l'exécuter :
action = "answer".

8. Si l'utilisateur demande une stratégie, un conseil, une recommandation ou une explication :
action = "answer".

9. "creation" ne signifie PAS automatiquement "image_generation".
Une création peut être du texte, du code, une stratégie, une structure ou une idée.

10. Une simple mention d'une image, photo, illustration, couverture, logo ou visuel ne constitue PAS une demande de génération.

11. Une demande d'avis, de conseil ou de recommandation concernant une image reste :
action = "answer".

12. Le dernier message doit être interprété comme une continuation naturelle de la conversation lorsqu'il dépend des messages précédents.

13. Les expressions :
"finalement", "plutôt", "je préfère", "change", "modifie",
"garde ça mais...", "fais plutôt..."
peuvent modifier une demande précédente.
Analyse alors l'ensemble du contexte.

14. Ne demande jamais à l'utilisateur de répéter une information déjà présente dans l'historique.

15. Pour une demande directe d'action spécialisée, récupère dans :
- objective : l'objectif précis
- toolInput : URL, requête, code ou autre entrée nécessaire à l'outil

16. Si plusieurs interprétations sont possibles mais qu'une interprétation est nettement plus probable, choisis-la plutôt que de demander inutilement une clarification.

==================================================
FORMAT DE SORTIE
==================================================

Retourne UNIQUEMENT un objet JSON valide.

Aucun texte avant ou après le JSON.

Format :

{
  "intent": "conversation",
  "action": "answer",
  "confidence": 0.95,
  "objective": "Objectif réel de l'utilisateur",
  "reasoning": "Courte justification",
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
  if (!result) {
    return "";
  }

  if (typeof result === "string") {
    return result;
  }

  if (typeof result.response === "string") {
    return result.response;
  }

  if (typeof result.result === "string") {
    return result.result;
  }

  if (
    result.result &&
    typeof result.result.response === "string"
  ) {
    return result.result.response;
  }

  if (typeof result.message === "string") {
    return result.message;
  }

  if (
    result.message &&
    typeof result.message.response === "string"
  ) {
    return result.message.response;
  }

  return "";
}

function parseDecisionJSON(text) {
  if (!text) {
    return {};
  }

  let clean = String(text)
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
    clean = clean.slice(
      firstBrace,
      lastBrace + 1
    );
  }

  try {
    return JSON.parse(clean);
  } catch (error) {
    console.warn(
      "[Orchestrator] JSON decision invalide:",
      clean
    );

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

  if (!cleanMessage) {
    return {
      intent: "other",
      action: "ask_clarification",
      confidence: 1,
      objective: "",
      reasoning: "Aucun message exploitable.",
      toolInput: "",
      needsClarification: true,
      clarificationQuestion:
        "Que souhaitez-vous faire ?"
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

    const useJsonMode =
      jsonModeSupportedModels.has(decisionModel);

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
      reasoning:
        "Orchestrateur indisponible : réponse standard.",
      toolInput: "",
      needsClarification: false,
      clarificationQuestion: ""
    };
  }
}

export function requiresTool(decision) {
  if (!decision) {
    return false;
  }

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