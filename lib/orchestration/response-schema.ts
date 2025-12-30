/**
 * CanonicalResponse Schema - Strict JSON contract between backend and UI
 *
 * This is the single source of truth for all response structures.
 * UI renders `answer` as plain text. Citations are hidden behind toggle.
 *
 * MODELS:
 * - Gemma 3 12B: ASSIST/EVIDENCE (brain for facts)
 * - GPT-SW3 6.7B: CHAT and style pass (voice for natural Swedish)
 */

// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL RESPONSE SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

export type ResponseMode = 'CHAT' | 'ASSIST' | 'EVIDENCE';

/**
 * Citation - Reference to a source document
 */
export interface Citation {
  /** Unique identifier for the citation */
  id: string;
  /** Document title */
  title?: string;
  /** URL to source if available */
  url?: string;
  /** Relevant quote from the source */
  quote?: string;
  /** SFS number if applicable (e.g., "1974:152") */
  sfs?: string;
  /** Collection name in ChromaDB */
  collection?: string;
}

/**
 * Debug information - Only shown in development
 */
export interface DebugInfo {
  /** Number of documents retrieved */
  retrieved?: number;
  /** Number of documents after reranking */
  reranked?: number;
  /** Active filters applied */
  filters?: Record<string, any>;
  /** Processing time in ms */
  time_ms?: number;
  /** Jail Warden verification status */
  jail_warden?: 'VERIFIED' | 'REGENERATED' | 'ERROR' | 'SKIPPED';
  /** Model used for response */
  model?: string;
  /** Iterations in agent loop */
  iterations?: number;
}

/**
 * CanonicalResponse - The strict JSON contract
 *
 * UI Contract:
 * - `answer` is ALWAYS rendered as normal text in chat bubble
 * - `citations` are hidden behind "Visa källor" toggle (ASSIST mode)
 * - `citations` are always visible in EVIDENCE mode
 * - `followups` are shown as suggestion chips
 * - `debug` is only visible in dev mode
 */
export interface CanonicalResponse {
  /** The main answer text - always present, always rendered */
  answer: string;

  /** Follow-up question suggestions (0-3) */
  followups: string[];

  /** Response mode determining UI behavior */
  mode: ResponseMode;

  /** Source citations - hidden in CHAT, toggle in ASSIST, visible in EVIDENCE */
  citations?: Citation[];

  /** Confidence score (0.0-1.0) */
  confidence?: number;

  /** Debug information - only shown in development */
  debug?: DebugInfo;
}

// ═══════════════════════════════════════════════════════════════════════════
// JSON SCHEMA FOR OLLAMA STRUCTURED OUTPUTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * JSON Schema for Ollama's `format` parameter
 * Use this when calling /api/chat with structured output requirement
 */
export const CANONICAL_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  required: ['answer', 'followups', 'mode'],
  properties: {
    answer: {
      type: 'string',
      description: 'The main answer text in natural Swedish',
    },
    followups: {
      type: 'array',
      items: { type: 'string' },
      minItems: 0,
      maxItems: 3,
      description: 'Follow-up question suggestions',
    },
    mode: {
      type: 'string',
      enum: ['CHAT', 'ASSIST', 'EVIDENCE'],
      description: 'Response mode',
    },
    citations: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          url: { type: 'string' },
          quote: { type: 'string' },
          sfs: { type: 'string' },
          collection: { type: 'string' },
        },
      },
      description: 'Source citations',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Confidence score',
    },
  },
  additionalProperties: false,
} as const;

/**
 * Simplified schema for CHAT mode (no citations)
 */
export const CHAT_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  required: ['answer', 'followups'],
  properties: {
    answer: {
      type: 'string',
      description: 'The conversational answer',
    },
    followups: {
      type: 'array',
      items: { type: 'string' },
      minItems: 0,
      maxItems: 3,
      description: 'Follow-up suggestions',
    },
  },
  additionalProperties: false,
} as const;

/**
 * Schema for Gemma's draft answer (Pass A in two-pass)
 */
