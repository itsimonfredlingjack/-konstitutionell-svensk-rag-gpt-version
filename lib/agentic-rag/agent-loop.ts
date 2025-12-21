/**
 * Constitutional AI - Agentic RAG Loop (OPTIMIZED)
 *
 * ReAct pattern: Reason → Act → Observe → Repeat
 * GPT-OSS 20B via llama-server for all LLM calls
 * 
 * NOTE: Hermes removed. Tool-calling disabled until gpt-oss supports structured tool_calls.
 * Using direct RAG: search → context → LLM
 */

import { TOOLS, getTool, type ToolResult } from './tools';
import { logMetric } from '../api';
import {
  ANSWER_PROFILE,
  TOOL_PROFILE,
  JSON_PROFILE,
  FINALIZER_PROFILE,
  buildAnswerPrompt,
  enforceCitationPolicy,
  validateStructure,
  type SourceDocument,
} from '../swedish-prompt-profiles';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION - llama-server only (NO Ollama/Hermes)
// ═══════════════════════════════════════════════════════════════════════════
const LLAMA_SERVER_URL = 'http://localhost:8080';
const ANSWER_MODEL = 'gpt-oss';   // Answer model via llama-server
const MAX_ITERATIONS = 3;         // Optimized: 3 is enough for most queries

// Hallucination Jail Warden - verifierar alla svar mot 2M dokument i ChromaDB
const JAIL_WARDEN_ENABLED = true;

// Tool-calling status (tested 2024-12-21)
// gpt-oss DOES support structured tool_calls via /v1/chat/completions!
const TOOL_CALLING_ENABLED = true;  // ENABLED: gpt-oss returns valid tool_calls JSON

// ═══════════════════════════════════════════════════════════════════════════
// MODELL-KONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════
//
// ANSWER_MODEL = gpt-oss (via llama-server on port 8080)
//   - BÄSTA generalist-modellen
//   - Stark på resonemang, analys, juridik
//   - ANVÄNDS FÖR: Alla LLM-anrop (slutsvar, resonemang)
//   - Körs med Harmony template via --jinja
//   - Reasoning control: via --chat-template-kwargs on server (default: low)
//
// RADERA INTE GPT-OSS - Den är huvudmodellen för all kommunikation!
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface AgentThought {
  reasoning: string;
  action: string;
  action_input: Record<string, any>;
}

interface AgentStep {
  thought: AgentThought;
  observation: ToolResult;
}

interface AgentResponse {
  question: string;
  steps: AgentStep[];
  final_answer: string;
  confidence: number;
  sources: string[];
  iterations: number;
  total_time_ms: number;
  jail_warden_status: 'VERIFIED' | 'REGENERATED' | 'ERROR' | 'SKIPPED';
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENT LOOP (OPTIMIZED)
// ═══════════════════════════════════════════════════════════════════════════

export async function runAgent(question: string): Promise<AgentResponse> {
  const startTime = Date.now();
  const steps: AgentStep[] = [];
  const sources: string[] = [];
  const usedQueries = new Set<string>();  // Track queries to avoid duplicates
  let totalDocsFound = 0;

  console.log('\n' + '═'.repeat(60));
  console.log('🤖 AGENT STARTAR');
  console.log('═'.repeat(60));
  console.log(`📝 Fråga: "${question}"\n`);

  let iteration = 0;
  let isDone = false;
  let finalAnswer = '';

  // NOTE: FunctionGemma routing DISABLED (used Ollama)
  // Using direct RAG strategy instead

  // State for smart decisions
  let lastObservation = '';

  while (!isDone && iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`\n🔄 Iteration ${iteration}/${MAX_ITERATIONS}`);
    console.log('─'.repeat(40));

    try {
      // Get agent's next thought with context about what we've found
      const thought = await getAgentThought(question, lastObservation, totalDocsFound, iteration);
      console.log(`💭 Reasoning: ${thought.reasoning.substring(0, 80)}...`);
      console.log(`🎯 Action: ${thought.action}`);

      if (thought.action === 'done') {
        isDone = true;
        finalAnswer = thought.action_input.summary || 'Analys klar.';
        console.log('✅ Agent är klar!');
        break;
      }

      // Skip duplicate queries
      const queryKey = `${thought.action}:${JSON.stringify(thought.action_input)}`;
      if (usedQueries.has(queryKey)) {
        console.log('⏭️ Hoppar över dublett, avslutar...');
        isDone = true;
        break;
      }
      usedQueries.add(queryKey);

      // Execute the tool
      const tool = getTool(thought.action);
      if (!tool) {
        console.log(`⚠️ Okänt verktyg: ${thought.action}`);
        continue;
      }

      console.log(`🔧 Kör ${thought.action}...`);
      const observation = await tool.execute(thought.action_input);

      // Track sources and count from search results
      if (thought.action === 'search_documents' && observation.success && observation.data) {
        const docs = observation.data;
        totalDocsFound += docs.length;
        docs.forEach((doc: any) => {
          if (doc.title) sources.push(doc.title);
        });

        // Auto-complete if we have enough high-quality results
        if (totalDocsFound >= 10 && iteration >= 2) {
          console.log(`📚 ${totalDocsFound} dokument hittade, tillräckligt!`);
          isDone = true;
        }
      }

      // Record step
      steps.push({ thought, observation });

      // Compact observation for next iteration (limit context bloat)
      lastObservation = formatObservation(observation.data);

      console.log(`📊 Observation: ${observation.success ? 'Lyckades' : 'Misslyckades'} (${totalDocsFound} docs total)`);

    } catch (error) {
      console.error(`❌ Fel i iteration ${iteration}:`, error);
      // Don't add error to context, just continue
    }
  }

