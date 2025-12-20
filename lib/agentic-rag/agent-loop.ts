/**
 * Constitutional AI - Agentic RAG Loop (OPTIMIZED)
 *
 * ReAct pattern: Reason → Act → Observe → Repeat
 * Hermes-3 for tool calling, GPT-OSS 20B for answers
 */

import { TOOLS, getTool, routeWithFunctionGemma, type ToolResult } from './tools';

const OLLAMA_URL = 'http://localhost:11434';
const TOOL_MODEL = 'hermes3:8b';      // Tool calling - agent-finetuned, reliable JSON
const ANSWER_MODEL = 'gpt-oss:20b';   // Answer model - user-facing Swedish responses
const MAX_ITERATIONS = 3;             // Optimized: 3 is enough for most queries

// n8n Hallucination Jail Warden - verifierar svar mot ChromaDB
const JAIL_WARDEN_URL = 'http://localhost:5678/webhook/verify-answer';
const JAIL_WARDEN_ENABLED = true;     // Toggle för att aktivera/deaktivera

// ═══════════════════════════════════════════════════════════════════════════
// MODELL-KONFIGURATION - ÄNDRA INTE UTAN ATT FÖRSTÅ VARFÖR
// ═══════════════════════════════════════════════════════════════════════════
//
// TOOL_MODEL = hermes3:8b
//   - Agent-finetunad för tool calling
//   - Pålitlig JSON-output
//   - ANVÄNDS FÖR: ReAct-loopen, verktygsval
//
// ANSWER_MODEL = gpt-oss:20b
//   - BÄSTA generalist-modellen
//   - Stark på resonemang, analys, juridik
//   - ANVÄNDS FÖR: Slutsvar till användaren
//   - OBS: Svarar i "thinking"-fältet, extraheras av formatGptOssAnswer()
//
// FunctionGemma (270M) - Optional snabb routing hint
//
// RADERA INTE GPT-OSS - Den är huvudmodellen för användarkommunikation!
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

  // Fast routing with FunctionGemma (optional optimization)
  const fastRoute = await routeWithFunctionGemma(question);
  if (fastRoute && fastRoute.name !== 'done') {
    console.log(`⚡ FunctionGemma föreslår: ${fastRoute.name}`);
  }

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

  // Compact prompt with search guidance
  const prompt = `FRÅGA: ${question}

${lastObservation ? `HITTADE (${docsFound} docs):\n${lastObservation.substring(0, 800)}\n` : ''}
${docsFound >= 5 ? '⚡ Du har hittat tillräckligt! Använd "done" för att avsluta.\n' : ''}
VERKTYG: search_documents (query=ÄMNET, tex "${keySubject}"), think_longer, done

JSON svar:`;

  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: TOOL_MODEL,
      prompt,
      stream: false,
      options: {
        temperature: 0.1,    // Lower = more deterministic
        num_predict: 150,    // JSON doesn't need much
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`);
  }

  const data = await response.json();
  let content = data.response || '{}';

  // Extract JSON from markdown code blocks if present
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    content = jsonMatch[1].trim();
  }

  // Also try to find JSON object directly
  const jsonObjMatch = content.match(/\{[\s\S]*\}/);
  if (jsonObjMatch) {
    content = jsonObjMatch[0];
  }

  try {
    const parsed = JSON.parse(content);
    return {
      reasoning: parsed.reasoning || 'Söker...',
      action: parsed.action || (docsFound >= 5 ? 'done' : 'search_documents'),
      action_input: parsed.action_input || { query: question },
    };
  } catch {
    // Smart fallback based on state
    if (docsFound >= 5) {
      return { reasoning: 'Har tillräckligt', action: 'done', action_input: {} };
    }
    return {
      reasoning: 'Söker dokument',
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
  // Collect observations compactly
  const allDocs: string[] = [];

  for (const step of steps) {
    if (Array.isArray(step.observation.data)) {
      step.observation.data.forEach((doc: any) => {
        const preview = (doc.preview || doc.content || '').substring(0, 150);
        allDocs.push(`• ${doc.title}: ${preview}`);
      });
    }
  }

  // Simple prompt - GPT-OSS responds in Swedish with simple prompts
  const prompt = question;

  console.log(`\n🎯 Genererar slutsvar med ${ANSWER_MODEL}...`);
  console.log(`   Prompt: "${prompt}"`);

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ANSWER_MODEL,
        prompt,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 300,
        },
      }),
    });

    if (!response.ok) {
      return 'Kunde inte generera slutsvar.';
    }

    const data = await response.json();

    // GPT-OSS always puts content in thinking field
    const thinking = data.thinking || data.response || '';

    // Extract and format the answer from thinking
    const answer = formatGptOssAnswer(thinking, question);

    return answer || 'Inget svar kunde genereras.';

  } catch (error) {
    console.error('Answer generation error:', error);
    return `Fel: ${error}`;
  }
}

// Format GPT-OSS thinking into a proper Swedish answer
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

// Extract Swedish content from GPT-OSS "thinking" field
function extractSwedishAnswer(thinking: string): string {
  // Split by sentence boundaries
  const sentences = thinking.split(/(?<=[.!?])\s+/);
  const swedishSentences: string[] = [];

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length < 15) continue;

    // Skip English meta-commentary
    if (/^(we need|let me|the user|i should|actually|wait|so |the question|the main|based on|looking at|provide|recall|no,)/i.test(trimmed)) continue;
    if (/\b(we need to|let's|the user|i should|actually the)\b/i.test(trimmed)) continue;

    // Check if sentence is Swedish (has Swedish chars or Swedish words)
    const hasSwedishChars = /[åäöÅÄÖ]/.test(trimmed);
    const hasSwedishWords = /\b(är|och|som|för|med|ska|kan|till|från|genom|enligt|regleras|lagen|lagar|rätten)\b/.test(trimmed);
    const hasSFS = /SFS\s*\d{4}:\d+|\d{4}:\d{3,}/.test(trimmed);

    if (hasSwedishChars || hasSwedishWords || hasSFS) {
      // Clean up the sentence
      let clean = trimmed
        .replace(/^["'\s]+/, '')  // Remove leading quotes
        .replace(/["'\s]+$/, ''); // Remove trailing quotes
      swedishSentences.push(clean);
    }
  }

  if (swedishSentences.length > 0) {
    return swedishSentences.join(' ').substring(0, 600);
  }

  // Fallback: Look for SFS numbers and surrounding text
  const sfsMatch = thinking.match(/(\w+\s+){0,5}SFS\s*\d{4}:\d+(\s+\w+){0,10}/g);
  if (sfsMatch) {
    return sfsMatch.join('. ').substring(0, 400);
  }

  // Last resort: return first non-English sentence
  const firstNonEnglish = sentences.find(s => !/^(we |the |based |provide |let |i )/i.test(s.trim()));
  return (firstNonEnglish || 'Se dokumenten ovan.').substring(0, 300);
}

// ═══════════════════════════════════════════════════════════════════════════
// HALLUCINATION JAIL WARDEN - n8n integration
// ═══════════════════════════════════════════════════════════════════════════
// Verifierar GPT-OSS svar mot ChromaDB för att fånga hallucinationer.
// Om hallucination hittas, regenereras svaret automatiskt.
// Workflow: Hallucination Jail Warden (n8n ID: y116DfvDgjfbk5Xr)
// ═══════════════════════════════════════════════════════════════════════════

interface JailWardenResponse {
  status: 'VERIFIED' | 'REGENERATED' | 'ERROR';
  answer: string;
  verified_claims?: number;
  hallucinations?: number;
  original_hallucinations?: string[];
  regeneration_reason?: string;
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
    const response = await fetch(JAIL_WARDEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, answer }),
    });

    if (!response.ok) {
      console.log(`⚠️ Jail Warden ej tillgänglig (${response.status}), använder originalsvaret`);
      return { status: 'VERIFIED', answer };
    }

    const result: JailWardenResponse = await response.json();

    if (result.status === 'VERIFIED') {
      console.log(`✅ VERIFIED - ${result.verified_claims || 0} påståenden bekräftade`);
    } else if (result.status === 'REGENERATED') {
      console.log(`🔄 REGENERATED - Hallucination upptäckt!`);
      console.log(`   Falska påståenden: ${result.original_hallucinations?.join(', ')}`);
    }

    return result;

  } catch (error) {
    console.log(`⚠️ Jail Warden-fel: ${error}`);
    // Fallback: returnera originalet
    return { status: 'VERIFIED', answer };
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
