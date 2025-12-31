/**
 * Native Function Calling Agent - Ministral 3 14B
 *
 * Uses Ollama's native tool use API instead of prompt-based parsing.
 * This is more reliable and less error-prone than string parsing.
 *
 * MODELS:
 * - ministral-3:14b (BRAIN): Native function calling + reasoning
 * - Ollama on port 11434
 */

import { TOOLS, getTool, type Tool, type ToolResult } from './tools';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const BRAIN_MODEL = 'ministral-3:14b';
const MAX_STEPS = 5;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface NativeAgentState {
  question: string;
  thoughts: string[];
  toolCalls: NativeToolCall[];
  observations: NativeObservation[];
  collectedDocuments: any[];
  finalAnswer?: string;
  isComplete: boolean;
  totalSteps: number;
  totalTimeMs: number;
}

export interface NativeToolCall {
  name: string;
  arguments: Record<string, any>;
  reasoning?: string;
}

export interface NativeObservation {
  toolCall: NativeToolCall;
  result: ToolResult;
  summary: string;
}

interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, any> | string;
  };
}

interface OllamaChatResponse {
  message: {
    role: string;
    content: string;
    tool_calls?: OllamaToolCall[];
  };
  done: boolean;
}

/**
 * Parse tool calls from text format (fallback for non-standard responses)
 * Handles formats like: search_documents[ARGS]{"query": "value"}
 */
function parseToolCallsFromText(content: string): OllamaToolCall[] {
  const toolCalls: OllamaToolCall[] = [];

  // Pattern: toolname[ARGS]{json}
  const argsPattern = /(\w+)\[ARGS\](\{[^}]+\})/g;
  let match;

  while ((match = argsPattern.exec(content)) !== null) {
    const name = match[1];
    try {
      const args = JSON.parse(match[2]);
      toolCalls.push({
        function: { name, arguments: args }
      });
    } catch {
      console.warn(`Failed to parse arguments for ${name}`);
    }
  }

  return toolCalls;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVERT TOOLS TO OLLAMA FORMAT
// ═══════════════════════════════════════════════════════════════════════════

function toolToOllamaFormat(tool: Tool): object {
  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const param of tool.parameters) {
    properties[param.name] = {
      type: param.type === 'array' ? 'array' : param.type,
      description: param.description,
    };
    if (param.required) {
      required.push(param.name);
    }
  }

  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties,
        required,
      },
    },
  };
}

