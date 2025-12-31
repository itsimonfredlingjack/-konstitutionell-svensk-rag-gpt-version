/**
 * Agentic RAG Tools - Simplified Core Set
 * 3 essential tools to start with
 */

// ═══════════════════════════════════════════════════════════════════════════
// VERKTYG FÖR AGENTIC RAG
// ═══════════════════════════════════════════════════════════════════════════
//
// Tool-calling är ENABLED: Gemma stöder tool_calls via Ollama.
// Verktyg anropas via direct RAG-strategi i agent-loop.ts.
//
// Alla LLM-anrop går via Ollama (port 11434).
//
// HYBRID SEARCH: Kombinerar BM25 keyword search med semantisk sökning
// - BM25: Exakta juridiska termer (SFS, lagnamn, förkortningar)
// - Semantisk: Koncept och synonymer via embeddings
// - Viktning: 0.3 BM25 + 0.7 semantisk (auto-justeras)
// ═══════════════════════════════════════════════════════════════════════════

import {
  hybridSearch,
  shouldUseBM25,
  getRecommendedWeights,
  type HybridSearchResult,
} from './hybrid-search';
import { BACKEND_URL, LLM_URL } from '../config';

const N8N_WEBHOOK_URL = 'http://localhost:5678/webhook'; // Adjust as needed

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (params: Record<string, any>) => Promise<ToolResult>;
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  description: string;
  required: boolean;
}

export interface ToolResult {
  success: boolean;
  data: any;
  error?: string;
}

/**
 * Core tools for the agent
 */
export const TOOLS: Tool[] = [
  // ═══════════════════════════════════════════════════════════════
  // TOOL 1: search_documents - Main RAG search
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'search_documents',
    description: 'Söker i dokumentdatabasen (ChromaDB) med svenska myndighetsdokument. Returnerar relevanta dokument med titel, förhandsvisning och relevanspoäng.',
    parameters: [
      { name: 'query', type: 'string', description: 'Sökfrågan på svenska', required: true },
      { name: 'limit', type: 'number', description: 'Max antal resultat (default 10, max 20)', required: false },
      { name: 'doc_type', type: 'string', description: 'Filtrera på typ: proposition, motion, lag, sou, betänkande, direktiv', required: false },
      { name: 'year', type: 'number', description: 'Filtrera på specifikt år', required: false },
    ],
    execute: searchDocuments,
  },

  // ═══════════════════════════════════════════════════════════════
  // TOOL 2: get_datetime - Simple utility
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'get_datetime',
    description: 'Hämtar aktuellt datum och tid. Användbart för tidsberoende frågor.',
    parameters: [],
    execute: getDateTime,
  },

  // ═══════════════════════════════════════════════════════════════
  // TOOL 3: web_search - External search via n8n/SearXNG
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'web_search',
    description: 'Söker på webben efter aktuell information som inte finns i dokumentdatabasen. Bra för nyheter, uppdateringar eller kontext utanför RAG.',
    parameters: [
      { name: 'query', type: 'string', description: 'Sökfrågan', required: true },
      { name: 'max_results', type: 'number', description: 'Max antal resultat (default 5)', required: false },
    ],
    execute: webSearch,
  },

  // ═══════════════════════════════════════════════════════════════
  // TOOL 4: think_longer - Multi-model ensemble för djupare analys
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'think_longer',
    description: 'Kör samma fråga genom flera modeller parallellt för djupare analys. Använd när svaret är osäkert, komplext eller kräver flera perspektiv. Returnerar konsensus och eventuella konflikter.',
    parameters: [
      { name: 'question', type: 'string', description: 'Frågan att analysera djupare', required: true },
      { name: 'context', type: 'string', description: 'Relevant kontext från tidigare sökningar', required: false },
      { name: 'focus', type: 'string', description: 'Vad ska fokuseras på: fakta, tolkning, konsekvens, jämförelse', required: false },
    ],
    execute: thinkLonger,
  },

  // ═══════════════════════════════════════════════════════════════
  // TOOL 5: done - Signal completion
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'done',
    description: 'Signalerar att agenten är klar och har samlat tillräckligt med information för att svara.',
    parameters: [
      { name: 'summary', type: 'string', description: 'Kort sammanfattning av vad som hittades', required: false },
    ],
    execute: async (params) => ({ success: true, data: { done: true, summary: params.summary || 'Klar' } }),
  },
];

