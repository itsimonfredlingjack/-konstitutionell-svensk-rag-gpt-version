/**
 * Response Modes - Re-exports from response-schema.ts
 *
 * This file exists for backwards compatibility.
 * All types are now defined in response-schema.ts
 */

export {
  type ResponseMode,
  type CanonicalResponse,
  type Citation,
  type DebugInfo,
  MODEL_CONFIG,
  createCanonicalResponse,
  parseCanonicalResponse,
  isValidCanonicalResponse,
} from './response-schema';

export { type OrchestrationDecision } from './orchestrator';

import type { PromptProfile } from '../swedish-prompt-profiles';

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY PROFILES - Kept for backwards compatibility
// ═══════════════════════════════════════════════════════════════════════════

export const CHAT_PROFILE: PromptProfile = {
  name: 'Conversational Assistant',
  purpose: 'Normal conversation without retrieval',
  temperature: 0.8,
  max_tokens: 300,

  systemPrompt: `Du är en hjälpsam svensk assistent som heter Constitutional-GPT.

REGLER:
• Svara som en normal människa, INTE som en jurist
• Använd ALDRIG retrieval-resultat eller lagcitat
• Hänvisa INTE till SFS, RF, OSL, paragraf eller lagrum
• Om frågan är oklar: ställ EN följdfråga för att förstå bättre
• Var vänlig, kort och direkt
• Max 5 rader

VAD DU KAN HJÄLPA MED:
• Frågor om svensk lagstiftning och myndighetsdokument
• Förklara juridiska begrepp på enkel svenska
• Söka i 535 000 dokument från riksdagen och myndigheter
• Hitta relevanta propositioner, SOU:er och betänkanden

TON: Som en kunnig vän, inte en myndighet.`,
};

export const ASSIST_PROFILE: PromptProfile = {
  name: 'Smart Assistant',
  purpose: 'Helpful answers with optional sources',
  temperature: 0.6,
  max_tokens: 400,

  systemPrompt: `Du är en kunnig svensk assistent.

REGLER:
• Svara kort och konkret på frågan
• Om du har källor: använd dem men var inte övertydlig
• Avsluta med: "Vill du se källorna?" (om du använde källor)
• Max 8 rader
• Undvik stela formuleringar

TON: Byråkrat-light, men mänsklig.`,
};

// ═══════════════════════════════════════════════════════════════════════════
// MODE DESCRIPTIONS (för UI/debug)
// ═══════════════════════════════════════════════════════════════════════════

import type { ResponseMode } from './response-schema';

export const MODE_DESCRIPTIONS: Record<ResponseMode, string> = {
  CHAT: 'Konversation utan dokumentsökning',
  ASSIST: 'Svar med valfria källor',
  EVIDENCE: 'Fullständig verifiering med citat',
};

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Bestäm om style pass ska appliceras baserat på mode
 */
export function shouldApplyStylePass(mode: ResponseMode): boolean {
  return mode === 'ASSIST';
}

/**
 * Bestäm om följdfrågor ska genereras
 */
export function shouldGenerateFollowups(mode: ResponseMode): boolean {
  return mode === 'CHAT' || mode === 'ASSIST';
}

/**
 * Hämta profil för ett givet mode
 */
export function getProfileForMode(mode: ResponseMode): PromptProfile {
  switch (mode) {
    case 'CHAT':
      return CHAT_PROFILE;
    case 'ASSIST':
      return ASSIST_PROFILE;
    case 'EVIDENCE':
      return ASSIST_PROFILE; // Fallback, should use ANSWER_PROFILE
  }
}