function getOllamaTools(): object[] {
  return TOOLS.map(toolToOllamaFormat);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN AGENT LOOP - NATIVE FUNCTION CALLING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run the agent with native function calling
 */
export async function runNativeAgent(question: string): Promise<NativeAgentState> {
  const startTime = Date.now();

  const state: NativeAgentState = {
    question,
    thoughts: [],
    toolCalls: [],
    observations: [],
    collectedDocuments: [],
    isComplete: false,
    totalSteps: 0,
    totalTimeMs: 0,
  };

  // Build conversation history for multi-turn
  const messages: Array<{ role: string; content: string; tool_calls?: any[] }> = [
    {
      role: 'system',
      content: `Du är en RAG-agent för svenska myndighetsdokument.

DITT UPPDRAG:
1. Analysera användarens fråga
2. Använd verktygen för att hitta relevant information
3. När du har tillräckligt med information, anropa "done"

STRATEGI:
- Börja ALLTID med search_documents för att hitta relevanta dokument
- Använd think_longer för komplexa frågor som kräver djupare analys
- Anropa "done" när du samlat tillräckligt med information

VIKTIGT:
- Var specifik med sökfrågorna
- Filtrera på doc_type om frågan rör specifik dokumenttyp
- Svara ALLTID på svenska`,
    },
    {
      role: 'user',
      content: question,
    },
  ];

  // Agent loop
  while (!state.isComplete && state.totalSteps < MAX_STEPS) {
    state.totalSteps++;
    console.log(`\n🤖 Agent steg ${state.totalSteps}/${MAX_STEPS}...`);

    try {
      // Call Ollama with native tool use
      const response = await callOllamaWithTools(messages);

      // Check if we got tool calls (native or parsed from text)
      let toolCalls = response.message.tool_calls || [];

      // Fallback: parse from text if no native tool_calls
      if (toolCalls.length === 0 && response.message.content) {
        toolCalls = parseToolCallsFromText(response.message.content);
        if (toolCalls.length > 0) {
          console.log(`   📝 Parsed ${toolCalls.length} tool call(s) from text format`);
        }
      }

      if (toolCalls.length > 0) {
        // Process each tool call
        for (const toolCall of toolCalls) {
          const name = toolCall.function.name;
          const args = typeof toolCall.function.arguments === 'string'
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function.arguments;

          console.log(`   🔧 Tool call: ${name}(${JSON.stringify(args)})`);

          // Check for done signal
          if (name === 'done') {
            state.isComplete = true;
            state.thoughts.push(response.message.content || 'Klar med informationsinsamling');
            break;
          }

          // Execute the tool
          const tool = getTool(name);
          if (!tool) {
            console.warn(`   ⚠️ Unknown tool: ${name}`);
            continue;
          }

          const nativeToolCall: NativeToolCall = {
            name,
            arguments: args,
            reasoning: response.message.content,
          };
          state.toolCalls.push(nativeToolCall);

          // Execute tool
          const result = await tool.execute(args);

          // Create observation
          const observation: NativeObservation = {
            toolCall: nativeToolCall,
            result,
            summary: summarizeResult(name, result),
          };
          state.observations.push(observation);

          // Collect documents
          if (result.success && Array.isArray(result.data)) {
            for (const doc of result.data) {
              if (doc && doc.id && !state.collectedDocuments.some(d => d.id === doc.id)) {
                state.collectedDocuments.push(doc);
              }
            }
          }

          // Add tool result to conversation for next turn
          messages.push({
            role: 'assistant',
            content: response.message.content || '',
            tool_calls: [toolCall],
          });
          messages.push({
            role: 'tool',
            content: JSON.stringify(result.success ? result.data : { error: result.error }),
          });
        }

        // Store reasoning if present
        if (response.message.content) {
          state.thoughts.push(response.message.content);
        }
      } else {
        // No tool calls - model wants to respond directly
        if (response.message.content) {
          state.thoughts.push(response.message.content);
        }
        state.isComplete = true;
      }
    } catch (error) {
      console.error(`   ❌ Error in step ${state.totalSteps}:`, error);
      state.thoughts.push(`Fel i steg ${state.totalSteps}: ${error}`);

      // Fallback: do a direct search
      if (state.totalSteps === 1) {
        console.log('   → Fallback: kör direkt sökning...');
        const searchTool = getTool('search_documents');
        if (searchTool) {
          const result = await searchTool.execute({ query: question, limit: 10 });
          if (result.success && Array.isArray(result.data)) {
            state.collectedDocuments.push(...result.data);
          }
        }
      }
      state.isComplete = true;
    }
  }

  state.totalTimeMs = Date.now() - startTime;
  return state;
}

// ═══════════════════════════════════════════════════════════════════════════
// OLLAMA API CALL WITH NATIVE TOOLS
// ═══════════════════════════════════════════════════════════════════════════

async function callOllamaWithTools(
  messages: Array<{ role: string; content: string; tool_calls?: any[] }>
): Promise<OllamaChatResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: BRAIN_MODEL,
        messages,
        tools: getOllamaTools(),
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 500,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function summarizeResult(toolName: string, result: ToolResult): string {
  if (!result.success) {
    return `Fel: ${result.error}`;
  }

  const data = result.data;

  if (toolName === 'search_documents' && Array.isArray(data)) {
    if (data.length === 0) return 'Inga dokument hittades';
    return `Hittade ${data.length} dokument: ${data.slice(0, 3).map((d: any) => d.title).join(', ')}${data.length > 3 ? ' m.fl.' : ''}`;
  }

  if (toolName === 'get_datetime') {
    return `Datum: ${data.date} ${data.time}`;
  }

  if (toolName === 'web_search' && Array.isArray(data)) {
    return `Webbsökning: ${data.length} resultat`;
  }

  if (toolName === 'think_longer') {
    return `Djupanalys: ${data.consensus?.substring(0, 100) || 'Analys klar'}...`;
  }

  return 'Resultat mottaget';
}

/**
 * Format agent state for logging
 */
export function formatNativeAgentLog(state: NativeAgentState): string {
  const steps = state.toolCalls.map((call, i) => {
    const obs = state.observations[i];
    return `
┃ Steg ${i + 1}: ${call.name}
┃   Args: ${JSON.stringify(call.arguments)}
┃   Resultat: ${obs?.summary || 'N/A'}`;
  }).join('\n');

  return `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ 🤖 NATIVE AGENT (Ministral 3 14B)
┃ Fråga: "${state.question}"
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${steps}
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ Dokument: ${state.collectedDocuments.length}
┃ Steg: ${state.totalSteps}
┃ Tid: ${state.totalTimeMs}ms
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`.trim();
}
