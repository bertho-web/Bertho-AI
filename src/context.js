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


// ============================================================
// NORMALISATION
// ============================================================

function normalizeString(value) {

  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const normalized =
    value.trim().toLowerCase();

  return normalized || null;
}


// ============================================================
// PRODUCT
// ============================================================

function normalizeProduct(value) {

  const product =
    normalizeString(value);

  if (
    !product ||
    !VALID_PRODUCTS.includes(product)
  ) {
    return "ecosystem";
  }

  return product;
}


// ============================================================
// AREA
// ============================================================

function normalizeArea(value) {

  const area =
    normalizeString(value);

  if (
    !area ||
    !VALID_AREAS.includes(area)
  ) {
    return "general";
  }

  return area;
}


// ============================================================
// LANGUAGE
// ============================================================

function normalizeLanguage(value) {

  const language =
    normalizeString(value);

  if (
    !language ||
    !VALID_LANGUAGES.includes(language)
  ) {
    return null;
  }

  return language;
}


// ============================================================
// CONTEXT CREATION
// ============================================================

export function createContext(input = {}) {

  const context =
    input.context || {};


  return {

    product:
      normalizeProduct(
        context.product
      ),

    area:
      normalizeArea(
        context.area
      ),

    page:
      normalizeString(
        context.page
      ),

    source:
      normalizeString(
        context.source
      ),

    language:
      normalizeLanguage(
        context.language
      ),

    authenticated:
      Boolean(
        input.authenticated
      ),

    userId:
      input.userId || null,

    timestamp:
      new Date().toISOString()

  };

}


// ============================================================
// CONTEXT DESCRIPTION
// ============================================================

export function describeContext(
  context
) {

  const product =
    context?.product ||
    "ecosystem";

  const area =
    context?.area ||
    "general";

  const page =
    context?.page ||
    "unknown";

  const language =
    context?.language ||
    "auto";

  return {

    product,

    area,

    page,

    language,

    source:
      context?.source ||
      null

  };

}


// ============================================================
// AI CONTEXT INSTRUCTIONS
// ============================================================

export function buildContextInstructions(
  context
) {

  const description =
    describeContext(
      context
    );


  return `
CONTEXTE DE LA REQUÊTE

Produit :
${description.product}

Espace :
${description.area}

Page :
${description.page}

Langue demandée :
${description.language}

Source :
${description.source || "non spécifiée"}

RÈGLES DE CONTEXTE

1. Adapte ta réponse au produit et à l'espace dans lequel l'utilisateur se trouve.

2. Ne présente jamais comme disponible une fonctionnalité qui est seulement prévue ou en développement.

3. Ne crée jamais de produit, service, domaine ou URL officielle qui n'existe pas dans les informations officielles de Bertho.

4. Si la demande concerne un autre produit de l'écosystème, tu peux l'expliquer ou orienter l'utilisateur vers celui-ci uniquement si ce produit existe officiellement et que cette orientation est pertinente.

5. Si l'utilisateur est déjà dans un espace Bertho pertinent, reconnais ce contexte naturellement au lieu de l'ignorer.

6. Dans l'espace Bertho AI, tu peux proposer un accompagnement plus large : apprentissage, développement, recherche, analyse et utilisation des outils disponibles.

7. Dans les autres espaces, privilégie l'accompagnement lié à la mission de la plateforme et évite de détourner inutilement l'utilisateur vers Bertho AI.

8. Si le contexte ne permet pas de déterminer précisément le produit concerné, ne l'invente pas. Réponds de manière générale ou demande une précision.

9. La langue doit être adaptée à la langue explicitement fournie. Si aucune langue n'est fournie, déduis-la du message de l'utilisateur.
`;
}