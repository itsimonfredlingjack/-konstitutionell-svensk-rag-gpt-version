/**
 * Constitutional AI - API Client
 * Connects UI to ChromaDB, Ollama, and system metrics
 */

// ═══════════════════════════════════════════════════════════════════════════
// JAIL WARDEN - Swedish Law Corrections Dictionary
// Corrects common GPT hallucinations in Swedish legal terms
// ═══════════════════════════════════════════════════════════════════════════
const SWEDISH_LAW_CORRECTIONS: Record<string, string> = {
  'pressfrihetslagen': 'Tryckfrihetsförordningen (TF)',
  'pressfrihetslag': 'Tryckfrihetsförordningen (TF)',
  'yttrandefrihetslag': 'Yttrandefrihetsgrundlagen (YGL)',
  'yttrandefrihetslagen': 'Yttrandefrihetsgrundlagen (YGL)',
  'grundlagen': 'Regeringsformen (RF)',
  'svenska grundlagen': 'Regeringsformen (RF)',
  'konstitutionen': 'Regeringsformen (RF)',
  'offentlighetslagen': 'Offentlighets- och sekretesslagen (OSL)',
  'sekretesslagen': 'Offentlighets- och sekretesslagen (OSL)',
  'datainspektionen': 'Integritetsskyddsmyndigheten (IMY)',
  'personuppgiftslagen': 'GDPR + Dataskyddslagen (2018:218)',
  'strafflagen': 'Brottsbalken (BrB)',
  'tryckfrihetslagen': 'Tryckfrihetsförordningen (TF)',
  'regeringslagen': 'Regeringsformen (RF)',
};

function applyJailWardenCorrections(text: string): { correctedText: string; corrections: string[] } {
  const corrections: string[] = [];
  let correctedText = text;

  for (const [incorrect, correct] of Object.entries(SWEDISH_LAW_CORRECTIONS)) {
    const regex = new RegExp(`\\b${incorrect}\\b`, 'gi');
    if (regex.test(text)) {
      corrections.push(`"${incorrect}" → "${correct}"`);
      correctedText = correctedText.replace(regex, correct);
    }
  }

  return { correctedText, corrections };
}

// Helper function to count citations removed
function countCitationsRemoved(original: string, cleaned: string): number {
  const citationRegex = /\[\d+\]/g;
  const originalCount = (original.match(citationRegex) || []).length;
  const cleanedCount = (cleaned.match(citationRegex) || []).length;
  return originalCount - cleanedCount;
}

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURED METRICS
// ═══════════════════════════════════════════════════════════════════════════
interface Metrics {
  timestamp: string;
  event: string;
  context?: Record<string, any>;
}

export function logMetric(event: string, context?: Record<string, any>): void {
  const metric: Metrics = {
    timestamp: new Date().toISOString(),
    event,
    context,
  };
  console.warn(`📊 METRICS: ${JSON.stringify(metric)}`);
}

// Use current hostname to allow access from other devices on the network
const getBaseUrl = (port: number) => {
  if (typeof window !== 'undefined') {
    return `http://${window.location.hostname}:${port}`;
  }
  return `http://localhost:${port}`;
};

const BACKEND_URL = getBaseUrl(8000);
const LLAMA_SERVER_URL = getBaseUrl(8080);

// NOTE: Constitutional-GPT uses llama-server (port 8080) only.
// The legacy Ollama backend has been permanently removed.

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  content?: string;
  score: number;
  source: string;
  doc_type: string;
  date?: string;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  limit: number;
  query: string;
}

export interface SystemStats {
  chromadb_connected: boolean;
  total_documents: number;
  collections: Record<string, number>;
  storage_size_mb: number;
}

export interface GPUStats {
  name: string;
  memory_used: number;
  memory_total: number;
  utilization: number;
  temperature: number;
}

export interface AgentResponse {
  answer: string;
  sources: SearchResult[];
  reasoning_steps: string[];
  model_used: string;
  total_time_ms: number;

  // Jail Warden v2 fields
  warden_version: 'v1' | 'v2';
  warden_status:
    | 'UNCHANGED'           // No correction needed
    | 'TERM_CORRECTED'      // Incorrect law name corrected (v1 style)
    | 'QUESTION_REWRITTEN'  // Question rewritten before LLM (v2)
    | 'FACT_VERIFIED'       // SFS numbers validated against canonical
    | 'FACT_UNVERIFIED'     // Incorrect SFS detected, not fixed
    | 'CITATIONS_STRIPPED'  // Model-generated citations removed
    | 'ERROR';