  // Generate final answer
  if (!finalAnswer || finalAnswer === 'Analys klar.') {
    finalAnswer = await generateFinalAnswer(question, steps);
  }

  // ════════════════════════════════════════════════════════════════════════
  // JAIL WARDEN VERIFICATION - Verifiera svar mot ChromaDB
  // ════════════════════════════════════════════════════════════════════════
  let jailWardenStatus: 'VERIFIED' | 'REGENERATED' | 'ERROR' | 'SKIPPED' = 'SKIPPED';

  if (JAIL_WARDEN_ENABLED) {
    const jailWardenResult = await verifyWithJailWarden(question, finalAnswer);
    jailWardenStatus = jailWardenResult.status;

    // Använd det verifierade/regenererade svaret
    if (jailWardenResult.answer) {
      finalAnswer = jailWardenResult.answer;
    }
  }

  const totalTime = Date.now() - startTime;

  console.log('\n' + '═'.repeat(60));
  console.log('📋 SLUTSVAR');
  console.log('═'.repeat(60));
  console.log(finalAnswer);
  console.log(`\n⏱️  Total tid: ${totalTime}ms | Iterationer: ${iteration}`);
  console.log(`🚨 Jail Warden: ${jailWardenStatus}`);

  return {
    question,
    steps,
    final_answer: finalAnswer,
    confidence: calculateConfidence(steps, totalDocsFound),
    sources: [...new Set(sources)].slice(0, 10),
    iterations: iteration,
    total_time_ms: totalTime,
    jail_warden_status: jailWardenStatus,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// OPTIMIZED HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function getAgentThought(
  question: string,
  lastObservation: string,
  docsFound: number,
  iteration: number
): Promise<AgentThought> {

  // Extract key subject from question for better search fallback
  const keySubject = extractKeySubject(question);

  // Early exit if we have enough docs
  if (docsFound >= 5) {
    return { reasoning: 'Har tillräckligt med dokument', action: 'done', action_input: {} };
  }

  if (!TOOL_CALLING_ENABLED) {
    // Direct RAG fallback
    if (iteration === 1) {
      return {
        reasoning: 'Söker dokument om ämnet',
        action: 'search_documents',
        action_input: { query: keySubject },
      };
    }
    if (docsFound > 0) {
      return { reasoning: 'Har hittat dokument, avslutar', action: 'done', action_input: {} };
    }
    return {
      reasoning: 'Försöker bredare sökning',
      action: 'search_documents',
      action_input: { query: question.split(' ').slice(0, 3).join(' ') },
    };
  }

  // TOOL-CALLING ENABLED: Use gpt-oss via llama-server
  const tools = [
    {
      type: 'function',
      function: {
        name: 'search_documents',
        description: 'Söker i ChromaDB med svenska myndighetsdokument',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string', description: 'Sökfrågan' } },
          required: ['query']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'done',
        description: 'Signalerar att sökningen är klar',
        parameters: {
          type: 'object',
          properties: { summary: { type: 'string', description: 'Sammanfattning' } }
        }
      }
    }
  ];

  // Use TOOL_PROFILE from swedish-prompt-profiles.ts
  const systemPrompt = `${TOOL_PROFILE.systemPrompt}
${docsFound >= 3 ? 'Du har tillräckligt med dokument - använd done.' : 'Sök efter relevanta dokument.'}`;

  const messages = [
    {
      role: 'system',
      content: systemPrompt
    },
    { role: 'user', content: question }
  ];

  if (lastObservation) {
    messages.push({ role: 'assistant', content: `Hittade: ${lastObservation}` });
  }

  try {
    const response = await fetch(`${LLAMA_SERVER_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ANSWER_MODEL,
        messages,
        tools,
        temperature: TOOL_PROFILE.temperature,
        max_tokens: TOOL_PROFILE.max_tokens,
      }),
    });

    if (!response.ok) {
      throw new Error(`llama-server error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function) {
      try {
        const args = JSON.parse(toolCall.function.arguments || '{}');
        return {
          reasoning: `Tool: ${toolCall.function.name}`,  // Never expose reasoning_content
          action: toolCall.function.name,
          action_input: args,
        };
      } catch (parseError) {
        logMetric('tool_args_parse_failed', {
          function: 'decide',
          tool_name: toolCall.function.name,
          raw_args: toolCall.function.arguments,
          error: String(parseError)
        });
        // Fallback with empty args rather than crashing
        return {
          reasoning: `Tool: ${toolCall.function.name} (args parse failed)`,
          action: toolCall.function.name,
          action_input: {},
        };
      }
    }

    // No tool call - default to done if we have docs
    if (docsFound > 0) {
      return { reasoning: 'Avslutar sökning', action: 'done', action_input: {} };
    }
    return {
      reasoning: 'Fallback till sökning',
      action: 'search_documents',
      action_input: { query: keySubject },
    };

  } catch (error) {
    console.error('Tool-calling error:', error);
    // Fallback to direct RAG
    return {
      reasoning: 'Fel vid tool-calling, fallback',
      action: 'search_documents',
      action_input: { query: keySubject },
    };
  }
}

// Extract the key subject from a question (longest meaningful word)
function extractKeySubject(question: string): string {
  const stopWords = ['vilka', 'vilken', 'vilket', 'vad', 'hur', 'finns', 'finnas', 'gäller', 'innebär', 'lagar', 'regler', 'reglerar', 'reglering', 'sverige', 'svensk', 'svenska', 'och', 'att', 'som', 'för', 'med', 'den', 'det', 'är', 'var', 'ska', 'kan', 'till', 'från'];
  const words = question.toLowerCase().split(/\s+/).filter(w =>
    w.length > 4 && !stopWords.includes(w)
  );
  // Return longest word (most likely the subject)
  return words.sort((a, b) => b.length - a.length)[0] || question.split(' ').pop() || question;
}

function formatObservation(data: any): string {
  if (!data) return '';

  if (Array.isArray(data)) {
    // Compact format: just titles
    return data.slice(0, 5).map((d: any) =>
      `• ${d.title || d.id}`
    ).join('\n');
  }

  return JSON.stringify(data).substring(0, 300);
}

async function generateFinalAnswer(question: string, steps: AgentStep[]): Promise<string> {
  // Collect document context and build sources
  const sources: SourceDocument[] = [];

  for (const step of steps) {
    if (Array.isArray(step.observation.data)) {
      step.observation.data.forEach((doc: any, idx: number) => {
        if (sources.length < 5) {  // Max 5 sources
          sources.push({
            id: doc.id || `doc-${idx}`,
            title: doc.title || 'Okänt dokument',
            content: doc.content || doc.preview || '',
            sfs: doc.sfs,  // SFS number if available
          });
        }
      });
    }
  }

  console.log(`\n🎯 Genererar slutsvar med ${ANSWER_MODEL} (${sources.length} källor)...`);

  // Build structured prompt with source citations
  const { userPrompt, sourceCount } = buildAnswerPrompt(question, sources);

  try {
    // Use ANSWER_PROFILE from swedish-prompt-profiles.ts
    const response = await fetch(`${LLAMA_SERVER_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ANSWER_MODEL,
        messages: [
          {
            role: 'system',
            content: ANSWER_PROFILE.systemPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        temperature: ANSWER_PROFILE.temperature,
        max_tokens: ANSWER_PROFILE.max_tokens,
      }),
    });

    if (!response.ok) {
      console.error(`llama-server error: ${response.status}`);
      return 'Kunde inte generera slutsvar.';
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;

    // Harmony template: content = final answer
    // IMPORTANT: Never expose reasoning_content to users
    let answer = message?.content || '';

    // Content-empty recovery: run finalizer (no reasoning_content parsing)
    if (!answer) {
      console.warn('⚠️ GPT-OSS: content empty, running finalizer');
      answer = await runAgentFinalizer(question);
      return answer;
    }

    // SWEDISH UX HARDENING: Enforce citation policy
    const { cleaned, violations } = enforceCitationPolicy(answer, sourceCount);
    if (violations.length > 0) {
      logMetric('citation_violations_removed', { 
        violations: violations.join(', '),
        source_count: sourceCount 
      });
      console.warn(`⚠️  Removed invalid citations: ${violations.join(', ')}`);
    }

    // SWEDISH UX HARDENING: Validate structure
    const structureViolations = validateStructure(cleaned, sourceCount);
    if (structureViolations.length > 0) {
      logMetric('structure_violations_detected', {
        violations: structureViolations.map(v => v.type),
        line_count: cleaned.split('\n').length,
      });
      console.warn(`⚠️  Structure violations: ${structureViolations.map(v => v.type).join(', ')}`);
      // TODO: Implement style finalizer if violations are severe
    }

    return cleaned || 'Inget svar kunde genereras.';

  } catch (error) {
    console.error('Answer generation error:', error);
    return `Fel: ${error}`;
  }
}

/**
 * Finalizer: Force a direct Swedish answer when content-empty recovery is needed.
 * Uses a simple prompt that bypasses thinking mode.
 */
async function runAgentFinalizer(originalQuestion: string): Promise<string> {
  try {
    // Use FINALIZER_PROFILE from swedish-prompt-profiles.ts
    const response = await fetch(`${LLAMA_SERVER_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ANSWER_MODEL,
        messages: [
          { 
            role: 'system', 
            content: FINALIZER_PROFILE.systemPrompt
          },
          { role: 'user', content: `Svara kort: ${originalQuestion}` }
        ],
        temperature: FINALIZER_PROFILE.temperature,
        max_tokens: FINALIZER_PROFILE.max_tokens,
      }),
    });

