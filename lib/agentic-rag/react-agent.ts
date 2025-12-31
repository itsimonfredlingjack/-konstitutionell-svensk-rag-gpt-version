/**
 * ReAct Agent - Reasoning + Acting with Ministral 3 14B
 *
 * This is the MAIN agent loop for Constitutional-GPT.
 * Uses Ministral's NATIVE function calling (not prompt engineering!)
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                     USER QUERY                                   │
 * └────────────────────────┬────────────────────────────────────────┘
 *                          ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │              🔄 REACT LOOP (Max 5 iterations)                   │
 * │  ┌──────────────────────────────────────────────────────────┐   │
 * │  │ 💭 THINK → 🔧 ACT → 👁️ OBSERVE → REPEAT                  │   │
 * │  └──────────────────────────────────────────────────────────┘   │
 * └────────────────────────┬────────────────────────────────────────┘
 *                          ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                   STYLE PASS (GPT-SW3)                          │
 * └────────────────────────┬────────────────────────────────────────┘
 *                          ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                   FINAL RESPONSE                                 │
 * └─────────────────────────────────────────────────────────────────┘
 */

import {
  AGENT_TOOLS,
  REACT_SYSTEM_PROMPT,
  executeTool,
  parseToolCalls,
  formatToolResult,
  type AgentStep,
} from './agent-tools';
import { applyStylePass, shouldApplyStylePass } from '../orchestration/style-pass';
import { orchestrate } from '../orchestration/orchestrator';
import { MODEL_CONFIG, type CanonicalResponse, type Citation } from '../orchestration/response-schema';
import { logMetric } from '../api';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

// Safety limits
const MAX_ITERATIONS = 5;
const MAX_TOOL_CALLS_PER_ITERATION = 3;
const ITERATION_TIMEOUT_MS = 30000;
const TOTAL_TIMEOUT_MS = 120000;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ReactAgentResponse extends CanonicalResponse {
  question: string;
  steps: AgentStep[];
  iterations: number;
  total_time_ms: number;
  documents_found: number;
  tools_used: string[];
  final_confidence: number;
}

interface CollectedSource {
  id: string;
  title: string;
  content: string;
  score: number;
  sfs?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN REACT AGENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run the ReAct agent on a user question
 *
 * @param question - The user's question
 * @returns Complete response with answer, citations, and debug info
 */
export async function runReactAgent(question: string): Promise<ReactAgentResponse> {
  const startTime = Date.now();
  const steps: AgentStep[] = [];
  const collectedSources: CollectedSource[] = [];
  const toolsUsed = new Set<string>();

  console.log('\n' + '═'.repeat(70));
  console.log('🤖 REACT AGENT STARTAR');
  console.log('═'.repeat(70));
  console.log(`📝 Fråga: "${question}"`);
  console.log(`🧠 Model: ${MODEL_CONFIG.BRAIN} (native function calling)`);
  console.log(`⚙️  Max iterations: ${MAX_ITERATIONS}\n`);

  // ════════════════════════════════════════════════════════════════════════
  // ORCHESTRATION: Check if we need RAG at all
  // ════════════════════════════════════════════════════════════════════════
  const decision = orchestrate(question);

  if (!decision.retrieve) {
    // CHAT mode - no RAG needed
    console.log('💬 CHAT MODE: Skipping ReAct loop');
    const chatResponse = await generateChatResponse(question);
    return {
      ...chatResponse,
      question,
      steps: [],
      iterations: 0,
      total_time_ms: Date.now() - startTime,
      documents_found: 0,
      tools_used: [],
      final_confidence: 0.8,
    };
  }

  console.log(`🎯 Mode: ${decision.mode} | Retrieve: ${decision.retrieve}`);

  // ════════════════════════════════════════════════════════════════════════
  // REACT LOOP
  // ════════════════════════════════════════════════════════════════════════
  const messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string; tool_call_id?: string }> = [
    { role: 'system', content: REACT_SYSTEM_PROMPT },
    { role: 'user', content: question },
  ];

  let iteration = 0;
  let isDone = false;
  let finalAnswer = '';
  let finalConfidence = 0.5;

  while (!isDone && iteration < MAX_ITERATIONS) {
    iteration++;
    const iterationStart = Date.now();

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`🔄 ITERATION ${iteration}/${MAX_ITERATIONS}`);
    console.log('─'.repeat(50));