/**
 * TOOL IMPLEMENTATIONS
 */

// ─────────────────────────────────────────────────────────────────
// search_documents - HYBRID SEARCH (BM25 + ChromaDB Semantic)
// ─────────────────────────────────────────────────────────────────
async function searchDocuments(params: Record<string, any>): Promise<ToolResult> {
  try {
    const rawQuery = params.query || '';
    const limit = Math.min(params.limit || 10, 20);

    // Decide if we should use hybrid search
    const useHybrid = shouldUseBM25(rawQuery);

    if (useHybrid) {
      // ════════════════════════════════════════════════════════════
      // HYBRID SEARCH: BM25 + Semantic
      // ════════════════════════════════════════════════════════════
      const weights = getRecommendedWeights(rawQuery);
      console.log(`🔀 search_documents [HYBRID]: "${rawQuery}" (BM25: ${weights.bm25}, Semantic: ${weights.semantic})`);

      const hybridResults = await hybridSearch(rawQuery, {
        limit,
        docType: params.doc_type,
        year: params.year,
        bm25Weight: weights.bm25,
        semanticWeight: weights.semantic,
      });

      const results = hybridResults.map((item: HybridSearchResult, idx: number) => ({
        id: item.id || `result-${idx}`,
        title: item.title || 'Untitled',
        preview: item.preview || item.content?.substring(0, 300) || '',
        content: item.content,
        score: Math.round(item.hybridScore * 100),
        bm25Score: Math.round(item.bm25Score * 100),
        semanticScore: Math.round(item.semanticScore * 100),
        source: item.source || item.docType || 'Unknown',
        docType: item.docType,
        year: item.year,
        searchType: 'hybrid',
      }));

      console.log(`   → Hittade ${results.length} dokument (hybrid)`);

      return {
        success: true,
        data: results
      };
    }

    // ════════════════════════════════════════════════════════════
    // SEMANTIC-ONLY SEARCH (fallback for conceptual queries)
    // ════════════════════════════════════════════════════════════

    // Build filters in the format expected by constitutional_routes.py
    const filters: any = {};
    if (params.doc_type) filters.doc_type = params.doc_type.toLowerCase();
    if (params.year) filters.date_from = `${params.year}-01-01`;

    // Extract the most important keyword for text search
    // Prioritize longer, more specific words (likely to be the subject)
    const stopWords = ['i', 'och', 'att', 'som', 'för', 'på', 'av', 'med', 'en', 'ett', 'den', 'det', 'är', 'var', 'ska', 'kan', 'om', 'till', 'från', 'lagar', 'reglering', 'reglerar', 'sverige', 'svensk', 'svenska', 'vilka', 'vilken', 'vilket', 'vad', 'hur', 'finns', 'finnas', 'gäller', 'innebär'];
    const words = rawQuery.toLowerCase().split(/\s+/).filter((w: string) =>
      w.length > 3 && !stopWords.includes(w)
    );
    // Pick the LONGEST word (most likely to be the specific subject)
    const searchQuery = words.sort((a: string, b: string) => b.length - a.length)[0] || rawQuery.split(/\s+/)[0] || rawQuery;

    const body: any = {
      query: searchQuery,
      limit,
      page: 1,
      sort: 'relevance',
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    };

    console.log(`🔍 search_documents [SEMANTIC]: "${params.query}" → "${searchQuery}" (limit: ${body.limit})`);

    const response = await fetch(`${BACKEND_URL}/api/constitutional/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return {
        success: false,
        data: [],
        error: `Search failed: ${response.status}`
      };
    }

    const data = await response.json();
    const results = (data.results || []).map((item: any, idx: number) => ({
      id: item.id || `result-${idx}`,
      title: item.title || 'Untitled',
      preview: item.snippet || item.content?.substring(0, 300) || '',
      content: item.content || item.snippet,
      score: Math.round((item.score || 0) * 100),
      source: item.source || item.doc_type || 'Unknown',
      docType: item.doc_type,
      year: item.year,
      searchType: 'semantic',
    }));

    console.log(`   → Hittade ${results.length} dokument (semantic)`);

    return {
      success: true,
      data: results
    };
  } catch (error) {
    console.error('search_documents error:', error);
    return {
      success: false,
      data: [],
      error: String(error)
    };
  }
}

// ─────────────────────────────────────────────────────────────────
// get_datetime - Current date/time
// ─────────────────────────────────────────────────────────────────
async function getDateTime(): Promise<ToolResult> {
  const now = new Date();

  const data = {
    iso: now.toISOString(),
    date: now.toLocaleDateString('sv-SE'),
    time: now.toLocaleTimeString('sv-SE'),
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    weekday: now.toLocaleDateString('sv-SE', { weekday: 'long' }),
    timestamp: now.getTime(),
  };

  console.log(`🕐 get_datetime: ${data.date} ${data.time}`);

  return {
    success: true,
    data
  };
}

// ─────────────────────────────────────────────────────────────────
// web_search - External search via n8n webhook
// ─────────────────────────────────────────────────────────────────
async function webSearch(params: Record<string, any>): Promise<ToolResult> {
  const query = params.query;
  const maxResults = params.max_results || 5;

  console.log(`🌐 web_search: "${query}" (max: ${maxResults})`);

  // Try n8n webhook first
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${N8N_WEBHOOK_URL}/web-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, max_results: maxResults }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      console.log(`   → n8n returnerade ${data.results?.length || 0} resultat`);
      return { success: true, data: data.results || data };
    }
  } catch (n8nError) {
    console.log('   → n8n webhook inte tillgänglig, provar SearXNG...');
  }

  // Fallback: Try SearXNG directly
  try {
    const searxngUrl = `http://localhost:8080/search?q=${encodeURIComponent(query)}&format=json&language=sv`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(searxngUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const results = (data.results || []).slice(0, maxResults).map((r: any) => ({
        title: r.title,
        url: r.url,
        snippet: r.content || r.snippet,
        source: r.engine,
      }));

      console.log(`   → SearXNG returnerade ${results.length} resultat`);
      return { success: true, data: results };
    }
  } catch (searxError) {
    console.log('   → SearXNG inte tillgänglig');
  }

  // Final fallback: Return empty with message
  return {
    success: true,
    data: [],
    error: 'Websökning inte tillgänglig just nu. Fortsätt med dokumentdatabasen.'
  };
}

