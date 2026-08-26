// ============================================================
// BERTHO AI — CONTEXT LAYER
// ============================================================

const VALID_PRODUCTS = [
  "berthoplay",
  "berthoweb",
  "berthopay",
  "berthomarketplace",
  "berthodocs",
  "berthoai",
  "ecosystem"
];

const VALID_AREAS = [
  "home",
  "ai",
  "games",
  "social",
  "community",
  "messages",
  "payments",
  "commerce",
  "documents",
  "services",
  "general"
];

const VALID_LANGUAGES = [
  "fr",
  "en",
  "ln",
  "sw",
  "bm"
];

function normalizeString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const result = value.trim().toLowerCase();

  return result || null;
}

function normalizeProduct(value) {
  const product = normalizeString(value);

  if (!product) {
    return "ecosystem";
  }

  return VALID_PRODUCTS.includes(product)
    ? product
    : "ecosystem";
}

function normalizeArea(value) {
  const area = normalizeString(value);

  if (!area) {
    return "general";
  }

  return VALID_AREAS.includes(area)
    ? area
    : "general";
}

function normalizeLanguage(value) {
  const language = normalizeString(value);

  if (!language) {
    return null;
  }

  return VALID_LANGUAGES.includes(language)
    ? language
    : null;
}


// ============================================================
// CREATE CONTEXT
// ============================================================

export function createContext(body = {}) {

  const input =
    body.context &&
    typeof body.context === "object"
      ? body.context
      : {};

  return {

    product:
      normalizeProduct(
        input.product || body.product
      ),

    area:
      normalizeArea(
        input.area
      ),

    page:
      normalizeString(
        input.page
      ),

    source:
      normalizeString(
        input.source
      ),

    language:
      normalizeLanguage(
        input.language
      )

  };
}


// ============================================================
// CONTEXT → AI INSTRUCTIONS
// ============================================================

export function buildContextInstructions(context) {

  return `
CONTEXTE ACTUEL DE L'UTILISATEUR

Produit :
${context.product}

Espace :
${context.area}

Page :
${context.page || "inconnue"}

Source :
${context.source || "inconnue"}

Langue :
${context.language || "auto-détection"}


RÈGLES

- Adapte naturellement ta réponse au contexte actuel.
- Si l'utilisateur se trouve déjà dans un produit Bertho, reconnais ce contexte lorsque cela est pertinent.
- Ne prétends jamais qu'un produit, service ou fonctionnalité existe si les informations officielles ne le confirment pas.
- Ne révèle jamais d'informations internes ou de secrets techniques.
- N'oriente pas inutilement l'utilisateur vers un autre produit Bertho.
- Si une autre plateforme Bertho est réellement pertinente, explique clairement pourquoi.
- Dans l'espace Bertho AI, tu peux fournir un accompagnement plus large : apprentissage, développement, recherche, analyse et assistance technique.
- Dans les autres espaces, reste prioritairement pertinent au contexte de cet espace.
- Si le contexte est insuffisant, ne l'invente pas.
`;
}