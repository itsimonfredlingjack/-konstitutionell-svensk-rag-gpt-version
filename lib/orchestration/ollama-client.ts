/**
 * Ollama Client - Structured Outputs via format parameter
 *
 * Uses Ollama's documented `format` parameter for schema-bound JSON.
 * NO string parsing - schema is the source of truth.
 *
 * MODELS:
 * - gemma3:12b (BRAIN): Factual answers, analysis, RAG
 * - fcole90/ai-sweden-gpt-sw3:6.7b (VOICE): Natural Swedish, chat, style pass
 */

import {
  MODEL_CONFIG,
  type CanonicalResponse,
  type Citation,
  CANONICAL_RESPONSE_JSON_SCHEMA,
  CHAT_RESPONSE_JSON_SCHEMA,
  DRAFT_ANSWER_JSON_SCHEMA,
  parseCanonicalResponse,
  createCanonicalResponse,
  type ResponseMode,
} from './response-schema';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaRequestOptions {
  model: string;
  messages: OllamaMessage[];
  temperature?: number;
  max_tokens?: number;
  format?: object;  // JSON Schema for structured output
  tools?: object[];
  keep_alive?: string;  // e.g. "10m", "0" to unload immediately
  // Production options
  top_p?: number;
  top_k?: number;
  repeat_penalty?: number;
  num_ctx?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// KEEP_ALIVE STRATEGY
// RTX 4070 12GB can't hold both Gemma (~8.1GB) and GPT-SW3 (~5.2GB) in VRAM
// Mode-based keep_alive prevents random latency spikes
// ═══════════════════════════════════════════════════════════════════════════
const KEEP_ALIVE = {
  VOICE_ACTIVE: '10m',    // Keep VOICE warm during chat sessions
  BRAIN_ACTIVE: '10m',    // Keep BRAIN warm during assist/evidence
  INACTIVE: '0',          // Unload when switching modes (VRAM pressure)
} as const;

// Track current mode for adaptive unloading
let currentActiveModel: 'VOICE' | 'BRAIN' | null = null;

/**
 * Unload the other model when switching modes to prevent VRAM pressure
 * RTX 4070 12GB can't comfortably hold both models simultaneously
 */
async function adaptiveUnload(newModel: 'VOICE' | 'BRAIN'): Promise<void> {
  if (currentActiveModel && currentActiveModel !== newModel) {
    const modelToUnload = currentActiveModel === 'VOICE'
      ? MODEL_CONFIG.VOICE
      : MODEL_CONFIG.BRAIN;

    console.log(`🔄 Mode switch: unloading ${currentActiveModel} to make room for ${newModel}`);

    try {
      // Send empty request with keep_alive: 0 to unload
      await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelToUnload,
          messages: [],
          keep_alive: KEEP_ALIVE.INACTIVE,
        }),
      });
    } catch {
      // Silent fail - unloading is optimization, not critical
    }
  }
  currentActiveModel = newModel;
}

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTION-GRADE OPTIONS PER MODE
// Tuned for RTX 4070 12GB with native /api/chat
// ═══════════════════════════════════════════════════════════════════════════

const PROD_OPTIONS = {
  /** CHAT mode: natural conversation, short responses */
  CHAT: {
    temperature: 0.8,
    top_p: 0.9,
    top_k: 40,
    repeat_penalty: 1.1,
    num_ctx: 2048,      // CHAT rarely needs more
    num_predict: 180,   // 2-6 sentences + suggestions
  },

  /** ASSIST draft (BRAIN): factual, stable */
  ASSIST_DRAFT: {
    temperature: 0.1,
    top_p: 0.85,
    top_k: 40,
    repeat_penalty: 1.12,
    num_ctx: 8192,      // RAG context needs room
    num_predict: 650,   // Good answer + structure
  },

  /** ASSIST style pass (VOICE): slight creativity, no drift */
  ASSIST_STYLE: {
    temperature: 0.65,
    top_p: 0.9,
    top_k: 40,
    repeat_penalty: 1.08,
    num_ctx: 2048,      // Style pass needs little
    num_predict: 260,   // Short and clean
  },

  /** EVIDENCE (BRAIN): maximum fidelity */
  EVIDENCE: {
    temperature: 0.05,
    top_p: 0.8,
    top_k: 40,
    repeat_penalty: 1.15,
    num_ctx: 8192,
    num_predict: 900,   // Evidence can be detailed
  },

  /** FOLLOWUPS (VOICE): creative but focused suggestions */
  FOLLOWUPS: {
    temperature: 0.75,
    top_p: 0.9,
    top_k: 40,
    repeat_penalty: 1.05,
    num_ctx: 2048,
    num_predict: 100,   // Just a few short suggestions
  },
} as const;