    if (!response.ok) {
      return 'Kunde inte generera svar.';
    }

    const data = await response.json();
    logMetric('finalizer_triggered', { reason: 'content_empty_agent_loop' });
    return data.choices?.[0]?.message?.content || 'Inget svar kunde genereras.';
  } catch {
    return 'Fel vid generering av svar.';
  }
}

// Format GPT-OSS thinking into a proper Swedish answer (DEPRECATED - kept for reference)
function formatGptOssAnswer(thinking: string, question: string): string {
  // Find actual law names (not "Allemansrätten" itself which is the subject)
  const lawMatches: string[] = [];

  // Swedish law patterns
  const patterns = [
    { regex: /Miljöbalken/gi, name: 'Miljöbalken' },
    { regex: /Skogsvårdslagen/gi, name: 'Skogsvårdslagen' },
    { regex: /Naturvårdslagen/gi, name: 'Naturvårdslagen' },
    { regex: /Jordabalken/gi, name: 'Jordabalken' },
    { regex: /Regeringsformen/gi, name: 'Regeringsformen' },
    { regex: /Environmental Code/gi, name: 'Miljöbalken' },
    { regex: /Forest Act/gi, name: 'Skogsvårdslagen' },
  ];

  for (const { regex, name } of patterns) {
    if (regex.test(thinking)) {
      lawMatches.push(name);
    }
  }

  // Find SFS numbers
  const sfsNumbers = thinking.match(/\d{4}:\d+/g) || [];
  const uniqueSfs = [...new Set(sfsNumbers)].slice(0, 3);

  // Build answer
  const uniqueLaws = [...new Set(lawMatches)];

  if (uniqueLaws.length > 0 || uniqueSfs.length > 0) {
    let answer = 'Allemansrätten regleras huvudsakligen av ';

    if (uniqueLaws.length > 0) {
      answer += uniqueLaws.join(', ');
    }

    if (uniqueSfs.length > 0) {
      if (uniqueLaws.length > 0) {
        answer += ` (SFS ${uniqueSfs.join(', ')})`;
      } else {
        answer += `SFS ${uniqueSfs.join(', SFS ')}`;
      }
    }

    answer += '.';
    return answer;
  }

  // Fallback: return summary from thinking
  return 'Allemansrätten regleras av Miljöbalken och Naturvårdsverkets föreskrifter.';
}

