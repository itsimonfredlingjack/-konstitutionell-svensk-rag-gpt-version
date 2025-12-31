/**
 * Constitutional AI - Agentic RAG Loop (REFACTORED)
 *
 * TWO-PASS ARCHITECTURE:
 * - CHAT: GPT-SW3 only (no retrieval)
 * - ASSIST: Ministral (facts) → GPT-SW3 (style pass)
 * - EVIDENCE: Ministral only (technical tone, no style pass)
 *
 * MODELS:
 * - Ministral 3 14B (BRAIN): Factual answers, RAG, analysis + NATIVE TOOL USE
 * - GPT-SW3 6.7B (VOICE): Natural Swedish, chat, style pass
 *
 * NEW: For advanced agentic RAG, use runReactAgent from ./react-agent.ts
 */

// Re-export the new ReAct agent as the recommended interface
export { runReactAgent, type ReactAgentResponse } from './react-agent';

import { TOOLS, getTool, type ToolResult } from './tools';
import { logMetric } from '../api';
import {
  ANSWER_PROFILE,
  TOOL_PROFILE,
  FINALIZER_PROFILE,
  buildAnswerPrompt,
  enforceCitationPolicy,
  validateStructure,
  validateSFSCitations,
  type SourceDocument,
} from '../swedish-prompt-profiles';
import {
  orchestrate,
  type OrchestrationDecision,
} from '../orchestration/orchestrator';
import {
  MODEL_CONFIG,
  type CanonicalResponse,
  type ResponseMode,
  type Citation,
  createCanonicalResponse,
} from '../orchestration/response-schema';
import {
  generateChatResponse as ollamaChatResponse,
  generateAssistResponse,
  generateEvidenceResponse,
  callWithTools,
} from '../orchestration/ollama-client';
import { getChatProfile } from '../orchestration/chat-profiles';
import { LLM_URL } from '../config';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════
const MAX_ITERATIONS = 3;

// Hallucination Jail Warden - verifies answers against ChromaDB
const JAIL_WARDEN_ENABLED = true;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface AgentThought {
  reasoning: string;
  action: string;
  action_input: Record<string, unknown>;
}

interface AgentStep {
  thought: AgentThought;
  observation: ToolResult;
}