// ─────────────────────────────────────────────────────────────────
// think_longer - Multi-model ensemble för djupare analys
// ─────────────────────────────────────────────────────────────────

interface ModelResponse {
  model: string;
  temperature: number;
  response: string;
  confidence?: number;
}

async function thinkLonger(params: Record<string, any>): Promise<ToolResult> {
  const question = params.question || '';
  const context = params.context || '';
  const focus = params.focus || 'analys';

  if (!question) {
    return { success: false, data: null, error: 'Ingen fråga angiven' };
  }

  console.log(`🧠 think_longer: "${question.substring(0, 50)}..." (focus: ${focus})`);

  // Build the analysis prompt
  const analysisPrompt = `${context ? `KONTEXT:\n${context}\n\n` : ''}FRÅGA: ${question}

FOKUS: ${focus}

Ge ett koncist, välgrundat svar. Var specifik och citera källor om möjligt.`;

  // Try n8n orchestration first (preferred - handles parallel GPU allocation)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for multi-model

    const response = await fetch(`${N8N_WEBHOOK_URL}/think-longer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        context,
        focus,
        prompt: analysisPrompt,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      console.log(`   → n8n ensemble: ${data.models_used || 3} modeller, konsensus: ${data.consensus_level || 'okänd'}`);
      return {
        success: true,
        data: {
          consensus: data.consensus,
          confidence: data.confidence,
          conflicts: data.conflicts || [],
          responses: data.responses || [],
          reasoning: data.reasoning || 'Multi-model analys genomförd',
        }
      };
    }
  } catch (n8nError) {
    console.log('   → n8n inte tillgänglig, kör lokal ensemble...');
  }

  // Fallback: Local parallel calls to Ollama with different temperatures
  try {
    const modelConfigs = [
      { name: 'gemma3:12b', temp: 0.1, role: 'Strikt faktabaserad' },
      { name: 'gemma3:12b', temp: 0.7, role: 'Balanserad analys' },
      { name: 'gemma3:12b', temp: 0.9, role: 'Kreativ/explorativ' },
    ];

    console.log(`   → Kör ${modelConfigs.length} parallella anrop till Ollama...`);

    // Run all models in parallel via Ollama OpenAI-compatible API
    const promises = modelConfigs.map(async (config): Promise<ModelResponse> => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        // Use native Ollama /api/chat with structured output
        const analysisSchema = {
          type: 'object',
          properties: {
            analysis: { type: 'string', description: 'Djupgående analys av materialet' },
          },
          required: ['analysis'],
        };

        const resp = await fetch(`${LLM_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: config.name,
            messages: [
              { role: 'system', content: `Du är en ${config.role.toLowerCase()} juridisk expert.` },
              { role: 'user', content: analysisPrompt }
            ],
            stream: false,
            format: analysisSchema,
            options: {
              temperature: config.temp,
              num_predict: 500,
            },
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!resp.ok) {
          return { model: config.name, temperature: config.temp, response: '', confidence: 0 };
        }

        const data = await resp.json();
        const content = data.message?.content || '';

        // Parse structured response
        let analysisText = '';
        try {
          const parsed = JSON.parse(content);
          analysisText = parsed.analysis || content;
        } catch {
          analysisText = content;
        }

        return {
          model: config.name,
          temperature: config.temp,
          response: analysisText,
          confidence: 0.8, // Default confidence for local models
        };
      } catch {
        return { model: config.name, temperature: config.temp, response: '', confidence: 0 };
      }
    });

    const responses = await Promise.all(promises);
    const validResponses = responses.filter(r => r.response.length > 0);

    if (validResponses.length === 0) {
      return {
        success: false,
        data: null,
        error: 'Ingen modell svarade'
      };
    }

    // Analyze consensus
    const consensusResult = analyzeConsensus(validResponses, question);

    console.log(`   → ${validResponses.length}/${modelConfigs.length} modeller svarade, konsensus: ${consensusResult.level}`);

    return {
      success: true,
      data: {
        consensus: consensusResult.summary,
        confidence: consensusResult.confidence,
        conflicts: consensusResult.conflicts,
        responses: validResponses.map(r => ({
          temperature: r.temperature,
          summary: r.response.substring(0, 200) + (r.response.length > 200 ? '...' : ''),
        })),
        reasoning: `Lokal ensemble med ${validResponses.length} temperaturvarianter`,
      }
    };
  } catch (error) {
    console.error('think_longer error:', error);
    return {
      success: false,
      data: null,
      error: String(error)
    };
  }
}