    try {
      // ─────────────────────────────────────────────────────────────────────
      // CALL MINISTRAL WITH TOOLS
      // ─────────────────────────────────────────────────────────────────────
      const response = await callMinistralWithTools(messages);

      if (!response.ok) {
        console.error(`❌ Ollama error: ${response.status}`);
        break;
      }

      const data = await response.json();
      const message = data.message;

      // Check for tool calls
      const toolCalls = parseToolCalls(message);

      if (toolCalls.length === 0) {
        // No tool calls - model wants to respond directly
        console.log('📝 Model responding without tools');
        if (message.content) {
          finalAnswer = message.content;
          finalConfidence = 0.6; // Lower confidence without tool use
        }
        isDone = true;
        break;
      }

      // ─────────────────────────────────────────────────────────────────────
      // EXECUTE TOOL CALLS
      // ─────────────────────────────────────────────────────────────────────
      console.log(`🔧 ${toolCalls.length} tool call(s):`);

      // Limit tool calls per iteration
      const limitedCalls = toolCalls.slice(0, MAX_TOOL_CALLS_PER_ITERATION);

      for (const call of limitedCalls) {
        console.log(`   → ${call.toolName}(${JSON.stringify(call.args).substring(0, 60)}...)`);
        toolsUsed.add(call.toolName);

        // Execute the tool
        const result = await executeTool(call.toolName, call.args);

        // Record the step
        steps.push({
          iteration,
          thought: `Tool: ${call.toolName}`,
          tool: call.toolName,
          toolInput: call.args,
          observation: result,
          timestamp: Date.now(),
        });

        // Collect sources from search results
        if (result.success && Array.isArray(result.data)) {
          result.data.forEach((doc: Record<string, unknown>) => {
            if (collectedSources.length < 10) {
              collectedSources.push({
                id: String(doc.id || `doc-${collectedSources.length}`),
                title: String(doc.title || 'Untitled'),
                content: String(doc.content || doc.preview || ''),
                score: Number(doc.score) || 0,
                sfs: doc.sfs as string | undefined,
              });
            }
          });
        }

        // Check for final_answer
        if (call.toolName === 'final_answer' && result.success && result.data?.done) {
          finalAnswer = String(result.data.answer || '');
          finalConfidence = Number(result.data.confidence) || 0.7;
          isDone = true;
          console.log(`✅ Final answer received (confidence: ${finalConfidence.toFixed(2)})`);
          break;
        }

        // Check for clarification needed
        if (call.toolName === 'clarify_question' && result.success && result.data?.needs_clarification) {
          finalAnswer = `Jag behöver en förtydligande: ${result.data.question}\n\nAnledning: ${result.data.reason}`;
          finalConfidence = 0.3;
          isDone = true;
          break;
        }

        // Add tool result to message history
        const formattedResult = formatToolResult(call.toolName, result);
        messages.push({
          role: 'tool',
          content: formattedResult,
          tool_call_id: `call_${iteration}_${call.toolName}`,
        });
      }

      // ─────────────────────────────────────────────────────────────────────
      // ITERATION TIMEOUT CHECK
      // ─────────────────────────────────────────────────────────────────────
      const iterationTime = Date.now() - iterationStart;
      if (iterationTime > ITERATION_TIMEOUT_MS) {
        console.warn(`⚠️ Iteration timeout (${iterationTime}ms)`);
      }

      // Total timeout check
      if (Date.now() - startTime > TOTAL_TIMEOUT_MS) {
        console.warn('⚠️ Total timeout reached, forcing completion');
        isDone = true;
      }

      // Auto-complete if we have enough sources
      if (collectedSources.length >= 8 && iteration >= 2 && !isDone) {
        console.log(`📚 ${collectedSources.length} sources collected, synthesizing answer`);
        // Force final_answer on next iteration by adding a nudge
        messages.push({
          role: 'user',
          content: 'Du har samlat tillräckligt med information. Använd nu final_answer för att ge ditt svar.',
        });
      }

    } catch (error) {
      console.error(`❌ Iteration ${iteration} error:`, error);
      logMetric('react_iteration_error', { iteration, error: String(error) });
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // FALLBACK: Generate answer if no final_answer was called
  // ════════════════════════════════════════════════════════════════════════
  if (!finalAnswer && collectedSources.length > 0) {
    console.log('\n⚠️ No final_answer called, generating from collected sources...');
    finalAnswer = await synthesizeAnswer(question, collectedSources);
    finalConfidence = 0.6;
  }

  if (!finalAnswer) {
    finalAnswer = 'Kunde inte hitta tillräckligt med information för att besvara frågan.';
    finalConfidence = 0.2;
  }

  // ════════════════════════════════════════════════════════════════════════
  // STYLE PASS (ASSIST mode only)
  // ════════════════════════════════════════════════════════════════════════
  if (shouldApplyStylePass(decision.mode)) {
    console.log('\n✨ Applying style pass (GPT-SW3)...');
    finalAnswer = await applyStylePass(finalAnswer, 'conversational');
  }

  // ════════════════════════════════════════════════════════════════════════
  // BUILD RESPONSE
  // ════════════════════════════════════════════════════════════════════════
  const totalTime = Date.now() - startTime;

  console.log('\n' + '═'.repeat(70));
  console.log('📋 REACT AGENT KLAR');
  console.log('═'.repeat(70));
  console.log(`✅ Iterations: ${iteration}`);
  console.log(`📚 Documents found: ${collectedSources.length}`);
  console.log(`🔧 Tools used: ${Array.from(toolsUsed).join(', ')}`);
  console.log(`⏱️  Total time: ${totalTime}ms`);
  console.log(`📊 Confidence: ${finalConfidence.toFixed(2)}`);

  // Build citations from collected sources
  const citations: Citation[] = collectedSources.slice(0, 5).map((source, idx) => ({
    id: `[${idx + 1}]`,
    title: source.title,
    quote: source.content.substring(0, 200),
    sfs: source.sfs,
    collection: 'chromadb',
  }));

  return {
    answer: finalAnswer,
    followups: generateFollowups(question, collectedSources),
    mode: decision.mode,
    citations: decision.showCitations ? citations : undefined,
    confidence: finalConfidence,
    debug: {
      retrieved: collectedSources.length,
      iterations: iteration,
      time_ms: totalTime,
      model: MODEL_CONFIG.BRAIN,
    },
    question,
    steps,
    iterations: iteration,
    total_time_ms: totalTime,
    documents_found: collectedSources.length,
    tools_used: Array.from(toolsUsed),
    final_confidence: finalConfidence,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Call Ministral with native tool support
 */
async function callMinistralWithTools(
  messages: Array<{ role: string; content: string; tool_call_id?: string }>
): Promise<Response> {
  return fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL_CONFIG.BRAIN,
      messages,
      tools: AGENT_TOOLS,
      stream: false,
      options: {
        temperature: 0.3,
        num_predict: 1000,
        top_p: 0.9,
      },
    }),
  });
}

