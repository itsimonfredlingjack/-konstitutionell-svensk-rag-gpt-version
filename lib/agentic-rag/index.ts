/**
 * Agentic RAG System
 * Intelligent retrieval agent that dynamically decides search strategy
 *
 * NOW WITH NATIVE FUNCTION CALLING (Ministral 3 14B)
 */

import { runAgent as runLegacyAgent, formatAgentLog as formatLegacyLog, type AgentState } from './agent';
import { runNativeAgent, formatNativeAgentLog, type NativeAgentState } from './native-agent';
import { TOOLS } from './tools';
import { QueryAnalysis } from '../query-intelligence';

// Use native agent by default (Ministral 3 14B with function calling)
const USE_NATIVE_AGENT = process.env.USE_NATIVE_AGENT !== 'false';

/**
 * Run the appropriate agent based on configuration
 */
export async function runAgent(question: string): Promise<AgentState | NativeAgentState> {
  if (USE_NATIVE_AGENT) {
    return runNativeAgent(question);
  }
  return runLegacyAgent(question);
}

/**
 * Format agent log based on agent type
 */
export function formatAgentLog(state: AgentState | NativeAgentState): string {
  if ('toolCalls' in state) {
    return formatNativeAgentLog(state as NativeAgentState);
  }
  return formatLegacyLog(state as AgentState);
}

// Re-exports
export { runNativeAgent, formatNativeAgentLog };
export type { AgentState, NativeAgentState };
export { TOOLS };

/**
 * Determines if agentic mode should be used
 * Use for complex queries that benefit from multi-step reasoning
 */
export function shouldUseAgenticMode(analysis: QueryAnalysis): boolean {
  // Use agentic mode for complex questions:
  // 1. Legal queries with multiple entities
  // 2. Questions with many expanded terms
  // Skip for simple queries, smalltalk, or unknown abbreviations

  // Don't use agentic mode for non-retrieval queries
  if (!analysis.shouldRetrieve) return false;

  // Multiple entities suggest complexity
  const entityCount =
    analysis.entities.sfsNumbers.length +
    (analysis.entities.authorities?.length || 0) +
    analysis.entities.docTypes.length +
    (analysis.entities.lawNames?.length || 0);

  if (entityCount >= 3) return true;

  // Long questions with many expanded terms
  if (analysis.expandedTerms.length >= 5) return true;

  return false;
}

/**
 * Run agentic retrieval and return formatted results
 */
export async function runAgenticRetrieval(
  question: string,
  analysis: QueryAnalysis
): Promise<{
  documents: any[];
  agentState: AgentState | NativeAgentState;
  reasoning: string;
}> {
  console.log(`🤖 Starting ${USE_NATIVE_AGENT ? 'Native' : 'Legacy'} Agentic RAG for:`, question);

  const agentState = await runAgent(question);

  console.log(formatAgentLog(agentState));

  // Build reasoning summary
  const reasoning = buildReasoningSummary(agentState);

  return {
    documents: agentState.collectedDocuments,
    agentState,
    reasoning,
  };
}

/**
 * Build human-readable reasoning summary
 */
function buildReasoningSummary(state: AgentState | NativeAgentState): string {
  // Handle native agent state
  if ('toolCalls' in state) {
    const nativeState = state as NativeAgentState;
    if (nativeState.toolCalls.length === 0) {
      return 'Ingen sökning utförd.';
    }

    const toolSummary = nativeState.toolCalls.map((call, i) => {
      const obs = nativeState.observations[i];
      return `${i + 1}. ${call.name}: ${obs?.summary || 'utförd'}`;
    });

    return `Native Agent (Ministral 3 14B):\n${toolSummary.join('\n')}`;
  }

  // Legacy agent state
  const legacyState = state as AgentState;
  if (legacyState.actions.length === 0) {
    return 'Ingen sökning utförd.';
  }

  const steps = legacyState.thoughts.filter(t => t.length > 0);

  if (steps.length === 0) {
    return `Utförde ${legacyState.actions.length} sökningar och hittade ${legacyState.collectedDocuments.length} dokument.`;
  }

  return `Agentens resonemang:\n${steps.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
}

/**
 * Combine agentic results with query intelligence
 */
export function mergeWithAnalysis(
  agentDocs: any[],
  analysis: QueryAnalysis
): any[] {
  // Score documents based on query analysis match
  return agentDocs.map(doc => {
    let boost = 0;

    // Boost if matches extracted entities
    if (analysis.entities.sfsNumbers.some((sfs: string) =>
      doc.title?.includes(sfs) || doc.preview?.includes(sfs)
    )) {
      boost += 20;
    }

    if (analysis.entities.years.some((year: number) =>
      doc.year === year
    )) {
      boost += 10;
    }

    if (analysis.entities.authorities.some((auth: string) =>
      doc.source?.toLowerCase().includes(auth.toLowerCase())
    )) {
      boost += 15;
    }

    return {
      ...doc,
      score: (doc.score || 50) + boost,
    };
  }).sort((a, b) => b.score - a.score);
}

/**
 * Format agent context for the final LLM prompt
 */
export function formatAgentContextForPrompt(state: AgentState | NativeAgentState): string {
  // Handle native agent state
  if ('toolCalls' in state) {
    const nativeState = state as NativeAgentState;
    if (nativeState.toolCalls.length === 0) {
      return '';
    }

    const searchSummary = nativeState.toolCalls.map((call, i) => {
      const obs = nativeState.observations[i];
      return `- ${call.name}: ${obs?.summary || 'utförd'}`;
    }).join('\n');

    return `
## AGENT-SÖKNING (Ministral 3 14B)
Agenten utförde ${nativeState.totalSteps} steg för att besvara din fråga:
${searchSummary}

Totalt ${nativeState.collectedDocuments.length} relevanta dokument hittades.
`;
  }

  // Legacy agent state
  const legacyState = state as AgentState;
  if (legacyState.actions.length === 0) {
    return '';
  }

  const searchSummary = legacyState.actions.map((action, i) => {
    const obs = legacyState.observations[i];
    return `- ${action.tool}: ${obs?.summary || 'utförd'}`;
  }).join('\n');

  return `
## AGENT-SÖKNING
Agenten utförde ${legacyState.totalSteps} steg för att besvara din fråga:
${searchSummary}

Totalt ${legacyState.collectedDocuments.length} relevanta dokument hittades.
`;
}