export const DRAFT_ANSWER_JSON_SCHEMA = {
  type: 'object',
  required: ['draft_answer', 'citations'],
  properties: {
    draft_answer: {
      type: 'string',
      description: 'Factual answer with source references',
    },
    citations: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'quote'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          quote: { type: 'string' },
          sfs: { type: 'string' },
        },
      },
      description: 'Citations used in the answer',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
    },
  },
  additionalProperties: false,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// TYPE GUARDS & VALIDATORS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate that a response conforms to CanonicalResponse
 */
export function isValidCanonicalResponse(obj: unknown): obj is CanonicalResponse {
  if (typeof obj !== 'object' || obj === null) return false;

  const response = obj as Record<string, unknown>;

  // Required fields
  if (typeof response.answer !== 'string') return false;
  if (!Array.isArray(response.followups)) return false;
  if (!['CHAT', 'ASSIST', 'EVIDENCE'].includes(response.mode as string)) return false;

  // Validate followups are strings
  if (!response.followups.every((f: unknown) => typeof f === 'string')) return false;

  // Optional citations validation
  if (response.citations !== undefined) {
    if (!Array.isArray(response.citations)) return false;
    for (const citation of response.citations) {
      if (typeof citation !== 'object' || citation === null) return false;
      if (typeof (citation as Record<string, unknown>).id !== 'string') return false;
    }
  }

  return true;
}

/**
 * Parse JSON response with fallback
 */
export function parseCanonicalResponse(
  jsonString: string,
  mode: ResponseMode
): CanonicalResponse {
  try {
    const parsed = JSON.parse(jsonString);

    if (isValidCanonicalResponse(parsed)) {
      return parsed;
    }

    // Partial match - extract what we can
    return {
      answer: parsed.answer || parsed.draft_answer || parsed.response || jsonString,
      followups: Array.isArray(parsed.followups) ? parsed.followups.slice(0, 3) : [],
      mode,
      citations: Array.isArray(parsed.citations) ? parsed.citations : undefined,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : undefined,
    };
  } catch {
    // JSON parse failed - treat entire string as answer
    return {
      answer: jsonString,
      followups: [],
      mode,
    };
  }
}

/**
 * Create a CanonicalResponse from raw data
 */
export function createCanonicalResponse(
  answer: string,
  mode: ResponseMode,
  options?: {
    followups?: string[];
    citations?: Citation[];
    confidence?: number;
    debug?: DebugInfo;
  }
): CanonicalResponse {
  return {
    answer,
    followups: options?.followups?.slice(0, 3) || [],
    mode,
    citations: options?.citations,
    confidence: options?.confidence,
    debug: options?.debug,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MODEL CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Model roles in Constitutional AI
 *
 * Gemma 3 12B: Brain for ASSIST/EVIDENCE (factual, analytical)
 * GPT-SW3 6.7B: Voice for CHAT and style pass (natural Swedish)
 */
export const MODEL_CONFIG = {
  /** Brain model - factual answers and analysis */
  BRAIN: 'gemma3:12b',

  /** Voice model - natural Swedish conversation */
  VOICE: 'fcole90/ai-sweden-gpt-sw3:6.7b',

  /** Embeddings model */
  EMBEDDINGS: 'nomic-embed-text',
} as const;

export type ModelRole = keyof typeof MODEL_CONFIG;

/**
 * Allowlist of models used by Constitutional-GPT
 * Use this to filter out irrelevant models in diagnostics/UI
 */
export const CONSTITUTIONAL_MODELS = [
  MODEL_CONFIG.BRAIN,
  MODEL_CONFIG.VOICE,
  MODEL_CONFIG.EMBEDDINGS,
] as const;

/**
 * Check if a model name is in the Constitutional allowlist
 */
export function isConstitutionalModel(modelName: string): boolean {
  return CONSTITUTIONAL_MODELS.some(
    m => modelName.toLowerCase().includes(m.toLowerCase().split(':')[0])
  );
}