// REMOVED: extractSwedishAnswer - Never parse reasoning_content for user display
// Use runAgentFinalizer() instead for content-empty recovery

// ═══════════════════════════════════════════════════════════════════════════
// HALLUCINATION JAIL WARDEN - Native TypeScript implementation
// ═══════════════════════════════════════════════════════════════════════════
// Verifierar GPT-OSS svar mot ChromaDB för att fånga hallucinationer.
// 1. Extraherar claims med GPT-OSS
// 2. Verifierar varje claim mot ChromaDB (535K dokument)
// 3. Om hallucination → regenererar med GPT-OSS
// ═══════════════════════════════════════════════════════════════════════════

const CHROMADB_SEARCH_URL = 'http://localhost:8000/api/constitutional/search';
const SIMILARITY_THRESHOLD = 0.65;  // Minimum score för att verifiera claim

interface JailWardenResponse {
  status: 'VERIFIED' | 'REGENERATED' | 'ERROR';
  answer: string;
  verified_claims?: number;
  hallucinations?: number;
  original_hallucinations?: string[];
  regeneration_reason?: string;
}

async function extractClaims(answer: string): Promise<string[]> {
  const maxRetries = 2;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Use JSON_PROFILE from swedish-prompt-profiles.ts
      const response = await fetch(`${LLAMA_SERVER_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ANSWER_MODEL,
          messages: [
            {
              role: 'system',
              content: JSON_PROFILE.systemPrompt
            },
            {
              role: 'user',
              content: `TEXT ATT ANALYSERA:\n${answer}`
            }
          ],
          temperature: JSON_PROFILE.temperature,
          max_tokens: JSON_PROFILE.max_tokens,
          response_format: { type: "json_object" }  // Primary enforcement
        }),
      });

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '{}';

      // Parse JSON - handle multiple formats
      let parsed: any;
      
      try {
        parsed = JSON.parse(content);
      } catch {
        // Try extracting JSON from text
        const match = content.match(/\{[\s\S]*?\}|\[[\s\S]*?\]/);
        if (match) {
          parsed = JSON.parse(match[0]);
        } else {
          throw new Error('No valid JSON found in response');
        }
      }
      
      // Extract claims array from various formats
      let claims: string[] = [];
      
      if (Array.isArray(parsed)) {
        // Format: ["claim1", "claim2"]
        claims = parsed;
      } else if (parsed.claims && Array.isArray(parsed.claims)) {
        // Format: {"claims": ["claim1", "claim2"]} (JSON_PROFILE format)
        claims = parsed.claims;
      } else if (typeof parsed === 'object') {
        // Format: {"påstående 1": "...", "påstående 2": "..."}
        claims = Object.values(parsed).filter(v => typeof v === 'string');
      }
      
      const filtered = claims.filter((c: string) => c && c.length > 10);
      
      if (attempt > 0) {
        logMetric('json_parse_retry_success', { 
          function: 'extractClaims', 
          attempt: attempt + 1,
          claims_count: filtered.length 
        });
      }
      
      return filtered;
      
    } catch (error) {
      if (attempt < maxRetries) {
        logMetric('json_parse_retry', { 
          function: 'extractClaims', 
          attempt: attempt + 1,
          error: String(error)
        });
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        continue;
      } else {
        logMetric('json_parse_failed', { 
          function: 'extractClaims',
          total_attempts: attempt + 1,
          error: String(error)
        });
        return [];
      }
    }
  }
  
  return [];
}

async function verifyClaim(claim: string): Promise<{ verified: boolean; score: number }> {
  try {
    const response = await fetch(CHROMADB_SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: claim, limit: 3, page: 1, sort: 'relevance' }),
    });

    if (!response.ok) return { verified: false, score: 0 };

    const data = await response.json();
    const bestScore = data.results?.[0]?.score || 0;

    return { verified: bestScore >= SIMILARITY_THRESHOLD, score: bestScore };
  } catch {
    return { verified: false, score: 0 };
  }
}

async function regenerateAnswer(question: string, hallucinations: string[]): Promise<string> {
  try {
    // Use llama-server /v1/chat/completions
    const response = await fetch(`${LLAMA_SERVER_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ANSWER_MODEL,
        messages: [
          {
            role: 'system',
            content: 'Du är en juridisk expert. Skriv ENDAST information du är säker på. Om du inte vet, säg det.'
          },
          {
            role: 'user',
            content: `Användaren frågade: ${question}

Ditt tidigare svar innehöll FELAKTIGA påståenden som inte kunde verifieras:
${hallucinations.map(h => `- ${h}`).join('\n')}

Skriv ett NYTT svar som ENDAST innehåller korrekt information. Svara på svenska.`
          }
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'Kunde inte generera nytt svar.';
  } catch {
    return 'Fel vid regenerering.';
  }
}

async function verifyWithJailWarden(
  question: string,
  answer: string
): Promise<JailWardenResponse> {
  if (!JAIL_WARDEN_ENABLED) {
    return { status: 'VERIFIED', answer };
  }

  console.log('\n🚨 JAIL WARDEN - Verifierar svar mot ChromaDB...');

  try {
    // 1. Extract claims
    const claims = await extractClaims(answer);
    console.log(`   📋 ${claims.length} påståenden extraherade`);

    if (claims.length === 0) {
      console.log(`   ✅ Inga verifierbara claims - godkänt`);
      return { status: 'VERIFIED', answer, verified_claims: 0 };
    }

    // 2. Verify each claim against ChromaDB
    const hallucinations: string[] = [];
    let verifiedCount = 0;

    for (const claim of claims) {
      const result = await verifyClaim(claim);
      if (result.verified) {
        verifiedCount++;
        console.log(`   ✅ "${claim.substring(0, 40)}..." (${(result.score * 100).toFixed(0)}%)`);
      } else {
        hallucinations.push(claim);
        console.log(`   ❌ "${claim.substring(0, 40)}..." (${(result.score * 100).toFixed(0)}%)`);
      }
    }

    // 3. If hallucinations found, regenerate
    if (hallucinations.length > 0) {
      console.log(`\n🔄 ${hallucinations.length} hallucinationer! Regenererar...`);
      const newAnswer = await regenerateAnswer(question, hallucinations);

      return {
        status: 'REGENERATED',
        answer: newAnswer,
        verified_claims: verifiedCount,
        hallucinations: hallucinations.length,
        original_hallucinations: hallucinations,
        regeneration_reason: 'Overifierade påståenden upptäcktes',
      };
    }

    console.log(`   ✅ VERIFIED - Alla ${verifiedCount} påståenden bekräftade!`);
    return { status: 'VERIFIED', answer, verified_claims: verifiedCount };

  } catch (error) {
    console.log(`⚠️ Jail Warden-fel: ${error}`);
    return { status: 'ERROR', answer };
  }
}

function calculateConfidence(steps: AgentStep[], totalDocs: number): number {
  if (steps.length === 0) return 0.3;

  let confidence = 0.5;

  // More docs = higher confidence
  if (totalDocs >= 10) confidence += 0.25;
  else if (totalDocs >= 5) confidence += 0.15;
  else if (totalDocs >= 1) confidence += 0.05;

  // Successful steps boost confidence
  const successRate = steps.filter(s => s.observation.success).length / steps.length;
  confidence += successRate * 0.2;

  return Math.min(confidence, 0.95);
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST
// ═══════════════════════════════════════════════════════════════════════════

export async function testAgent() {
  const result = await runAgent('Vilka lagar reglerar allemansrätten i Sverige?');
  console.log('\n📊 RESULTAT:', JSON.stringify({
    confidence: result.confidence,
    iterations: result.iterations,
    sources: result.sources.length,
    time: result.total_time_ms,
    jail_warden: result.jail_warden_status,
  }, null, 2));
}