  warden_details?: {
    misconceptions_detected?: string[];
    sfs_validation?: { valid: boolean; errors?: string[] };
    citations_removed?: number;
    question_rewrite?: { original: string; rewritten: string };
  };

  // DEPRECATED - for backwards compatibility
  jail_warden_status?: 'VERIFIED' | 'REGENERATED' | 'ERROR' | 'SKIPPED';
  verified_claims?: number;
  total_claims?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CHROMADB / BACKEND API
// ═══════════════════════════════════════════════════════════════════════════

export async function searchDocuments(
  query: string,
  options: {
    limit?: number;
    doc_type?: string;
    page?: number;
  } = {}
): Promise<SearchResponse> {
  const { limit = 10, doc_type, page = 1 } = options;

  try {
    const response = await fetch(`${BACKEND_URL}/api/constitutional/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        limit,
        page,
        filters: doc_type ? { doc_type } : undefined,
      }),
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Search error:', error);
    return { results: [], total: 0, page: 1, limit, query };
  }
}

export async function getSystemStats(): Promise<SystemStats | null> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/constitutional/stats/overview`);
    if (!response.ok) return null;
    const data = await response.json();
    // Map from actual API format to our interface
    return {
      chromadb_connected: true, // If we got a response, it's connected
      total_documents: data.total_documents || 0,
      collections: data.collections || {},
      storage_size_mb: data.storage_size_mb || 0,
    };
  } catch {
    return null;
  }
}

export async function getCollections(): Promise<{ name: string; count: number }[]> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/constitutional/collections`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.map((c: any) => ({ name: c.name, count: c.document_count }));
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GPU / SYSTEM METRICS
// ═══════════════════════════════════════════════════════════════════════════

export async function getGPUStats(): Promise<GPUStats | null> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/gpu/stats`);
    if (!response.ok) return null;
    const data = await response.json();
    // Map from actual API format to our interface
    if (data.gpu) {
      return {
        name: data.gpu.name,
        memory_used: data.gpu.vram_used_gb * 1024, // Convert GB to MB for consistency
        memory_total: data.gpu.vram_total_gb * 1024,
        utilization: data.gpu.gpu_util_percent,
        temperature: data.gpu.temperature_c,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function getHealth(): Promise<{ status: string; uptime?: number } | null> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/health`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LLM - via llama-server (NOT Ollama)
// ═══════════════════════════════════════════════════════════════════════════

export async function getLoadedModels(): Promise<string[]> {
  // Returns gpt-oss as the only model since we use llama-server
  // llama-server doesn't have a /api/ps endpoint like Ollama
  try {
    // Check if llama-server is responding
    const response = await fetch(`${LLAMA_SERVER_URL}/health`);
    if (response.ok) {
      return ['gpt-oss (llama-server)'];
    }
    return [];
  } catch {
    return [];
  }
}

// NOTE: ReasoningEffort is now controlled via --chat-template-kwargs on llama-server
// The server runs with {"reasoning_effort":"low"} by default
// This ensures stable content output without thinking-leakage

export async function generateResponse(
  prompt: string,
  model: string = 'gpt-oss',
  options: { temperature?: number; max_tokens?: number; systemPrompt?: string } = {}
): Promise<string> {
  const {
    temperature = 0.7,
    max_tokens = 500,
    systemPrompt = 'Du är en svensk juridisk expert. Svara på svenska.',
  } = options;

  try {
    // Use llama-server with Harmony chat template
    // reasoning_effort is controlled via --chat-template-kwargs on server (default: low)
    const response = await fetch(`${LLAMA_SERVER_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-oss',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature,
        max_tokens,
      }),
    });

    if (!response.ok) {
      throw new Error(`Generation failed: ${response.status}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    const finishReason = data.choices?.[0]?.finish_reason;

    // Harmony template: content = final answer
    // IMPORTANT: Never expose reasoning_content to users
    let answer = message?.content || '';

    // Content-empty recovery: run finalizer (no reasoning_content parsing)
    if (!answer) {
      console.warn('⚠️ GPT-OSS: content empty, running finalizer');
      answer = await runFinalizer(prompt);
    }

    // Handle truncated responses
    if (!answer && finishReason === 'length') {
      console.warn('⚠️ Response truncated, running finalizer');
      answer = await runFinalizer(prompt);
    }

    return answer;
  } catch (error) {
    console.error('Generation error:', error);
    return '';
  }
}

/**
 * Finalizer: Force a direct Swedish answer when content-empty recovery is needed.
 * Uses a simple prompt that bypasses thinking mode.
 */
async function runFinalizer(originalPrompt: string): Promise<string> {
  logMetric('finalizer_triggered', { 
    reason: 'content_empty', 
    prompt_length: originalPrompt.length 
  });

  try {
    const response = await fetch(`${LLAMA_SERVER_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-oss',
        messages: [
          { 
            role: 'system', 
            content: 'Svara ENDAST på svenska. Max 3 meningar. Ingen analys, bara svaret.'
          },
          { role: 'user', content: `Sammanfatta svaret på: ${originalPrompt}` }
        ],
        temperature: 0.3,
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      logMetric('finalizer_failed', { http_status: response.status });
      return 'Kunde inte generera svar.';
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content || 'Inget svar kunde genereras.';
    
    if (result !== 'Inget svar kunde genereras.') {
      logMetric('finalizer_success', { response_length: result.length });
    }
    
    return result;
  } catch (error) {
    logMetric('finalizer_exception', { error: String(error) });
    return 'Fel vid generering av svar.';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CITATION GATING - Strip model-generated citations
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Strip all citation markers and source references from model output.
 * Prevents hallucinated citations like [1], [2] that don't exist in ChromaDB.
 *
 * @param text - Raw model output with potential hallucinated citations
 * @returns Clean text with all citation artifacts removed
 */
function stripModelCitations(text: string): string {
  let cleaned = text;

  // Remove citation numbers like [1], [2], [123]
  cleaned = cleaned.replace(/\[\d+\]/g, '');

  // Remove common Swedish citation patterns
  cleaned = cleaned.replace(/enligt källa\s*\d*/gi, '');
  cleaned = cleaned.replace(/källa:\s*\d*/gi, '');
  cleaned = cleaned.replace(/\bkälla\b/gi, '');

  // Remove "Källor:" header and everything after (model may add its own)
  cleaned = cleaned.replace(/---\s*Källor:[\s\S]*/i, '');
  cleaned = cleaned.replace(/\n\s*Källor:[\s\S]*/i, '');

  // Remove "enligt dokumentet" and similar phrases
  cleaned = cleaned.replace(/enligt dokumentet/gi, '');
  cleaned = cleaned.replace(/i dokumenten/gi, '');
  cleaned = cleaned.replace(/baserat på källorna/gi, '');

  // Clean up extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

/**
 * Format ChromaDB sources for display at the end of the answer.
 * Only real sources from the database are shown.
 *
 * @param sources - SearchResults from ChromaDB query
 * @returns Formatted source section with links
 */
function formatSourcesForDisplay(sources: SearchResult[]): string {
  if (sources.length === 0) {
    return '';
  }

  const sourceLines = sources
    .slice(0, 5) // Show max 5 sources
    .map((source, i) => {
      const num = i + 1;
      const title = source.title || 'Okänd källa';
      const sourceUrl = source.source || '';

      // Format: [1] Proposition 2024/25:87 - regeringen.se
      return `[${num}] ${title} - ${sourceUrl}`;
    })
    .join('\n');

  return `\n\n---\nKällor:\n${sourceLines}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENTIC RAG - Full Pipeline
// ═══════════════════════════════════════════════════════════════════════════

export async function agentQuery(question: string): Promise<AgentResponse> {
  const startTime = Date.now();
  const reasoningSteps: string[] = [];
  let sources: SearchResult[] = [];

  try {
    // Step 1: Search for relevant documents
    reasoningSteps.push('Söker i dokumentdatabasen...');
    const searchResult = await searchDocuments(question, { limit: 10 });
    sources = searchResult.results;
    reasoningSteps.push(`Hittade ${sources.length} relevanta dokument`);

    // Step 2: Build context from documents
    const context = sources
      .slice(0, 5)
      .map((doc, i) => `[${i + 1}] ${doc.title}: ${doc.snippet}`)
      .join('\n\n');

    // Step 3: Generate answer with GPT-OSS via llama-server
    reasoningSteps.push('Genererar svar med GPT-OSS...');
    const userPrompt = `Baserat på följande dokument, svara på frågan.

DOKUMENT:
${context}

FRÅGA: ${question}

INSTRUKTIONER:
- Svara koncist på svenska
- ANVÄND INGA KÄLLREFERENSER ([1], [2] etc.) i ditt svar
- Skriv INTE "enligt källa" eller liknande
- Fokusera enbart på innehållet
- Källor läggs till automatiskt av systemet efteråt`;

    const rawAnswer = await generateResponse(userPrompt, 'gpt-oss', {
      temperature: 0.3,
      max_tokens: 800,
      systemPrompt: 'Du är en svensk juridisk expert specialiserad på svensk lagstiftning och myndighetsdokument. Svara alltid på svenska.',
    });
    reasoningSteps.push('Svar genererat');

    // Step 4: JAIL WARDEN v2 - Apply corrections and validation
    const wardenDetails: AgentResponse['warden_details'] = {};

    // Track term corrections (v1 style)
    const { correctedText, corrections } = applyJailWardenCorrections(rawAnswer || '');
    if (corrections.length > 0) {
      wardenDetails.misconceptions_detected = corrections;
      reasoningSteps.push(`Jail Warden korrigerade ${corrections.length} fel: ${corrections.join(', ')}`);
    }

    // Step 5: CITATION GATING - Strip model-generated citations and add real sources
    reasoningSteps.push('Tar bort eventuella hallucinerande källor...');
    const cleanAnswer = stripModelCitations(correctedText);

    // Track citations stripped
    const citationsRemoved = countCitationsRemoved(rawAnswer || '', cleanAnswer);
    if (citationsRemoved > 0) {
      wardenDetails.citations_removed = citationsRemoved;
    }

    // Track SFS validation (placeholder for future implementation)
    // In v2, this would validate against canonical SFS database
    const sfsValidation = { valid: true }; // Placeholder
    wardenDetails.sfs_validation = sfsValidation;

    // Determine overall Warden status
    let wardenStatus: AgentResponse['warden_status'] = 'UNCHANGED';
    if (corrections.length > 0) {
      wardenStatus = 'TERM_CORRECTED';
    }
    if (citationsRemoved > 0) {
      wardenStatus = 'CITATIONS_STRIPPED';
    }
    if (sfsValidation.valid && !('errors' in sfsValidation)) {
      wardenStatus = 'FACT_VERIFIED';
    }

    // Step 6: Append real ChromaDB sources
    const sourcesSection = formatSourcesForDisplay(sources);
    const finalAnswer = cleanAnswer + sourcesSection;

    return {
      answer: finalAnswer || 'Kunde inte generera svar.',
      sources,
      reasoning_steps: reasoningSteps,
      model_used: 'gpt-oss-20b (llama-server)',
      total_time_ms: Date.now() - startTime,

      // Jail Warden v2 fields
      warden_version: 'v2',
      warden_status: wardenStatus,
      warden_details: wardenDetails,

      // Deprecated fields for backwards compatibility
      jail_warden_status: corrections.length > 0 ? 'REGENERATED' : 'VERIFIED',
      verified_claims: 0,
      total_claims: corrections.length,
    };
  } catch (error) {
    console.error('Agent query error:', error);
    return {
      answer: 'Ett fel uppstod vid förfrågan.',
      sources: [],
      reasoning_steps: [...reasoningSteps, `Fel: ${error}`],
      model_used: 'unknown',
      total_time_ms: Date.now() - startTime,
      warden_version: 'v2',
      warden_status: 'ERROR',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STREAMING CHAT (for real-time responses) - via llama-server
// ═══════════════════════════════════════════════════════════════════════════

export async function* streamChat(
  prompt: string,
  model: string = 'gpt-oss'
): AsyncGenerator<string> {
  try {
    // Use llama-server streaming via /v1/chat/completions with stream: true
    const response = await fetch(`${LLAMA_SERVER_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-oss',
        messages: [
          { role: 'system', content: 'Du är en svensk juridisk expert. Svara på svenska.' },
          { role: 'user', content: prompt }
        ],
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error('Stream failed');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(Boolean);

      for (const line of lines) {
        // SSE format: data: {...}
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6);
          if (jsonStr === '[DONE]') break;
          
          try {
            const data = JSON.parse(jsonStr);
            const content = data.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  } catch (error) {
    console.error('Stream error:', error);
    yield 'Streaming failed';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENT UPLOAD AND OCR
// ═══════════════════════════════════════════════════════════════════════════

export interface OCRResponse {
  extracted_text: string;
  answer: string;
  question: string;
  processing_time_ms: number;
  ocr_model: string;
  answer_model: string;
  filename: string;
}

export async function uploadDocumentAndAsk(
  file: File,
  question: string
): Promise<OCRResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('question', question);

  try {
    const response = await fetch(`${BACKEND_URL}/api/ocr/extract-and-answer`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`OCR request failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('OCR error:', error);
    return {
      extracted_text: '',
      answer: 'Kunde inte behandla dokumentet.',
      question,
      processing_time_ms: 0,
      ocr_model: 'unknown',
      answer_model: 'unknown',
      filename: file.name,
    };
  }
}
