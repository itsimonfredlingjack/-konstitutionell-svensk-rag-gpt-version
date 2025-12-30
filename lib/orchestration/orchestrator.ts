/**
 * Response Orchestrator - Bestämmer mode och retrieval-strategi
 *
 * Analyserar användarens fråga och väljer:
 * - CHAT: Ingen retrieval (småprat, meta, feedback, vaga frågor)
 * - ASSIST: Smart retrieval med tvåpass (Gemma → GPT-SW3)
 * - EVIDENCE: Full retrieval med teknisk ton (Gemma only)
 *
 * MODELS:
 * - Gemma 3 12B (BRAIN): ASSIST/EVIDENCE (faktasvar)
 * - GPT-SW3 6.7B (VOICE): CHAT + style pass
 */

import { analyzeQuery, type QueryAnalysis, type QueryType } from '../query-intelligence';
import { type ResponseMode } from './response-schema';
import { ANSWER_PROFILE, type PromptProfile } from '../swedish-prompt-profiles';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface OrchestrationDecision {
  mode: ResponseMode;
  queryType: QueryType;
  retrieve: boolean;
  showCitations: boolean;
  applyStylePass: boolean;
  profile: PromptProfile;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// QueryTypes som triggar CHAT mode (ingen retrieval, GPT-SW3)
const CHAT_MODE_TYPES: QueryType[] = [
  'SMALLTALK',
  'SYSTEM_META',
  'META_CAPABILITIES',
  'FEEDBACK',
  'TASK_HELP',
  'INCOMPLETE_INPUT',    // "Vad" → följdfråga + 3 förslag
  'VAGUE_QUERY',         // "Jag undrar om OSL" → hjälp precisera
  'LEGAL_AMBIGUOUS',     // Otydlig juridisk fråga
  'ABBREVIATION',        // "TF?" → förklara vad det är först
];

// QueryTypes som triggar EVIDENCE mode (full verifiering, Gemma only)
const EVIDENCE_MODE_TYPES: QueryType[] = [
  'LEGAL_EXPLICIT',      // "OSL 21 kap 7 §"
];

// Profiles for each mode
const CHAT_PROFILE: PromptProfile = {
  name: 'Chat Assistant',
  purpose: 'Natural conversation without retrieval',
  temperature: 0.8,
  max_tokens: 150,
  systemPrompt: `Du är Constitutional-GPT, en vänlig svensk AI-assistent.
Specialitet: Svenska myndighetsdokument och juridik.
Svara kort, naturligt, och hjälpsamt.
Använd ALDRIG lagrum eller dokumentcitat.`,
};

const ASSIST_PROFILE: PromptProfile = {
  name: 'Smart Assistant',
  purpose: 'Helpful answers with optional sources',
  temperature: 0.6,
  max_tokens: 400,
  systemPrompt: `Du är en kunnig svensk assistent.
Svara kort och konkret på frågan.
Om du har källor: använd dem men var inte övertydlig.
Max 8 rader.`,
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ORCHESTRATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Bestäm response mode och strategi baserat på användarens fråga
 */
export function orchestrate(query: string): OrchestrationDecision {
  // 1. Analysera frågan
  const analysis = analyzeQuery(query);

  console.log(`🎭 Orchestrator: "${query.substring(0, 40)}..." → ${analysis.type}`);

  // 2. Bestäm mode baserat på analys
  const mode = determineMode(analysis);

  // 3. Bygg beslut
  const decision: OrchestrationDecision = {
    mode,
    queryType: analysis.type,
    retrieve: mode !== 'CHAT',
    showCitations: mode === 'EVIDENCE',
    applyStylePass: mode === 'ASSIST',  // Style pass only for ASSIST
    profile: getProfile(mode),
  };

  console.log(`   → Mode: ${mode}, QueryType: ${analysis.type}, Retrieve: ${decision.retrieve}`);

  return decision;
}

/**
 * Bestäm mode baserat på QueryAnalysis
 */
function determineMode(analysis: QueryAnalysis): ResponseMode {
  const { type, shouldRetrieve, clarificationNeeded } = analysis;

  // CHAT: Frågor som inte behöver dokument
  if (CHAT_MODE_TYPES.includes(type)) {
    return 'CHAT';
  }

  // CHAT: Om förtydligande behövs
  if (clarificationNeeded) {
    return 'CHAT';
  }

  // EVIDENCE: Explicita lagreferenser
  if (EVIDENCE_MODE_TYPES.includes(type)) {
    return 'EVIDENCE';
  }

  // CHAT: Om shouldRetrieve är false
  if (!shouldRetrieve) {
    return 'CHAT';
  }

  // ASSIST: Allt annat (juridiska frågor)
  return 'ASSIST';
}

/**
 * Hämta rätt profil för mode
 */
function getProfile(mode: ResponseMode): PromptProfile {
  switch (mode) {
    case 'CHAT':
      return CHAT_PROFILE;
    case 'ASSIST':
      return ASSIST_PROFILE;
    case 'EVIDENCE':
      return ANSWER_PROFILE;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GUARDRAILS - Blockera retrieval i CHAT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Guardrail: Verify that CHAT mode doesn't trigger retrieval
 * Call this in agentQuery() to enforce the rule
 */
export function assertNoRetrievalInChat(decision: OrchestrationDecision): void {
  if (decision.mode === 'CHAT' && decision.retrieve) {
    console.error('🚨 GUARDRAIL VIOLATION: Retrieval requested in CHAT mode!');
    console.error(`   QueryType: ${decision.queryType}`);
    throw new Error('GUARDRAIL: CHAT mode should never trigger retrieval');
  }
}

/**
 * Check if a QueryType should NEVER trigger retrieval
 */
export function shouldBlockRetrieval(queryType: QueryType): boolean {
  return CHAT_MODE_TYPES.includes(queryType);
}

// ═══════════════════════════════════════════════════════════════════════════
// ADVANCED ORCHESTRATION (för framtida användning)
// ═══════════════════════════════════════════════════════════════════════════

export interface OrchestrationContext {
  previousMode?: ResponseMode;
  conversationLength: number;
  userAskedForSources: boolean;
}

/**
 * Avancerad orkestrering med kontext
 */
export function orchestrateWithContext(
  query: string,
  context: OrchestrationContext
): OrchestrationDecision {
  const baseDecision = orchestrate(query);

  // Om användaren explicit ber om källor → EVIDENCE
  if (context.userAskedForSources && baseDecision.mode === 'ASSIST') {
    return {
      ...baseDecision,
      mode: 'EVIDENCE',
      showCitations: true,
      profile: ANSWER_PROFILE,
    };
  }

  // Om det är en uppföljningsfråga och vi var i EVIDENCE → behåll EVIDENCE
  if (context.previousMode === 'EVIDENCE' && isFollowupQuestion(query)) {
    return {
      ...baseDecision,
      mode: 'EVIDENCE',
      showCitations: true,
    };
  }

  return baseDecision;
}

/**
 * Enkel heuristik för att detektera uppföljningsfrågor
 */
function isFollowupQuestion(query: string): boolean {
  const followupIndicators = [
    /^(och|men|vad med|hur är det med)/i,
    /^(kan du förklara|berätta mer|varför)/i,
    /^(det|den|detta|dessa)/i,
  ];

  return followupIndicators.some(pattern => pattern.test(query.trim()));
}

// ═══════════════════════════════════════════════════════════════════════════
// RE-EXPORT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type { ResponseMode, QueryAnalysis, QueryType };