/**
 * Analyze consensus between model responses
 */
function analyzeConsensus(responses: ModelResponse[], question: string): {
  level: 'hög' | 'medel' | 'låg';
  confidence: number;
  summary: string;
  conflicts: string[];
} {
  if (responses.length < 2) {
    return {
      level: 'låg',
      confidence: 0.5,
      summary: responses[0]?.response || 'Inget svar',
      conflicts: ['Endast en modell svarade'],
    };
  }

  // Simple consensus: check for common key phrases
  const allText = responses.map(r => r.response.toLowerCase()).join(' ');
  const keyPhrases = extractKeyPhrases(allText);

  // Count how many responses contain each key phrase
  const phrasePresence = keyPhrases.map(phrase => {
    const count = responses.filter(r =>
      r.response.toLowerCase().includes(phrase.toLowerCase())
    ).length;
    return { phrase, count, ratio: count / responses.length };
  });

  // High consensus phrases (present in >66% of responses)
  const consensusPhrases = phrasePresence.filter(p => p.ratio >= 0.66);

  // Conflicts (present in <50% of responses)
  const conflictPhrases = phrasePresence.filter(p => p.ratio < 0.5 && p.ratio > 0);

  const consensusRatio = consensusPhrases.length / Math.max(keyPhrases.length, 1);

  let level: 'hög' | 'medel' | 'låg';
  let confidence: number;

  if (consensusRatio >= 0.7) {
    level = 'hög';
    confidence = 0.9;
  } else if (consensusRatio >= 0.4) {
    level = 'medel';
    confidence = 0.7;
  } else {
    level = 'låg';
    confidence = 0.5;
  }

  // Use the most confident response (lowest temperature) as base
  const baseResponse = responses.find(r => r.temperature === 0.1) || responses[0];

  // Build summary
  const summary = baseResponse.response;

  // Build conflict list
  const conflicts = conflictPhrases.slice(0, 3).map(p =>
    `Oenighet om: "${p.phrase}" (${Math.round(p.ratio * 100)}% eniga)`
  );

  return { level, confidence, summary, conflicts };
}

