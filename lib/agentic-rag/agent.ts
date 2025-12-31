/**
 * Agentic RAG Agent
 * ReAct-style agent that reasons about retrieval strategy
 *
 * MODELS:
 * - ministral-3:14b (BRAIN): Tool planning, reasoning + NATIVE FUNCTION CALLING!
 * - Ollama on port 11434
 */

import { TOOLS, getTool, formatToolsForPrompt, ToolResult } from './tools';
import { LLM_URL } from '../config';

const BRAIN_MODEL = 'ministral-3:14b';

export interface AgentState {
  question: string;
  thoughts: string[];
  actions: AgentAction[];
  observations: AgentObservation[];
  collectedDocuments: any[];
  finalAnswer?: string;
  isComplete: boolean;
  totalSteps: number;
  totalTimeMs: number;
}

export interface AgentAction {
  tool: string;
  params: Record<string, any>;
  reasoning: string;
}

export interface AgentObservation {
  tool: string;
  result: ToolResult;
  summary: string;
}

const MAX_STEPS = 5;

/**
 * Main agent loop - ReAct pattern
 */
export async function runAgent(question: string): Promise<AgentState> {
  const startTime = Date.now();

  const state: AgentState = {
    question,
    thoughts: [],
    actions: [],
    observations: [],
    collectedDocuments: [],
    isComplete: false,
    totalSteps: 0,
    totalTimeMs: 0,
  };

  // Agent loop
  while (!state.isComplete && state.totalSteps < MAX_STEPS) {
    state.totalSteps++;

    // Step 1: Think - what should we do next?
    const thought = await think(state);
    state.thoughts.push(thought.reasoning);

    if (thought.shouldStop) {
      state.isComplete = true;
      break;
    }

    // Step 2: Act - execute the chosen tool
    const action = thought.action;
    if (!action) {
      state.isComplete = true;
      break;
    }

    state.actions.push(action);

    // Step 3: Execute tool
    const tool = getTool(action.tool);
    if (!tool) {
      state.observations.push({
        tool: action.tool,
        result: { success: false, data: null, error: 'Tool not found' },
        summary: `Verktyget "${action.tool}" finns inte`,
      });
      continue;
    }

    const result = await tool.execute(action.params);

    // Step 4: Observe - process the result
    const observation = await observe(action, result);
    state.observations.push(observation);

    // Collect documents
    if (result.success && Array.isArray(result.data)) {
      // Handle comparison results
      if (action.tool === 'compare_documents') {
        for (const group of result.data) {
          state.collectedDocuments.push(...(group.documents || []));
        }
      } else {
        state.collectedDocuments.push(...result.data);
      }
    }

    // Check if we should synthesize
    if (action.tool === 'summarize_results') {
      state.isComplete = true;
    }
  }

  // Deduplicate collected documents
  const seen = new Set<string>();
  state.collectedDocuments = state.collectedDocuments.filter(doc => {
    if (seen.has(doc.id)) return false;
    seen.add(doc.id);
    return true;
  });

  state.totalTimeMs = Date.now() - startTime;
  return state;
}

/**
 * Think step - decide what to do next
 */
async function think(state: AgentState): Promise<{
  reasoning: string;
  action?: AgentAction;
  shouldStop: boolean;
}> {
  const historyContext = buildHistoryContext(state);

  const prompt = `Du är en intelligent RAG-agent som hjälper användare hitta information i svenska myndighetsdokument.

TILLGÄNGLIGA VERKTYG:
${formatToolsForPrompt()}

ANVÄNDARENS FRÅGA: "${state.question}"

${historyContext}

INSTRUKTIONER:
1. Analysera frågan och vad du redan vet
2. Bestäm NÄSTA steg för att besvara frågan
3. Välj ETT verktyg och dess parametrar
4. Om du har tillräckligt med information, välj "summarize_results"

Svara i EXAKT detta format:
TANKE: [Din analys av situationen]
VERKTYG: [verktygsnamn]
PARAMETRAR: {"param1": "värde1", "param2": "värde2"}

Exempel:
TANKE: Användaren frågar om GDPR-lagen. Jag bör först söka efter SFS-numret.
VERKTYG: search_sfs
PARAMETRAR: {"sfs_number": "2018:218"}`;

  try {
    const response = await callLLM(prompt);
    return parseThinkResponse(response);
  } catch (error) {
    console.error('Think error:', error);
    return {
      reasoning: 'Fel vid resonemang, försöker direkt sökning',
      action: {
        tool: 'search',
        params: { query: state.question, limit: 10 },
        reasoning: 'Fallback till direkt sökning',
      },
      shouldStop: false,
    };
  }
}

