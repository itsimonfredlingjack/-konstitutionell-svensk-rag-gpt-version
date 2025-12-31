/**
 * Conversation Memory - Identitet via sammanfattning
 *
 * Hanterar konversationsminne för att:
 * 1. Behålla kontext mellan meddelanden
 * 2. Sammanfatta konversation var 3-5 tur
 * 3. Bibehålla identitet utan att luta på dokument
 */

import { LLM_URL } from '../config';

const MEMORY_MODEL = 'gemma3:12b';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ConversationMemory {
  summary: string;          // Kompakt sammanfattning av samtalet
  turnCount: number;        // Antal turer
  userGoal?: string;        // Vad användaren vill uppnå
  lastTopics: string[];     // Senaste 3 ämnen
  lastUpdate: Date;
}

export interface ConversationTurn {
  user: string;
  assistant: string;
  timestamp: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const SUMMARY_INTERVAL = 3;  // Uppdatera sammanfattning var 3:e tur
const MAX_TOPICS = 3;        // Behåll max 3 senaste ämnen
const MAX_SUMMARY_LENGTH = 200;  // Max tecken i sammanfattning

// ═══════════════════════════════════════════════════════════════════════════
// MEMORY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Skapa en ny tom konversationsminne
 */
export function createMemory(): ConversationMemory {
  return {
    summary: '',
    turnCount: 0,
    lastTopics: [],
    lastUpdate: new Date(),
  };
}

/**
 * Uppdatera minne med en ny konversationstur
 */
export async function updateMemory(
  current: ConversationMemory,
  newTurn: ConversationTurn
): Promise<ConversationMemory> {
  const newTurnCount = current.turnCount + 1;

  // Extrahera ämnen från den nya turen
  const topics = extractTopics(newTurn);
  const updatedTopics = [...topics, ...current.lastTopics].slice(0, MAX_TOPICS);

  // Uppdatera inte sammanfattning varje tur (för dyrt)
  if (newTurnCount % SUMMARY_INTERVAL !== 0) {
    return {
      ...current,
      turnCount: newTurnCount,
      lastTopics: updatedTopics,
      lastUpdate: new Date(),
    };
  }

  // Var 3:e tur: generera ny sammanfattning
  console.log(`📝 Memory: Uppdaterar sammanfattning (tur ${newTurnCount})...`);

  try {
    const newSummary = await generateSummary(current, newTurn);

    return {
      summary: newSummary,
      turnCount: newTurnCount,
      userGoal: extractUserGoal(newTurn, current.userGoal),
      lastTopics: updatedTopics,
      lastUpdate: new Date(),
    };
  } catch (error) {
    console.error('Memory update error:', error);
    // Vid fel, behåll nuvarande minne
    return {
      ...current,
      turnCount: newTurnCount,
      lastTopics: updatedTopics,
      lastUpdate: new Date(),
    };
  }
}

/**
 * Generera sammanfattning med LLM
 */
async function generateSummary(
  current: ConversationMemory,
  newTurn: ConversationTurn
): Promise<string> {
  const prompt = `Sammanfatta denna konversation i max 2 meningar på svenska.

${current.summary ? `TIDIGARE SAMMANFATTNING:\n${current.summary}\n\n` : ''}NY DIALOG:
Användare: ${newTurn.user}
Assistent: ${newTurn.assistant.substring(0, 200)}...

FOKUSERA PÅ:
• Vad användaren vill uppnå
• Vilka ämnen som diskuterats
• Viktig kontext för framtida frågor

SAMMANFATTNING:`;

  try {
    // Use native Ollama /api/chat with structured output
    const summarySchema = {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'En kort sammanfattning av konversationen' },
      },
      required: ['summary'],
    };

