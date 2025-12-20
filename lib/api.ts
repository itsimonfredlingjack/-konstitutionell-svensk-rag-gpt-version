/**
 * Constitutional AI - API Client
 * Connects UI to ChromaDB, Ollama, and system metrics
 */

// Use current hostname to allow access from other devices on the network
const getBaseUrl = (port: number) => {
  if (typeof window !== 'undefined') {
    return `http://${window.location.hostname}:${port}`;
  }
  return `http://localhost:${port}`;
};

const BACKEND_URL = getBaseUrl(8000);
const OLLAMA_URL = getBaseUrl(11434);

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
// OLLAMA / LLM
// ═══════════════════════════════════════════════════════════════════════════

export async function getLoadedModels(): Promise<string[]> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/ps`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.models?.map((m: any) => m.name) || [];
  } catch {
    return [];
  }
}

export async function generateResponse(
  prompt: string,
  model: string = 'gpt-oss:20b',
  options: { temperature?: number; max_tokens?: number } = {}
): Promise<string> {
  const { temperature = 0.7, max_tokens = 300 } = options;

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature,
          num_predict: max_tokens,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Generation failed: ${response.status}`);
    }

    const data = await response.json();
    // GPT-OSS uses 'thinking' field, others use 'response'
    return data.thinking || data.response || '';
  } catch (error) {
    console.error('Generation error:', error);
    return '';
  }
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

    // Step 3: Generate answer with GPT-OSS
    reasoningSteps.push('Genererar svar med GPT-OSS...');
    const prompt = `Baserat på följande dokument, svara på frågan.

DOKUMENT:
${context}

FRÅGA: ${question}

Svara koncist på svenska. Referera till källorna med [1], [2] etc.`;

    const answer = await generateResponse(prompt, 'gpt-oss:20b');
    reasoningSteps.push('Svar genererat');

    return {
      answer: answer || 'Kunde inte generera svar.',
      sources,
      reasoning_steps: reasoningSteps,
      model_used: 'gpt-oss:20b',
      total_time_ms: Date.now() - startTime,
    };
  } catch (error) {
    console.error('Agent query error:', error);
    return {
      answer: 'Ett fel uppstod vid förfrågan.',
      sources: [],
      reasoning_steps: [...reasoningSteps, `Fel: ${error}`],
      model_used: 'unknown',
      total_time_ms: Date.now() - startTime,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STREAMING CHAT (for real-time responses)
// ═══════════════════════════════════════════════════════════════════════════

export async function* streamChat(
  prompt: string,
  model: string = 'gpt-oss:20b'
): AsyncGenerator<string> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
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
        try {
          const data = JSON.parse(line);
          if (data.response) {
            yield data.response;
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  } catch (error) {
    console.error('Stream error:', error);
    yield 'Streaming failed';
  }
}