/**
 * Extract key phrases from text for comparison
 */
function extractKeyPhrases(text: string): string[] {
  // Simple extraction: sentences, important terms
  const phrases: string[] = [];

  // Extract SFS numbers
  const sfsMatches = text.match(/\b(1[89]\d{2}|20[0-2]\d):\d{1,4}\b/g) || [];
  phrases.push(...sfsMatches);

  // Extract years
  const yearMatches = text.match(/\b(19|20)\d{2}\b/g) || [];
  phrases.push(...yearMatches.slice(0, 5));

  // Extract Swedish legal terms
  const legalTerms = [
    'proposition', 'motion', 'betänkande', 'utskott', 'riksdag',
    'regering', 'lag', 'förordning', 'myndighet', 'beslut'
  ];
  legalTerms.forEach(term => {
    if (text.includes(term)) phrases.push(term);
  });

  // Extract key conclusions (sentences with definitive words)
  const sentences = text.split(/[.!?]+/).filter(s => s.length > 20);
  const conclusionWords = ['innebär', 'betyder', 'medför', 'leder till', 'ska', 'måste'];
  sentences.forEach(s => {
    if (conclusionWords.some(w => s.toLowerCase().includes(w))) {
      const words = s.trim().split(' ').slice(0, 5).join(' ');
      if (words.length > 10) phrases.push(words);
    }
  });

  return Array.from(new Set(phrases)).slice(0, 20);
}

/**
 * Get tool by name
 */
export function getTool(name: string): Tool | undefined {
  return TOOLS.find(t => t.name === name);
}

// ═══════════════════════════════════════════════════════════════════════════
// TOOL ROUTING - DISABLED (Direct RAG strategy)
// ═══════════════════════════════════════════════════════════════════════════
// Tool-calling via LLM är DISABLED. Verktyg väljs via direct RAG-strategi.
// Gemma 3 12B används för faktasvar, GPT-SW3 6.7B för naturlig svenska.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format tools for LLM prompt
 */
export function formatToolsForPrompt(): string {
  return TOOLS.map(tool => {
    const params = tool.parameters.length > 0
      ? tool.parameters
        .map(p => `  - ${p.name} (${p.type}${p.required ? ', REQUIRED' : ''}): ${p.description}`)
        .join('\n')
      : '  (inga parametrar)';
    return `### ${tool.name}\n${tool.description}\nParametrar:\n${params}`;
  }).join('\n\n');
}