interface OllamaResponse {
  choices: Array<{
    message: {
      content: string;
      tool_calls?: Array<{
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
  }>;
}

interface DraftAnswer {
  draft_answer: string;
  citations: Citation[];
  confidence?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// LOW-LEVEL OLLAMA API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Call Ollama /api/chat with structured output format and production options
 */
async function callOllama(options: OllamaRequestOptions): Promise<string> {
  const body: Record<string, unknown> = {
    model: options.model,
    messages: options.messages,
    stream: false,
  };

  // Build options object with all production parameters
  const ollamaOptions: Record<string, unknown> = {};

  if (options.temperature !== undefined) ollamaOptions.temperature = options.temperature;
  if (options.max_tokens !== undefined) ollamaOptions.num_predict = options.max_tokens;
  if (options.top_p !== undefined) ollamaOptions.top_p = options.top_p;
  if (options.top_k !== undefined) ollamaOptions.top_k = options.top_k;
  if (options.repeat_penalty !== undefined) ollamaOptions.repeat_penalty = options.repeat_penalty;
  if (options.num_ctx !== undefined) ollamaOptions.num_ctx = options.num_ctx;

  if (Object.keys(ollamaOptions).length > 0) {
    body.options = ollamaOptions;
  }

  if (options.format) {
    body.format = options.format;
  }
  if (options.tools) {
    body.tools = options.tools;
  }
  // keep_alive for VRAM management
  if (options.keep_alive !== undefined) {
    body.keep_alive = options.keep_alive;
  }

  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama error ${response.status}: ${error}`);
  }

  const data = await response.json();
  return data.message?.content || '';
}

/**
 * Call Ollama OpenAI-compatible endpoint (for tool-calling)
 */
async function callOllamaOpenAI(options: OllamaRequestOptions): Promise<OllamaResponse> {
  const body: Record<string, unknown> = {
    model: options.model,
    messages: options.messages,
  };

  if (options.temperature !== undefined) {
    body.temperature = options.temperature;
  }
  if (options.max_tokens !== undefined) {
    body.max_tokens = options.max_tokens;
  }
  if (options.tools) {
    body.tools = options.tools;
  }

  const response = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama error ${response.status}: ${error}`);
  }

  return response.json();
}

// ═══════════════════════════════════════════════════════════════════════════
// HIGH-LEVEL API - CHAT MODE (GPT-SW3)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate CHAT response using GPT-SW3 (Voice model)
 * No retrieval, natural Swedish conversation
 *
 * FALLBACK CHAIN:
 * 1. GPT-SW3 with structured output
 * 2. GPT-SW3 without structured output
 * 3. BRAIN (Gemma) with chat-friendly prompt (emergency fallback)
 */
export async function generateChatResponse(
  question: string,
  systemPrompt: string,
  options?: {
    temperature?: number;
    max_tokens?: number;
  }
): Promise<CanonicalResponse> {
  const startTime = Date.now();
  console.log(`💬 CHAT: GPT-SW3 generating response...`);

  // Adaptive unload: switch to VOICE mode
  await adaptiveUnload('VOICE');

  // ─────────────────────────────────────────────────────────────────────────
  // ATTEMPT 1: GPT-SW3 with structured output + production options
  // ─────────────────────────────────────────────────────────────────────────
  try {
    const content = await callOllama({
      model: MODEL_CONFIG.VOICE,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question },
      ],
      ...PROD_OPTIONS.CHAT,
      format: CHAT_RESPONSE_JSON_SCHEMA,
      keep_alive: KEEP_ALIVE.VOICE_ACTIVE,
    });

