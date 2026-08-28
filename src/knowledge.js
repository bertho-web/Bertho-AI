/**
 * bertho-ai/src/knowledge.js
 * Base de connaissances officielle et opérationnelle de l'écosystème Bertho.
 */

export const BERTHO_KNOWLEDGE = {

  identity: {
    name: "Bertho",
    aiName: "Bertho AI",

    description:
      "Bertho désigne à la fois le diminutif associé à son fondateur, Gilberto LEBIBI, et l'écosystème technologique construit autour de sa vision.",

    founder: {
      name: "Gilberto LEBIBI",
      knownAs: "Bertho",
      profile:
        "Passionné par la technologie, l'innovation et la création de produits numériques."
    }
  },

  origin: {
    startDate: "9 mai 2026",

    story:
      "Le développement de Bertho a commencé le 9 mai 2026 avec des moyens limités et sans expérience préalable en programmation. L'intelligence artificielle a notamment servi d'outil d'apprentissage, d'expérimentation et d'accélération dans la construction des premiers systèmes.",

    evolution:
      "Après une première phase de construction individuelle, Bertho s'est progressivement développé autour d'un écosystème de produits et d'une collaboration avec des développeurs et des étudiants."
  },

  vision: {
    description:
      "Bertho cherche à contribuer à l'évolution numérique en concevant des produits et services technologiques capables de simplifier certaines expériences, connecter les utilisateurs et accompagner l'innovation.",

    ambition:
      "Construire progressivement un écosystème technologique cohérent dans lequel plusieurs services numériques peuvent fonctionner ensemble."
  },

  products: {

    berthoplay: {
      name: "BerthoPlay",
      status: "active",
      description:
        "Plateforme numérique souveraine orientée vers le divertissement, les jeux vidéo 3D, l'apprentissage, les interactions sociales, les clans, les défis et les compétitions.",
      url: "https://berthoplay.pages.dev"
    },

    berthoweb: {
      name: "BerthoWeb",
      status: "active",
      description:
        "Site officiel de l'écosystème Bertho et structure dédiée à l'accompagnement des entreprises dans leur transformation digitale.",
      url: "https://bertho-web.pages.dev"
    },

    berthopay: {
      name: "BerthoPay",
      status: "development",
      description:
        "Passerelle et infrastructure de paiement PWA sécurisée (14 langues) actuellement en développement.",
      url: "https://berthopay.pages.dev"
    },

    marketplace: {
      name: "Bertho Marketplace",
      status: "development",
      description:
        "Projet de marketplace mondiale réunissant commerçants et acheteurs sur une plateforme commune (cible de 180 pays et 14 langues dont Lingala, Swahili, Bambara).",
      url: "https://bertho-markeplace.pages.dev"
    },

    docs: {
      name: "Bertho Docs",
      status: "development",
      description:
        "Espace documentaire dédié aux diagnostics d'entreprises, analyses et publications de l'écosystème.",
      url: "https://bertho-docs.pages.dev"
    }
  },

  // ============================================================
  // MANUEL OPÉRATIONNEL EXACT DE BERTHOPLAY (VÉRITÉS TECHNIQUES)
  // ============================================================
  berthoplay_rules: {

    authentication: {
      method: "Numéro de téléphone + Pseudonyme + Mot de passe (min 6 caractères).",
      emailRequired: false,
      verificationFlow: "AUCUN email ni lien de confirmation n'est requis. L'inscription est immédiate dès validation du formulaire.",
      loginButtonText: "SE CONNECTER / S'INSCRIRE",
      phoneValidation: "Contrôle automatique du pays et préfixes opérateurs stricts pour le Congo (+242 : 06 MTN, 05 Airtel, 04 Azur)."
    },

    economy: {
      currencyName: "BerthoCoins (🪙)",
      earning: "Gagnés à chaque victoire et étape de jeu terminée. Affichés en haut à droite du Hub et sur le profil."
    },

    games: {
      billiards: "Billard 3D Pro — Règles de la bille 8, 150 BerthoCoins par victoire.",
      bubble: "Bubble Shooter AAA — 50 étapes avec système d'étoiles (150 étoiles max).",
      car: "Conduite & Course — 10 niveaux chronométrés avec duels, slalom et Boss Hypercar/Grand Prix au niveau 10.",
      bike: "Moto Superbike — 10 étapes de vitesse avec duels MotoGP et Boss Rider au niveau 10.",
      checkers: "Dames Pro — Règles officielles françaises de dames, compteur de victoires.",
      chess: "Échecs Danger — Règles d'échecs classiques, compteur de victoires.",
      horde: "Horde Survivor 3D — Jeu de survie et d'endurance avec meilleur score.",
      word: "Mots Connectés — 50 étapes de roue de mots avec gains de pièces."
    },

    chat: {
      antiSpamLimit: "Maximum 2 messages consécutifs autorisés tant que l'allié n'a pas répondu.",
      features: "Messages texte, vocaux avec onde sonore waveform, envoi de photos compressées et appels audio/vidéo WebRTC en direct."
    },

    clans: {
      cost: "500 BerthoCoins requis pour fonder un clan. Le fondateur devient automatiquement CHEF (👑).",
      rule: "Un joueur ne peut appartenir qu'à un seul clan à la fois.",
      wall: "Mur de discussion privé réservé exclusivement aux membres du clan."
    },

    navigation: {
      accountSettings: "Bouton 'Paramètres profil' ouvre account-settings.js en plein écran. L'icône ⚙️ en haut à droite ouvre settings.js en plein écran (22 langues, sons, permissions micro/push, support). Sortie par swipe gauche vers droite.",
      workspace: "L'onglet AI du bas est un grand atelier immersif plein écran (Claude/GPT) avec sélecteur de modèles (Turbo, Neural, Gaming), historique et dictée vocale."
    }
  }
};