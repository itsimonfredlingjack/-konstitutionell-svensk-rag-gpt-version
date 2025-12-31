/**
 * Agent Tools - Ministral 3 14B Native Function Calling
 *
 * ReAct Pattern (Reasoning + Acting):
 * 1. THINK: Model reasons about what it needs
 * 2. ACT: Calls a tool via native function calling
 * 3. OBSERVE: Gets tool result
 * 4. REPEAT: Until final_answer is called
 *
 * Tools are defined in Ollama's native format for Ministral's
 * built-in function calling support (no prompt engineering needed!)
 */

import { getTool, type ToolResult } from './tools';
import { MODEL_CONFIG } from '../orchestration/response-schema';

// ═══════════════════════════════════════════════════════════════════════════
// OLLAMA TOOL SCHEMAS (Native Function Calling Format)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ollama Tool Definition
 * https://ollama.com/blog/tool-support
 */
export interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: string;
        description: string;
        enum?: string[];
      }>;
      required: string[];
    };
  };
}

/**
 * Tool Call from Ministral
 *
 * Note: arguments can be either a JSON string (OpenAI format)
 * or already-parsed object (Ollama native format)
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string | Record<string, unknown>;
  };
}

/**
 * Agent Step - One iteration of ReAct loop
 */
export interface AgentStep {
  iteration: number;
  thought: string;
  tool: string;
  toolInput: Record<string, unknown>;
  observation: ToolResult;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// TOOL ARSENAL - 6 Tools for Maximum Agentic Power
// ═══════════════════════════════════════════════════════════════════════════

export const AGENT_TOOLS: OllamaTool[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // TOOL 1: search_documents - Initial RAG search
  // ─────────────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'search_documents',
      description: `Söker i ChromaDB med 535K svenska myndighetsdokument.
Använd för att hitta propositioner, lagar (SFS), SOU-rapporter, motioner och betänkanden.
Returnerar dokument med titel, innehåll och relevanspoäng.
Tips: Sök med specifika termer som "bygglov PBL" istället för generella frågor.`,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Sökfrågan på svenska. Använd specifika juridiska termer.',
          },
          limit: {
            type: 'number',
            description: 'Max antal resultat (1-20, default 10)',
          },
          doc_type: {
            type: 'string',
            description: 'Filtrera på dokumenttyp: prop=propositioner, mot=motioner, sfs=lagar, sou=utredningar, bet=betänkanden, ds=departementsserier',
            enum: ['prop', 'mot', 'sfs', 'sou', 'bet', 'ds'],
          },
        },
        required: ['query'],
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TOOL 2: search_more - Fördjupad/utökad sökning
  // ─────────────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'search_more',
      description: `Utöka eller fördjupa sökningen med nya söktermer.
Använd när första sökningen gav för få resultat eller saknade viktig information.
Bra för att hitta undantag, specialfall eller kompletterande dokument.`,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Ny eller förfinad sökfråga',
          },
          exclude_ids: {
            type: 'string',
            description: 'Kommaseparerade dokument-IDs att exkludera',
          },
          focus: {
            type: 'string',
            description: 'Vad ska sökningen fokusera på',
            enum: ['undantag', 'ändringar', 'historik', 'tillämpning', 'praxis'],
          },
        },
        required: ['query'],
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TOOL 3: compare_sources - Jämför dokument
  // ─────────────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'compare_sources',
      description: `Jämför två eller flera dokument för att hitta likheter, skillnader eller motstridigheter.
Använd när olika källor verkar säga olika saker eller när du behöver spåra ändringar över tid.`,
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: 'Ämnet att jämföra källor kring',
          },
          aspects: {
            type: 'string',
            description: 'Vilka aspekter att jämföra (kommaseparerade)',
          },
        },
        required: ['topic'],
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TOOL 4: verify_claim - Faktakolla påstående
  // ─────────────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'verify_claim',
      description: `Verifiera ett specifikt påstående mot primärkällor i databasen.
Använd för att dubbelkolla SFS-nummer, årtal, myndighetsnamn eller juridiska fakta.
Returnerar verifieringsstatus och källhänvisning.`,
      parameters: {
        type: 'object',
        properties: {
          claim: {
            type: 'string',
            description: 'Påståendet att verifiera',
          },
          expected_source: {
            type: 'string',
            description: 'Förväntad källa (SFS-nummer, propositionsnummer, etc.)',
          },
        },
        required: ['claim'],
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TOOL 5: clarify_question - Fråga användaren
  // ─────────────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'clarify_question',
      description: `Be användaren förtydliga sin fråga om den är tvetydig eller otillräcklig.
Använd ENDAST om frågan verkligen är oklar - inte för att köpa tid.
Ställ en specifik följdfråga.`,
      parameters: {
        type: 'object',
        properties: {
          clarification_question: {
            type: 'string',
            description: 'Följdfrågan till användaren',
          },
          reason: {
            type: 'string',
            description: 'Kort förklaring varför förtydligande behövs',
          },
          options: {
            type: 'string',
            description: 'Förslag på möjliga tolkningar (kommaseparerade)',
          },
        },
        required: ['clarification_question', 'reason'],
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TOOL 6: final_answer - Avsluta med svar
  // ─────────────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'final_answer',
      description: `Avsluta sökningen och ge det slutliga svaret.
KRAV: Inkludera citat med [1], [2], etc. som pekar på sources.
Använd ENDAST när du har tillräckligt med information för att svara korrekt.`,
      parameters: {
        type: 'object',
        properties: {
          answer: {
            type: 'string',
            description: 'Det fullständiga svaret med citat [1], [2], etc.',
          },
          confidence: {
            type: 'number',
            description: 'Konfidensgrad 0.0-1.0 baserat på källkvalitet',
          },
          sources_used: {
            type: 'string',
            description: 'Kommaseparerade dokument-IDs som användes',
          },
        },
        required: ['answer', 'confidence'],
      },
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// TOOL EXECUTION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

const BACKEND_URL = 'http://localhost:8000';
const OLLAMA_URL = 'http://localhost:11434';

/**
 * Execute a tool by name with given parameters
 */
export async function executeTool(
  toolName: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  console.log(`🔧 Executing tool: ${toolName}`);
  console.log(`   Params: ${JSON.stringify(params).substring(0, 100)}...`);

  switch (toolName) {
    case 'search_documents':
    case 'search_more':
      return executeSearch(params);

    case 'compare_sources':
      return executeCompare(params);

    case 'verify_claim':
      return executeVerify(params);

    case 'clarify_question':
      return executeClarify(params);

    case 'final_answer':
      return executeFinalAnswer(params);

    default:
      // Fallback to existing tool implementation
      const existingTool = getTool(toolName);
      if (existingTool) {
        return existingTool.execute(params);
      }
      return {
        success: false,
        data: null,
        error: `Unknown tool: ${toolName}`,
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// search_documents / search_more
// ─────────────────────────────────────────────────────────────────────────
async function executeSearch(params: Record<string, unknown>): Promise<ToolResult> {
  try {
    const query = String(params.query || '');
    const limit = Math.min(Number(params.limit) || 10, 20);
    const docType = params.doc_type as string | undefined;
    const excludeIds = params.exclude_ids
      ? String(params.exclude_ids).split(',').map(s => s.trim())
      : [];

    // Build request body
    const body: Record<string, unknown> = {
      query,
      limit: limit + excludeIds.length, // Request extra to compensate for exclusions
      page: 1,
      sort: 'relevance',
    };

    if (docType) {
      body.filters = { doc_type: docType.toLowerCase() };
    }

    console.log(`🔍 Search: "${query}" (limit: ${limit}, type: ${docType || 'all'})`);

    const response = await fetch(`${BACKEND_URL}/api/constitutional/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return { success: false, data: [], error: `Search failed: ${response.status}` };
    }

    const data = await response.json();
    let results = (data.results || []).map((item: Record<string, unknown>, idx: number) => ({
      id: item.id || `result-${idx}`,
      title: item.title || 'Untitled',
      content: item.content || item.snippet || '',
      preview: String(item.snippet || item.content || '').substring(0, 300),
      score: Math.round((Number(item.score) || 0) * 100),
      source: item.source || item.doc_type || 'Unknown',
      docType: item.doc_type,
      sfs: item.sfs,
      year: item.year,
    }));

    // Filter out excluded IDs
    if (excludeIds.length > 0) {
      results = results.filter((r: { id: string }) => !excludeIds.includes(r.id));
    }

    // Limit to requested amount
    results = results.slice(0, limit);

    console.log(`   → Found ${results.length} documents`);

    return { success: true, data: results };
  } catch (error) {
    console.error('Search error:', error);
    return { success: false, data: [], error: String(error) };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// compare_sources
// ─────────────────────────────────────────────────────────────────────────
async function executeCompare(params: Record<string, unknown>): Promise<ToolResult> {
  try {
    const topic = String(params.topic || '');
    const aspects = params.aspects
      ? String(params.aspects).split(',').map(s => s.trim())
      : ['definition', 'tillämpning', 'undantag'];

    console.log(`⚖️ Compare: "${topic}" on aspects: ${aspects.join(', ')}`);

    // Search for different document types about the same topic
    // Using actual database doc_type values: prop, sfs, sou
    const searches = [
      fetch(`${BACKEND_URL}/api/constitutional/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: topic, limit: 3, filters: { doc_type: 'prop' } }),
      }),
      fetch(`${BACKEND_URL}/api/constitutional/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: topic, limit: 3, filters: { doc_type: 'sfs' } }),
      }),
      fetch(`${BACKEND_URL}/api/constitutional/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: topic, limit: 3, filters: { doc_type: 'sou' } }),
      }),
    ];

    const responses = await Promise.all(searches);
    const results = await Promise.all(responses.map(r => r.ok ? r.json() : { results: [] }));

    const sources = {
      prop: results[0].results?.slice(0, 2) || [],
      sfs: results[1].results?.slice(0, 2) || [],
      sou: results[2].results?.slice(0, 2) || [],
    };

    const totalSources = sources.prop.length + sources.sfs.length + sources.sou.length;
    console.log(`   → Found ${totalSources} sources to compare`);

    return {
      success: true,
      data: {
        topic,
        aspects,
        sources,
        comparison: `Jämförelse av ${totalSources} källor om "${topic}"`,
      },
    };
  } catch (error) {
    console.error('Compare error:', error);
    return { success: false, data: null, error: String(error) };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// verify_claim
// ─────────────────────────────────────────────────────────────────────────
async function executeVerify(params: Record<string, unknown>): Promise<ToolResult> {
  try {
    const claim = String(params.claim || '');
    const expectedSource = params.expected_source as string | undefined;

    console.log(`✓ Verify: "${claim.substring(0, 50)}..."`);

    // Extract potential SFS numbers from the claim
    const sfsMatch = claim.match(/\b(1[89]\d{2}|20[0-2]\d):\d{1,4}\b/);
    const searchQuery = sfsMatch ? `${sfsMatch[0]} ${claim}` : claim;

    // Search for the claim
    const response = await fetch(`${BACKEND_URL}/api/constitutional/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: searchQuery, limit: 5 }),
    });

    if (!response.ok) {
      return { success: false, data: null, error: 'Verification search failed' };
    }

    const data = await response.json();
    const results = data.results || [];

    // Check if we found supporting evidence
    const topScore = results[0]?.score || 0;
    const verified = topScore >= 0.65;

    const verificationResult = {
      claim,
      verified,
      confidence: topScore,
      supporting_sources: results.slice(0, 3).map((r: Record<string, unknown>) => ({
        title: r.title,
        sfs: r.sfs,
        score: r.score,
      })),
      expected_source: expectedSource,
      status: verified ? 'VERIFIED' : 'UNVERIFIED',
    };

    console.log(`   → ${verified ? '✅ VERIFIED' : '⚠️ UNVERIFIED'} (score: ${topScore.toFixed(2)})`);

    return { success: true, data: verificationResult };
  } catch (error) {
    console.error('Verify error:', error);
    return { success: false, data: null, error: String(error) };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// clarify_question
// ─────────────────────────────────────────────────────────────────────────
async function executeClarify(params: Record<string, unknown>): Promise<ToolResult> {
  const clarificationQuestion = String(params.clarification_question || '');
  const reason = String(params.reason || '');
  const options = params.options
    ? String(params.options).split(',').map(s => s.trim())
    : [];

  console.log(`❓ Clarify: "${clarificationQuestion}"`);
  console.log(`   Reason: ${reason}`);

  return {
    success: true,
    data: {
      needs_clarification: true,
      question: clarificationQuestion,
      reason,
      options,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// final_answer
// ─────────────────────────────────────────────────────────────────────────
async function executeFinalAnswer(params: Record<string, unknown>): Promise<ToolResult> {
  const answer = String(params.answer || '');
  const confidence = Number(params.confidence) || 0.5;
  const sourcesUsed = params.sources_used
    ? String(params.sources_used).split(',').map(s => s.trim())
    : [];

  console.log(`📝 Final Answer (confidence: ${confidence.toFixed(2)})`);
  console.log(`   Sources: ${sourcesUsed.length > 0 ? sourcesUsed.join(', ') : 'none specified'}`);

  return {
    success: true,
    data: {
      done: true,
      answer,
      confidence,
      sources_used: sourcesUsed,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TOOL CALL PARSER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse tool calls from Ministral's response
 *
 * Ministral outputs tool calls in multiple formats:
 * 1. Standard tool_calls array (OpenAI-compatible)
 * 2. Text format: `tool_name[ARGS]{"key": "value"}`
 * 3. Text format: `tool_name({"key": "value"})`
 *
 * This parser handles all formats.
 */
export function parseToolCalls(message: {
  tool_calls?: ToolCall[];
  content?: string;
}): { toolName: string; args: Record<string, unknown> }[] {
  const results: { toolName: string; args: Record<string, unknown> }[] = [];

  // ─────────────────────────────────────────────────────────────────────────
  // METHOD 1: Standard tool_calls array (preferred)
  // ─────────────────────────────────────────────────────────────────────────
  if (message.tool_calls && message.tool_calls.length > 0) {
    for (const tc of message.tool_calls) {
      let args: Record<string, unknown> = {};
      const rawArgs = tc.function.arguments;

      if (typeof rawArgs === 'string') {
        try {
          args = JSON.parse(rawArgs || '{}');
        } catch {
          console.warn(`Failed to parse tool args string: ${rawArgs}`);
        }
      } else if (typeof rawArgs === 'object' && rawArgs !== null) {
        args = rawArgs as Record<string, unknown>;
      }

      results.push({ toolName: tc.function.name, args });
    }
    return results;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // METHOD 2: Parse text format (Ministral's custom output)
  // ─────────────────────────────────────────────────────────────────────────
  if (message.content) {
    const content = message.content;

    // Pattern 1: tool_name[ARGS]{"key": "value"}
    const argsPattern = /(\w+)\[ARGS\](\{[^}]+\})/g;
    let match;
    while ((match = argsPattern.exec(content)) !== null) {
      try {
        const args = JSON.parse(match[2]);
        results.push({ toolName: match[1], args });
      } catch {
        console.warn(`Failed to parse ARGS format: ${match[0]}`);
      }
    }

    // Pattern 2: tool_name({"key": "value"})
    if (results.length === 0) {
      const funcPattern = /(\w+)\((\{[^)]+\})\)/g;
      while ((match = funcPattern.exec(content)) !== null) {
        try {
          const args = JSON.parse(match[2]);
          results.push({ toolName: match[1], args });
        } catch {
          console.warn(`Failed to parse function format: ${match[0]}`);
        }
      }
    }

    // Pattern 3: <tool_call>{"name": "...", "arguments": {...}}</tool_call>
    if (results.length === 0) {
      const xmlPattern = /<tool_call>(\{[\s\S]+?\})<\/tool_call>/g;
      while ((match = xmlPattern.exec(content)) !== null) {
        try {
          const parsed = JSON.parse(match[1]);
          results.push({
            toolName: parsed.name,
            args: typeof parsed.arguments === 'string'
              ? JSON.parse(parsed.arguments)
              : parsed.arguments || {},
          });
        } catch {
          console.warn(`Failed to parse XML format: ${match[0]}`);
        }
      }
    }
  }

  return results;
}

/**
 * Format tool result for next iteration
 */
export function formatToolResult(toolName: string, result: ToolResult): string {
  if (!result.success) {
    return `[${toolName}] ERROR: ${result.error || 'Unknown error'}`;
  }

  const data = result.data;

  if (Array.isArray(data)) {
    // Search results
    const summary = data.slice(0, 5).map((d: Record<string, unknown>, i: number) =>
      `[${i + 1}] ${d.title || d.id} (score: ${d.score}%)`
    ).join('\n');
    return `[${toolName}] Hittade ${data.length} resultat:\n${summary}`;
  }

  if (data?.done) {
    return `[${toolName}] Svar genererat med konfidens ${data.confidence}`;
  }

  if (data?.needs_clarification) {
    return `[${toolName}] Behöver förtydligande: ${data.question}`;
  }

  if (data?.verified !== undefined) {
    return `[${toolName}] Verifiering: ${data.verified ? 'BEKRÄFTAD' : 'EJ BEKRÄFTAD'} (konfidens: ${data.confidence})`;
  }

  return `[${toolName}] ${JSON.stringify(data).substring(0, 200)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// REACT SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════

export const REACT_SYSTEM_PROMPT = `Du är en juridisk AI-assistent med tillgång till 535K svenska myndighetsdokument.

UPPGIFT: Besvara användarens fråga genom att söka och analysera relevanta dokument.

TILLGÄNGLIGA VERKTYG:
- search_documents: Sök i dokumentdatabasen
- search_more: Utöka sökningen med nya termer
- compare_sources: Jämför olika källor
- verify_claim: Verifiera ett påstående
- clarify_question: Be om förtydligande
- final_answer: Ge slutligt svar

PROCESS (ReAct):
1. TÄNK: Vad behöver jag veta för att svara?
2. AGERA: Välj rätt verktyg och parametrar
3. OBSERVERA: Analysera resultatet
4. UPPREPA: Tills du har tillräckligt med information
5. SVARA: Använd final_answer med citat [1], [2], etc.

REGLER:
- Sök ALLTID efter dokument innan du svarar på juridiska frågor
- Använd specifika söktermer (t.ex. "PBL bygglov" inte "bygga hus")
- Verifiera osäkra påståenden med verify_claim
- Citera ALLTID källor i final_answer med [1], [2], etc.
- Max 5 iterationer - prioritera kvalitet över kvantitet
- Om frågan är otydlig, använd clarify_question

SPRÅK: Svara alltid på svenska.`;

export const REACT_TOOLS_FOR_OLLAMA = AGENT_TOOLS;