    // Parse structured response
    const parsed = parseCanonicalResponse(content, 'CHAT');

    // Production logging
    const latency = Date.now() - startTime;
    console.log(`📊 CHAT completed: mode=CHAT, retrieval=false, latency=${latency}ms`);

    return {
      ...parsed,
      mode: 'CHAT',
      citations: undefined,  // Never in CHAT
      debug: {
        time_ms: latency,
        model: MODEL_CONFIG.VOICE,
      },
    };
  } catch (error) {
    console.warn('⚠️ CHAT (VOICE structured) failed:', error);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ATTEMPT 2: GPT-SW3 without structured output
  // ─────────────────────────────────────────────────────────────────────────
  try {
    console.log(`💬 CHAT fallback: GPT-SW3 without structured output...`);
    const fallbackContent = await callOllama({
      model: MODEL_CONFIG.VOICE,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question },
      ],
      ...PROD_OPTIONS.CHAT,
      keep_alive: KEEP_ALIVE.VOICE_ACTIVE,
    });

    const latency = Date.now() - startTime;
    console.log(`📊 CHAT completed (fallback): mode=CHAT, retrieval=false, latency=${latency}ms`);

    return createCanonicalResponse(
      fallbackContent || 'Hej! Vad kan jag hjälpa dig med?',
      'CHAT',
      {
        followups: [],
        debug: { time_ms: latency, model: MODEL_CONFIG.VOICE },
      }
    );
  } catch (voiceError) {
    console.warn('⚠️ CHAT (VOICE unstructured) failed:', voiceError);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ATTEMPT 3: BRAIN (Gemma) with chat-friendly prompt
  // Emergency fallback if GPT-SW3 is completely unavailable
  // NOTE: Question is ONLY in user message - never duplicate in system prompt
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`🧠 CHAT emergency fallback: Using BRAIN with chat prompt...`);

  const chatFriendlySystemPrompt = `Du är en vänlig svensk assistent.
Svara kort och naturligt på svenska.

REGLER:
• Max 3 meningar
• Var hjälpsam och trevlig
• Om frågan är oklar, fråga vad de menar`;

  try {
    const brainContent = await callOllama({
      model: MODEL_CONFIG.BRAIN,
      messages: [
        { role: 'system', content: chatFriendlySystemPrompt },
        { role: 'user', content: question },  // Question ONLY here
      ],
      ...PROD_OPTIONS.CHAT,  // Use CHAT options even for BRAIN fallback
      format: CHAT_RESPONSE_JSON_SCHEMA,
      keep_alive: KEEP_ALIVE.BRAIN_ACTIVE,
    });

    const parsed = parseCanonicalResponse(brainContent, 'CHAT');
    const latency = Date.now() - startTime;
    console.log(`📊 CHAT completed (BRAIN fallback): mode=CHAT, retrieval=false, latency=${latency}ms`);

    return {
      ...parsed,
      mode: 'CHAT',
      citations: undefined,
      debug: {
        time_ms: latency,
        model: `${MODEL_CONFIG.BRAIN} (VOICE fallback)`,
      },
    };
  } catch (brainError) {
    console.error('❌ All CHAT fallbacks failed:', brainError);

    // Last resort: hardcoded response
    return createCanonicalResponse(
      'Ursäkta, något gick fel. Kan du prova igen?',
      'CHAT',
      { followups: ['Vad kan du hjälpa mig med?', 'Hur funkar du?'] }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HIGH-LEVEL API - TWO-PASS ASSIST (Gemma → GPT-SW3)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * PASS A: Generate factual draft answer with Gemma (Brain model)
 * Low temperature, structured citations
 */
export async function generateDraftAnswer(
  question: string,
  sources: Array<{ id: string; title: string; content: string; sfs?: string }>,
  systemPrompt: string
): Promise<DraftAnswer> {
  console.log(`🧠 PASS A: Gemma generating draft answer with ${sources.length} sources...`);

  // Adaptive unload: switch to BRAIN mode
  await adaptiveUnload('BRAIN');

  // Build source context
  const sourceContext = sources
    .map((s, i) => `[${i + 1}] ${s.title}${s.sfs ? ` (${s.sfs})` : ''}\n${s.content.substring(0, 300)}...`)
    .join('\n\n');

  const userPrompt = `KÄLLOR:
${sourceContext}

FRÅGA: ${question}

Svara sakligt baserat på källorna. Använd [1], [2] etc för citat.`;

  try {
    const content = await callOllama({
      model: MODEL_CONFIG.BRAIN,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      ...PROD_OPTIONS.ASSIST_DRAFT,
      format: DRAFT_ANSWER_JSON_SCHEMA,
      keep_alive: KEEP_ALIVE.BRAIN_ACTIVE,
    });

    const parsed = JSON.parse(content);

    return {
      draft_answer: parsed.draft_answer || content,
      citations: parsed.citations || [],
      confidence: parsed.confidence,
    };
  } catch (error) {
    console.error('Draft answer error:', error);

    // Fallback without structured output
    const fallbackContent = await callOllama({
      model: MODEL_CONFIG.BRAIN,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      ...PROD_OPTIONS.ASSIST_DRAFT,
      keep_alive: KEEP_ALIVE.BRAIN_ACTIVE,
    });

    // Extract citations from text (fallback parsing)
    const citations: Citation[] = sources.slice(0, 3).map((s, i) => ({
      id: s.id,
      title: s.title,
      sfs: s.sfs,
    }));

    return {
      draft_answer: fallbackContent,
      citations,
      confidence: 0.6,
    };
  }
}

/**
 * PASS B: Style pass with GPT-SW3 (Voice model)
 * Rewrite draft to natural Swedish without changing meaning
 */
export async function applyStylePass(
  draftAnswer: string,
  mode: ResponseMode
): Promise<string> {
  // Skip style pass for EVIDENCE mode (keep technical tone)
  if (mode === 'EVIDENCE') {
    console.log(`📝 EVIDENCE mode: Skipping style pass`);
    return draftAnswer;
  }

  console.log(`✨ PASS B: GPT-SW3 applying style pass...`);

  const stylePrompt = `Du ska skriva om ett svar så det blir mer naturligt och vänligt på svenska.

REGLER:
• Ändra INTE sakinnebörden
• Lägg INTE till fakta
• Gör texten kortare om möjligt
• Ta bort stela formuleringar
• Behåll alla [1], [2] etc citat-markeringar

URSPRUNGLIGT SVAR:
${draftAnswer}

Skriv om svaret:`;

  try {
    const styledAnswer = await callOllama({
      model: MODEL_CONFIG.VOICE,
      messages: [
        {
          role: 'system',
          content: 'Du skriver om texter till naturlig svenska. Kort och vänligt.',
        },
        { role: 'user', content: stylePrompt },
      ],
      ...PROD_OPTIONS.ASSIST_STYLE,
      keep_alive: KEEP_ALIVE.VOICE_ACTIVE,
    });

    // Sanity check: don't use if significantly longer or lost citations
    const originalCitations = (draftAnswer.match(/\[\d+\]/g) || []).length;
    const styledCitations = (styledAnswer.match(/\[\d+\]/g) || []).length;

    if (styledAnswer.length > draftAnswer.length * 1.5 || styledCitations < originalCitations) {
      console.warn('⚠️ Style pass rejected: output too long or lost citations');
      return draftAnswer;
    }

    return styledAnswer;
  } catch (error) {
    console.error('Style pass error:', error);
    return draftAnswer;  // Return original on error
  }
}

/**
 * Complete two-pass ASSIST flow
 * Pass A: Gemma generates factual draft
 * Pass B: GPT-SW3 applies natural Swedish style
 */
export async function generateAssistResponse(
  question: string,
  sources: Array<{ id: string; title: string; content: string; sfs?: string }>,
  systemPrompt: string,
  mode: ResponseMode
): Promise<CanonicalResponse> {
  const startTime = Date.now();
  console.log(`🤖 ASSIST: Two-pass response with ${sources.length} sources...`);

  // PASS A: Gemma generates draft
  const draftStart = Date.now();
  const draft = await generateDraftAnswer(question, sources, systemPrompt);
  const draftLatency = Date.now() - draftStart;
  console.log(`   └─ PASS A (draft): ${draftLatency}ms`);

  // PASS B: GPT-SW3 applies style (only for ASSIST, not EVIDENCE)
  const styleStart = Date.now();
  const finalAnswer = await applyStylePass(draft.draft_answer, mode);
  const styleLatency = Date.now() - styleStart;
  console.log(`   └─ PASS B (style): ${styleLatency}ms`);

  // Generate follow-ups (GPT-SW3)
  const followups = await generateFollowups(question, finalAnswer);

  // Production logging
  const totalLatency = Date.now() - startTime;
  console.log(`📊 ASSIST completed: mode=${mode}, retrieval=true, sources=${sources.length}, latency=${totalLatency}ms`);

  return {
    answer: finalAnswer,
    followups,
    mode,
    citations: draft.citations.length > 0 ? draft.citations : undefined,
    confidence: draft.confidence,
    debug: {
      retrieved: sources.length,
      time_ms: totalLatency,
      model: `${MODEL_CONFIG.BRAIN} → ${MODEL_CONFIG.VOICE}`,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HIGH-LEVEL API - EVIDENCE MODE (Gemma only, no style pass)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate EVIDENCE response - Gemma only, technical tone, always show citations
 */
export async function generateEvidenceResponse(
  question: string,
  sources: Array<{ id: string; title: string; content: string; sfs?: string }>,
  systemPrompt: string
): Promise<CanonicalResponse> {
  const startTime = Date.now();
  console.log(`📖 EVIDENCE: Single-pass response with ${sources.length} sources...`);

  // Gemma only - no style pass for EVIDENCE mode
  const draft = await generateDraftAnswer(question, sources, systemPrompt);

  // Production logging
  const latency = Date.now() - startTime;
  console.log(`📊 EVIDENCE completed: mode=EVIDENCE, retrieval=true, sources=${sources.length}, citations=${draft.citations.length}, latency=${latency}ms`);

  return {
    answer: draft.draft_answer,
    followups: [],  // No follow-ups for EVIDENCE
    mode: 'EVIDENCE',
    citations: draft.citations,
    confidence: draft.confidence,
    debug: {
      retrieved: sources.length,
      time_ms: latency,
      model: MODEL_CONFIG.BRAIN,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate follow-up suggestions (GPT-SW3)
 */
async function generateFollowups(question: string, answer: string): Promise<string[]> {
  try {
    const content = await callOllama({
      model: MODEL_CONFIG.VOICE,
      messages: [
        {
          role: 'system',
          content: `Ge 2-3 relevanta följdfrågor baserat på frågan och svaret.
Returnera JSON: { "followups": ["fråga 1", "fråga 2"] }
Max 2-3 frågor, korta och konkreta.`,
        },
        {
          role: 'user',
          content: `Fråga: ${question}\n\nSvar: ${answer.substring(0, 200)}`,
        },
      ],
      ...PROD_OPTIONS.FOLLOWUPS,
      format: {
        type: 'object',
        properties: {
          followups: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 3,
          },
        },
        required: ['followups'],
      },
      keep_alive: KEEP_ALIVE.VOICE_ACTIVE,
    });

    const parsed = JSON.parse(content);
    return (parsed.followups || []).slice(0, 3);
  } catch {
    return [];  // Silent fail for follow-ups
  }
}

/**
 * Tool-calling for agent loop (uses OpenAI-compatible endpoint)
 */
export async function callWithTools(
  messages: OllamaMessage[],
  tools: object[],
  options?: { temperature?: number; max_tokens?: number }
): Promise<OllamaResponse> {
  return callOllamaOpenAI({
    model: MODEL_CONFIG.BRAIN,
    messages,
    tools,
    temperature: options?.temperature ?? 0.1,
    max_tokens: options?.max_tokens ?? 50,
  });
}