/**
 * Generate chat response without RAG
 */
async function generateChatResponse(question: string): Promise<CanonicalResponse> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL_CONFIG.VOICE,
        messages: [
          { role: 'system', content: 'Du är en vänlig svensk AI-assistent. Svara naturligt och hjälpsamt.' },
          { role: 'user', content: question },
        ],
        stream: false,
        options: { temperature: 0.7, num_predict: 500 },
      }),
    });

    const data = await response.json();
    const answer = data.message?.content || 'Kunde inte generera svar.';

    return {
      answer,
      followups: [],
      mode: 'CHAT',
      confidence: 0.8,
    };
  } catch (error) {
    console.error('Chat response error:', error);
    return {
      answer: 'Ett fel uppstod. Försök igen.',
      followups: [],
      mode: 'CHAT',
    };
  }
}

/**
 * Synthesize answer from collected sources
 */
async function synthesizeAnswer(question: string, sources: CollectedSource[]): Promise<string> {
  const context = sources
    .slice(0, 5)
    .map((s, i) => `[${i + 1}] ${s.title}\n${s.content.substring(0, 500)}`)
    .join('\n\n');

  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL_CONFIG.BRAIN,
        messages: [
          {
            role: 'system',
            content: `Besvara frågan baserat på dokumenten nedan.
Använd citat [1], [2], etc. för att hänvisa till källor.
Var koncis och faktabaserad. Svara på svenska.`,
          },
          {
            role: 'user',
            content: `DOKUMENT:\n${context}\n\nFRÅGA: ${question}`,
          },
        ],
        stream: false,
        options: { temperature: 0.2, num_predict: 600 },
      }),
    });

    const data = await response.json();
    return data.message?.content || '';
  } catch {
    return '';
  }
}

/**
 * Generate follow-up questions
 */
function generateFollowups(question: string, sources: CollectedSource[]): string[] {
  const followups: string[] = [];

  // Extract key topics from sources
  const topics = new Set<string>();
  sources.forEach(s => {
    if (s.sfs) topics.add(s.sfs);
    const match = s.title?.match(/(proposition|SOU|motion|betänkande)/i);
    if (match) topics.add(match[0].toLowerCase());
  });

  // Generate contextual follow-ups
  if (topics.has('proposition')) {
    followups.push('Vilka ändringar har gjorts sedan propositionen?');
  }
  if (topics.size > 0) {
    followups.push('Finns det några undantag från dessa regler?');
  }
  if (sources.length >= 3) {
    followups.push('Hur tillämpas detta i praktiken?');
  }

  return followups.slice(0, 3);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export { AGENT_TOOLS, REACT_SYSTEM_PROMPT } from './agent-tools';