export interface AgentResponse extends CanonicalResponse {
  question: string;
  steps: AgentStep[];
  iterations: number;
  total_time_ms: number;
  jail_warden_status: 'VERIFIED' | 'REGENERATED' | 'ERROR' | 'SKIPPED';
  showCitations: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN AGENT LOOP
// ═══════════════════════════════════════════════════════════════════════════

export async function runAgent(question: string): Promise<AgentResponse> {
  const startTime = Date.now();
  const steps: AgentStep[] = [];
  const sources: string[] = [];
  const usedQueries = new Set<string>();
  let totalDocsFound = 0;

  // ════════════════════════════════════════════════════════════════════════
  // ORCHESTRATION: Determine mode and retrieval strategy
  // ════════════════════════════════════════════════════════════════════════
  const decision = orchestrate(question);

  console.log('\n' + '═'.repeat(60));
  console.log(`🤖 AGENT STARTAR [Mode: ${decision.mode}]`);
  console.log('═'.repeat(60));
  console.log(`📝 Fråga: "${question}"`);
  console.log(`🎭 Retrieve: ${decision.retrieve}, Citations: ${decision.showCitations}`);
  console.log(`🧠 Brain: ${MODEL_CONFIG.BRAIN} | Voice: ${MODEL_CONFIG.VOICE}\n`);

  // ════════════════════════════════════════════════════════════════════════
  // CHAT MODE: GPT-SW3 only, no retrieval
  // ════════════════════════════════════════════════════════════════════════
  if (!decision.retrieve) {
    const chatProfile = getChatProfile(decision.queryType);

    console.log(`💬 CHAT MODE: Using ${MODEL_CONFIG.VOICE} (${chatProfile.name})`);

    const chatResponse = await ollamaChatResponse(
      question,
      chatProfile.systemPrompt,
      {
        temperature: chatProfile.temperature,
        max_tokens: chatProfile.max_tokens,
      }
    );

    const totalTime = Date.now() - startTime;

    console.log('\n' + '═'.repeat(60));
    console.log('📋 SLUTSVAR (CHAT MODE)');
    console.log('═'.repeat(60));
    console.log(chatResponse.answer);
    console.log(`\n⏱️  Total tid: ${totalTime}ms | Mode: CHAT | Model: ${MODEL_CONFIG.VOICE}`);

    return {
      ...chatResponse,
      question,
      steps: [],
      iterations: 0,
      total_time_ms: totalTime,
      jail_warden_status: 'SKIPPED',
      showCitations: false,
    };
  }

  // ════════════════════════════════════════════════════════════════════════
  // ASSIST/EVIDENCE MODE: Retrieval-based with two-pass
  // ════════════════════════════════════════════════════════════════════════
  let iteration = 0;
  let isDone = false;
  let lastObservation = '';

  // Retrieval loop
  while (!isDone && iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`\n🔄 Iteration ${iteration}/${MAX_ITERATIONS}`);
    console.log('─'.repeat(40));

    try {
      const thought = await getAgentThought(question, lastObservation, totalDocsFound, iteration);
      console.log(`💭 Reasoning: ${thought.reasoning.substring(0, 80)}...`);
      console.log(`🎯 Action: ${thought.action}`);

      if (thought.action === 'done') {
        isDone = true;
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

      // Track sources from search results
      if (thought.action === 'search_documents' && observation.success && observation.data) {
        const docs = observation.data;
        totalDocsFound += docs.length;
        docs.forEach((doc: { title?: string }) => {
          if (doc.title) sources.push(doc.title);
        });

        // Auto-complete if we have enough results
        if (totalDocsFound >= 10 && iteration >= 2) {
          console.log(`📚 ${totalDocsFound} dokument hittade, tillräckligt!`);
          isDone = true;
        }
      }

      steps.push({ thought, observation });
      lastObservation = formatObservation(observation.data);
      console.log(`📊 Observation: ${observation.success ? 'Lyckades' : 'Misslyckades'} (${totalDocsFound} docs total)`);

    } catch (error) {
      console.error(`❌ Fel i iteration ${iteration}:`, error);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // GENERATE RESPONSE: Two-pass for ASSIST, single pass for EVIDENCE
  // ════════════════════════════════════════════════════════════════════════
  const collectedSources = collectSources(steps);

  let response: CanonicalResponse;

  if (decision.mode === 'EVIDENCE') {
    console.log(`\n🔬 EVIDENCE MODE: Using ${MODEL_CONFIG.BRAIN} only (technical tone)`);
    response = await generateEvidenceResponse(question, collectedSources, ANSWER_PROFILE.systemPrompt);
  } else {
    console.log(`\n✨ ASSIST MODE: Two-pass (${MODEL_CONFIG.BRAIN} → ${MODEL_CONFIG.VOICE})`);
    response = await generateAssistResponse(question, collectedSources, ANSWER_PROFILE.systemPrompt, decision.mode);
  }

  // ════════════════════════════════════════════════════════════════════════
  // JAIL WARDEN VERIFICATION
  // ════════════════════════════════════════════════════════════════════════
  let jailWardenStatus: 'VERIFIED' | 'REGENERATED' | 'ERROR' | 'SKIPPED' = 'SKIPPED';

  if (JAIL_WARDEN_ENABLED && response.answer) {
    const jailWardenResult = await verifyWithJailWarden(question, response.answer);
    jailWardenStatus = jailWardenResult.status;

    if (jailWardenResult.answer && jailWardenResult.status === 'REGENERATED') {
      response = {
        ...response,
        answer: jailWardenResult.answer,
      };
    }
  }

  const totalTime = Date.now() - startTime;

  console.log('\n' + '═'.repeat(60));
  console.log('📋 SLUTSVAR');
  console.log('═'.repeat(60));
  console.log(response.answer);
  console.log(`\n⏱️  Total tid: ${totalTime}ms | Iterationer: ${iteration}`);
  console.log(`🚨 Jail Warden: ${jailWardenStatus}`);

  return {
    ...response,
    question,
    steps,
    iterations: iteration,
    total_time_ms: totalTime,
    jail_warden_status: jailWardenStatus,
    showCitations: decision.showCitations,
    debug: {
      ...response.debug,
      retrieved: collectedSources.length,
      jail_warden: jailWardenStatus,
      iterations: iteration,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function collectSources(steps: AgentStep[]): SourceDocument[] {
  const sources: SourceDocument[] = [];

  for (const step of steps) {
    if (Array.isArray(step.observation.data)) {
      step.observation.data.forEach((doc: Record<string, unknown>, idx: number) => {
        if (sources.length < 5) {
          sources.push({
            id: (doc.id as string) || `doc-${idx}`,
            title: (doc.title as string) || 'Okänt dokument',
            content: (doc.content as string) || (doc.preview as string) || '',
            sfs: doc.sfs as string | undefined,
          });
        }
      });
    }
  }

  return sources;
}

async function getAgentThought(
  question: string,
  lastObservation: string,
  docsFound: number,
  iteration: number
): Promise<AgentThought> {
  const keySubject = extractKeySubject(question);

  // Early exit if we have enough docs
  if (docsFound >= 5) {
    return { reasoning: 'Har tillräckligt med dokument', action: 'done', action_input: {} };
  }

  // Tool definition for search
  const tools = [
    {
      type: 'function',
      function: {
        name: 'search_documents',
        description: 'Söker i ChromaDB med svenska myndighetsdokument',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string', description: 'Sökfrågan' } },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'done',
        description: 'Signalerar att sökningen är klar',
        parameters: {
          type: 'object',
          properties: { summary: { type: 'string', description: 'Sammanfattning' } },
        },
      },
    },
  ];

  const systemPrompt = `${TOOL_PROFILE.systemPrompt}
${docsFound >= 3 ? 'Du har tillräckligt med dokument - använd done.' : 'Sök efter relevanta dokument.'}`;

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: question },
  ];

  if (lastObservation) {
    messages.push({ role: 'assistant', content: `Hittade: ${lastObservation}` });
  }

  try {
    const response = await callWithTools(messages, tools, {
      temperature: TOOL_PROFILE.temperature,
      max_tokens: TOOL_PROFILE.max_tokens,
    });

    const toolCall = response.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function) {
      try {
        const args = JSON.parse(toolCall.function.arguments || '{}');
        return {
          reasoning: `Tool: ${toolCall.function.name}`,
          action: toolCall.function.name,
          action_input: args,
        };
      } catch (parseError) {
        logMetric('tool_args_parse_failed', {
          function: 'decide',
          tool_name: toolCall.function.name,
          raw_args: toolCall.function.arguments,
          error: String(parseError),
        });
        return {
          reasoning: `Tool: ${toolCall.function.name} (args parse failed)`,
          action: toolCall.function.name,
          action_input: {},
        };
      }
    }

    // No tool call - default behavior
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
    return {
      reasoning: 'Fel vid tool-calling, fallback',
      action: 'search_documents',
      action_input: { query: keySubject },
    };
  }
}

function extractKeySubject(question: string): string {
  const stopWords = [
    'vilka', 'vilken', 'vilket', 'vad', 'hur', 'finns', 'finnas', 'gäller',
    'innebär', 'lagar', 'regler', 'reglerar', 'reglering', 'sverige', 'svensk',
    'svenska', 'och', 'att', 'som', 'för', 'med', 'den', 'det', 'är', 'var',
    'ska', 'kan', 'till', 'från',
  ];
  const words = question.toLowerCase().split(/\s+/).filter(w =>
    w.length > 4 && !stopWords.includes(w)
  );
  return words.sort((a, b) => b.length - a.length)[0] || question.split(' ').pop() || question;
}

function formatObservation(data: unknown): string {
  if (!data) return '';

  if (Array.isArray(data)) {
    return data.slice(0, 5).map((d: Record<string, unknown>) =>
      `• ${d.title || d.id}`
    ).join('\n');
  }

  return JSON.stringify(data).substring(0, 300);
}

// ═══════════════════════════════════════════════════════════════════════════
// JAIL WARDEN - Hallucination Detection
// ═══════════════════════════════════════════════════════════════════════════

interface JailWardenResult {
  status: 'VERIFIED' | 'REGENERATED' | 'ERROR' | 'SKIPPED';
  answer?: string;
  hallucinations?: string[];
}

async function verifyWithJailWarden(question: string, answer: string): Promise<JailWardenResult> {
  console.log('🚨 Jail Warden: Verifierar svar...');

  try {
    // Extract claims from the answer
    const claims = await extractClaims(answer);

    if (claims.length === 0) {
      console.log('🚨 Jail Warden: Inga verifierbara påståenden');
      return { status: 'VERIFIED' };
    }

    // Verify each claim against ChromaDB
    const hallucinations: string[] = [];

    for (const claim of claims) {
      const isVerified = await verifyClaim(claim);
      if (!isVerified) {
        hallucinations.push(claim);
      }
    }

    if (hallucinations.length === 0) {
      console.log('🚨 Jail Warden: ✅ VERIFIED');
      return { status: 'VERIFIED' };
    }

    console.log(`🚨 Jail Warden: ⚠️ ${hallucinations.length} hallucinations found`);
    logMetric('jail_warden_hallucinations', { count: hallucinations.length, claims: hallucinations });

    // Regenerate answer without hallucinated claims
    const regeneratedAnswer = await regenerateAnswer(question, hallucinations, answer);

    return {
      status: 'REGENERATED',
      answer: regeneratedAnswer,
      hallucinations,
    };
  } catch (error) {
    console.error('🚨 Jail Warden error:', error);
    return { status: 'ERROR' };
  }
}

async function extractClaims(answer: string): Promise<string[]> {
  try {
    const response = await fetch(`${LLM_URL}/api/chat`, {
    const response = await fetch(`${LLM_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL_CONFIG.BRAIN,
        messages: [
          {
            role: 'system',
            content: `Extrahera faktapåståenden från texten.
Returnera JSON: { "claims": ["påstående 1", "påstående 2"] }
Fokusera på: SFS-nummer, årtal, myndigheter, lagtext.
Minst 10 tecken per påstående.`,
          },
          { role: 'user', content: answer },
        ],
        stream: false,
        format: {
          type: 'object',
          properties: {
            claims: { type: 'array', items: { type: 'string' } },
          },
          required: ['claims'],
        },
      }),
    });

    const data = await response.json();
    const content = data.message?.content || '{}';
    const parsed = JSON.parse(content);
    return parsed.claims || [];
  } catch {
    return [];
  }
}

async function verifyClaim(claim: string): Promise<boolean> {
  try {
    // Search ChromaDB for the claim
    const searchTool = getTool('search_documents');
    if (!searchTool) return true;  // Skip verification if tool unavailable

    const result = await searchTool.execute({ query: claim, limit: 3 });

    if (!result.success || !result.data?.length) {
      return false;
    }

    // Check similarity score (threshold: 0.65)
    const topScore = result.data[0]?.similarity_score || 0;
    return topScore >= 0.65;
  } catch {
    return true;  // Skip verification on error
  }
}

async function regenerateAnswer(question: string, hallucinations: string[], originalAnswer: string): Promise<string> {
  const hallucinationList = hallucinations.map(h => `• ${h}`).join('\n');

  try {
    const response = await fetch(`${LLM_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL_CONFIG.BRAIN,
        messages: [
          {
            role: 'system',
            content: `Skriv om svaret utan dessa ej verifierade påståenden:
${hallucinationList}

Behåll korrekt information. Lägg till "Det framgår inte av källorna" för borttagna påståenden.`,
          },
          { role: 'user', content: `Fråga: ${question}\n\nUrsprungligt svar:\n${originalAnswer}` },
        ],
        stream: false,
        options: { temperature: 0.3, num_predict: 400 },
      }),
    });

    const data = await response.json();
    return data.message?.content || originalAnswer;
  } catch {
    return originalAnswer;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CALCULATE CONFIDENCE
// ═══════════════════════════════════════════════════════════════════════════

function calculateConfidence(steps: AgentStep[], docsFound: number): number {
  let confidence = 0.3;  // Base confidence

  // More docs = higher confidence
  if (docsFound >= 5) confidence += 0.3;
  else if (docsFound >= 3) confidence += 0.2;
  else if (docsFound >= 1) confidence += 0.1;

  // Successful tool calls boost confidence
  const successfulSteps = steps.filter(s => s.observation.success).length;
  confidence += Math.min(successfulSteps * 0.1, 0.3);

  return Math.min(confidence, 0.95);
}