/**
 * Build context from history
 */
function buildHistoryContext(state: AgentState): string {
  if (state.actions.length === 0) {
    return 'HISTORIK: Inga tidigare steg.';
  }

  const history = state.actions.map((action, i) => {
    const obs = state.observations[i];
    const docCount = obs?.result.success
      ? (Array.isArray(obs.result.data) ? obs.result.data.length : 1)
      : 0;
    return `Steg ${i + 1}: ${action.tool}(${JSON.stringify(action.params)}) → ${docCount} dokument`;
  }).join('\n');

  const totalDocs = state.collectedDocuments.length;

  return `HISTORIK:
${history}

INSAMLADE DOKUMENT: ${totalDocs} st
${state.collectedDocuments.slice(0, 5).map(d => `- ${d.title}`).join('\n')}
${totalDocs > 5 ? `... och ${totalDocs - 5} till` : ''}`;
}

/**
 * Parse LLM response for think step
 */
function parseThinkResponse(response: string): {
  reasoning: string;
  action?: AgentAction;
  shouldStop: boolean;
} {
  const lines = response.split('\n');
  let reasoning = '';
  let tool = '';
  let params: Record<string, any> = {};

  for (const line of lines) {
    if (line.startsWith('TANKE:')) {
      reasoning = line.replace('TANKE:', '').trim();
    } else if (line.startsWith('VERKTYG:')) {
      tool = line.replace('VERKTYG:', '').trim().toLowerCase();
    } else if (line.startsWith('PARAMETRAR:')) {
      try {
        const jsonStr = line.replace('PARAMETRAR:', '').trim();
        params = JSON.parse(jsonStr);
      } catch {
        // Try to find JSON in the rest of the response
        const jsonMatch = response.match(/\{[^}]+\}/);
        if (jsonMatch) {
          try {
            params = JSON.parse(jsonMatch[0]);
          } catch { }
        }
      }
    }
  }

  // Check for stop conditions
  if (tool === 'summarize_results' || tool === 'klar' || tool === 'done' || !tool) {
    return {
      reasoning: reasoning || 'Redo att sammanfatta',
      shouldStop: true,
    };
  }

  return {
    reasoning,
    action: {
      tool,
      params,
      reasoning,
    },
    shouldStop: false,
  };
}

/**
 * Observe step - summarize tool result
 */
async function observe(action: AgentAction, result: ToolResult): Promise<AgentObservation> {
  if (!result.success) {
    return {
      tool: action.tool,
      result,
      summary: `Fel: ${result.error}`,
    };
  }

  const data = result.data;
  let summary = '';

  if (Array.isArray(data)) {
    if (data.length === 0) {
      summary = 'Inga dokument hittades';
    } else if (action.tool === 'compare_documents') {
      summary = data.map((group: any) =>
        `${group.term}: ${group.documents?.length || 0} dokument`
      ).join(', ');
    } else {
      summary = `Hittade ${data.length} dokument: ${data.slice(0, 3).map((d: any) => d.title).join(', ')}`;
      if (data.length > 3) summary += ` m.fl.`;
    }
  } else {
    summary = 'Resultat mottaget';
  }

  return {
    tool: action.tool,
    result,
    summary,
  };
}

/**
 * Call LLM via Ollama API (using Gemma 3 as BRAIN)
 */
async function callLLM(prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${LLM_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: BRAIN_MODEL,
        messages: [
          { role: 'system', content: 'Du är en RAG-agent. Följ instruktionerna exakt.' },
          { role: 'user', content: prompt }
        ],
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 200,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const data = await response.json();
    return data.message?.content || '';
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Format agent state for logging
 */
export function formatAgentLog(state: AgentState): string {
  const steps = state.actions.map((action, i) => {
    const obs = state.observations[i];
    return `
┃ Steg ${i + 1}: ${action.tool}
┃   Params: ${JSON.stringify(action.params)}
┃   Tanke: ${action.reasoning}
┃   Resultat: ${obs?.summary || 'N/A'}`;
  }).join('\n');

  return `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ 🤖 AGENTIC RAG
┃ Fråga: "${state.question}"
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${steps}
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ Totalt: ${state.collectedDocuments.length} dokument
┃ Steg: ${state.totalSteps}
┃ Tid: ${state.totalTimeMs}ms
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`.trim();
}