    const response = await fetch(`${LLM_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MEMORY_MODEL,
        messages: [
          {
            role: 'system',
            content: 'Du sammanfattar konversationer kortfattat och koncist på svenska.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        stream: false,
        format: summarySchema,
        options: {
          temperature: 0.3,
          num_predict: 100,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Summary generation failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.message?.content || '';

    // Parse structured response
    let summary = '';
    try {
      const parsed = JSON.parse(content);
      summary = parsed.summary?.trim() || content.trim();
    } catch {
      summary = content.trim();
    }

    // Begränsa längd
    return summary.substring(0, MAX_SUMMARY_LENGTH);
  } catch (error) {
    console.error('Summary generation error:', error);
    return current.summary;  // Behåll tidigare sammanfattning
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXTRACTION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extrahera ämnen från en konversationstur
 */
function extractTopics(turn: ConversationTurn): string[] {
  const text = `${turn.user} ${turn.assistant}`.toLowerCase();
  const topics: string[] = [];

  // Juridiska ämnen
  const legalTopics: Record<string, string[]> = {
    'grundlag': ['grundlag', 'rf', 'regeringsform', 'tf', 'ygl'],
    'offentlighet': ['offentlighet', 'sekretess', 'osl', 'allmän handling'],
    'gdpr': ['gdpr', 'personuppgift', 'dataskydd', 'integritet'],
    'kommun': ['kommun', 'kommunal', 'local', 'region'],
    'arbetsrätt': ['anställ', 'arbetsrätt', 'uppsägning', 'avsked'],
    'förvaltning': ['förvaltning', 'myndighet', 'beslut', 'överklag'],
  };

  for (const [topic, keywords] of Object.entries(legalTopics)) {
    if (keywords.some(kw => text.includes(kw))) {
      topics.push(topic);
    }
  }

  return topics;
}

/**
 * Extrahera användarens mål från konversation
 */
function extractUserGoal(turn: ConversationTurn, currentGoal?: string): string | undefined {
  const text = turn.user.toLowerCase();

  // Mönster som indikerar användarens mål
  const goalPatterns = [
    /jag vill (veta|förstå|lära mig|hitta|ta reda på)\s+(.+)/i,
    /kan du (hjälpa mig|förklara|visa|berätta)\s+(.+)/i,
    /jag behöver (information|hjälp|veta)\s+(.+)/i,
    /hur (fungerar|gör man|kan jag)\s+(.+)/i,
  ];

  for (const pattern of goalPatterns) {
    const match = text.match(pattern);
    if (match && match[2]) {
      return match[2].trim().substring(0, 100);
    }
  }

  return currentGoal;  // Behåll tidigare mål om inget nytt hittas
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT BUILDER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Bygg kontextmeddelande för LLM baserat på minne
 */
export function buildContextFromMemory(memory: ConversationMemory): string {
  if (memory.turnCount === 0) {
    return '';
  }

  const parts: string[] = [];

  if (memory.summary) {
    parts.push(`KONVERSATIONSKONTEXT: ${memory.summary}`);
  }

  if (memory.userGoal) {
    parts.push(`ANVÄNDARENS MÅL: ${memory.userGoal}`);
  }

  if (memory.lastTopics.length > 0) {
    parts.push(`SENASTE ÄMNEN: ${memory.lastTopics.join(', ')}`);
  }

  return parts.join('\n');
}

/**
 * Avgör om minnet är relevant för nuvarande fråga
 */
export function isMemoryRelevant(memory: ConversationMemory, question: string): boolean {
  if (memory.turnCount === 0 || memory.lastTopics.length === 0) {
    return false;
  }

  const lowerQuestion = question.toLowerCase();

  // Kolla om frågan relaterar till tidigare ämnen
  const topicRelevance = memory.lastTopics.some(topic =>
    lowerQuestion.includes(topic) ||
    lowerQuestion.includes('det') ||
    lowerQuestion.includes('detta') ||
    lowerQuestion.includes('vidare') ||
    lowerQuestion.includes('mer om')
  );

  // Uppföljningsfrågor är alltid relevanta
  const followupIndicators = [
    /^(och|men|vad med|hur är det med)/i,
    /^(kan du förklara|berätta mer|varför)/i,
    /^(det|den|detta|dessa)/i,
    /^(mer om|angående)/i,
  ];

  const isFollowup = followupIndicators.some(p => p.test(question.trim()));

  return topicRelevance || isFollowup;
}

// ═══════════════════════════════════════════════════════════════════════════
// RE-EXPORTED TYPES (already exported above, this section for documentation)
// ═══════════════════════════════════════════════════════════════════════════
// ConversationMemory - exported at interface definition
// ConversationTurn - exported at interface definition
