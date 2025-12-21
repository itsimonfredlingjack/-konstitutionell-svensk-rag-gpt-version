/**
 * SWEDISH UX/PERSONA HARDENING - Prompt Profiles
 * Single source of truth for GPT-OSS system prompts
 * 
 * Design principles:
 * - Saklig, vänlig, byråkrat-light tone
 * - Strukturerat, kort, aldrig meta-prat
 * - Endast källbundna citat ([1], [2])
 * - Max 10-14 rader för användarsvar
 */

export interface PromptProfile {
  name: string;
  purpose: string;
  systemPrompt: string;
  temperature: number;
  max_tokens: number;
  responseFormat?: 'text' | 'json_object';
}

// ═══════════════════════════════════════════════════════════════════════════
// A) ANSWER PROFILE - För användarsvar
// ═══════════════════════════════════════════════════════════════════════════

export const ANSWER_PROFILE: PromptProfile = {
  name: 'Swedish Government Expert',
  purpose: 'Main user-facing answers with citations',
  temperature: 0.7,
  max_tokens: 400,  // ~10-14 rader på svenska
  
  systemPrompt: `Du är en svensk myndighetsjurist som hjälper medborgare.

STRUKTUR (max 10–14 rader):
1. Svar (1–3 meningar, direkt på frågan)
2. Förklaring (max 3 punkter med •)
3. Källor: [1] [2] (endast om de finns i KÄLLOR-listan)

REGLER:
• Svara på ren svenska, sakligt men vänligt
• Citera ENDAST med [n] om [n] finns i KÄLLOR
• Om källor saknas: "Det framgår inte av bifogade källor."
• ALDRIG uppfinna SFS-nummer eller lagrum
• ALDRIG "tänka högt" eller meta-planer ("jag ska nu...")
• ALDRIG fler än 14 rader totalt

TON: Byråkrat-light, precis som SKV/Försäkringskassan, men mänsklig.`,
};

// ═══════════════════════════════════════════════════════════════════════════
// B) TOOL/PLANNER PROFILE - För tool-calling
// ═══════════════════════════════════════════════════════════════════════════

export const TOOL_PROFILE: PromptProfile = {
  name: 'RAG Agent Planner',
  purpose: 'Tool selection in agentic loop',
  temperature: 0.1,
  max_tokens: 50,
  
  systemPrompt: `Du är en RAG-agent. Välj rätt verktyg.

REGLER:
• Returnera ENDAST tool_calls JSON eller "ingen åtgärd"
• ALDRIG citat, ALDRIG förklaringar
• Extremt kort
• Om du har 3+ dokument: använd "done"`,
};

// ═══════════════════════════════════════════════════════════════════════════
// C) JSON PROFILE - För extractClaims, structured output
// ═══════════════════════════════════════════════════════════════════════════

export const JSON_PROFILE: PromptProfile = {
  name: 'JSON Extractor',
  purpose: 'Structured data extraction (claims, facts)',
  temperature: 0.1,
  max_tokens: 300,
  responseFormat: 'json_object',
  
  systemPrompt: `Du extraherar faktuella påståenden från text.

OUTPUT-CONTRACT:
Returnera ENDAST JSON i exakt detta format:
{
  "claims": [
    "påstående 1 (minst 10 tecken)",
    "påstående 2 (minst 10 tecken)"
  ]
}

REGLER:
• Fokusera på: SFS-nummer, årtal, myndigheter, beslut
• Minst 10 tecken per påstående
• Aldrig tom array om text innehåller fakta
• ENDAST JSON, inget annat`,
};

// ═══════════════════════════════════════════════════════════════════════════
// D) FINALIZER PROFILE - Fallback när content är tom
// ═══════════════════════════════════════════════════════════════════════════

export const FINALIZER_PROFILE: PromptProfile = {
  name: 'Emergency Finalizer',
  purpose: 'Force direct answer when content-empty',
  temperature: 0.3,
  max_tokens: 150,
  
  systemPrompt: `Svara ENDAST på svenska. Max 3 meningar. Ingen analys, bara svaret.`,
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Build user prompt with sources
// ═══════════════════════════════════════════════════════════════════════════

export interface SourceDocument {
  id: string;
  title: string;
  content: string;
  sfs?: string;
}

export function buildAnswerPrompt(
  question: string, 
  sources: SourceDocument[]
): { userPrompt: string; sourceCount: number } {
  
  if (sources.length === 0) {
    return {
      userPrompt: `FRÅGA: ${question}

KÄLLOR: Inga källor tillgängliga. Säg att du saknar underlag.`,
      sourceCount: 0,
    };
  }

  // Build source list with [n] markers
  const sourceList = sources
    .map((doc, idx) => {
      const sfsTag = doc.sfs ? ` (${doc.sfs})` : '';
      const preview = doc.content.substring(0, 200).trim();
      return `[${idx + 1}] ${doc.title}${sfsTag}\n${preview}...`;
    })
    .join('\n\n');

  return {
    userPrompt: `KÄLLOR:
${sourceList}

FRÅGA: ${question}

Svara enligt STRUKTUR-mallen. Använd [1], [2] etc för citat.`,
    sourceCount: sources.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CITATION POLICY ENFORCEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validates that citations [n] only reference existing sources.
 * Removes hallucinated citations.
 */
export function enforceCitationPolicy(
  answer: string, 
  sourceCount: number
): { cleaned: string; violations: string[] } {
  
  const violations: string[] = [];
  let cleaned = answer;

  // Find all [n] citations
  const citationRegex = /\[(\d+)\]/g;
  const matches = Array.from(answer.matchAll(citationRegex));

  for (const match of matches) {
    const num = parseInt(match[1], 10);
    
    // Check if citation exceeds available sources
    if (num > sourceCount || num < 1) {
      violations.push(`[${num}]`);
      // Remove invalid citation
      cleaned = cleaned.replace(match[0], '');
    }
  }

  return { cleaned: cleaned.trim(), violations };
}

// ═══════════════════════════════════════════════════════════════════════════
// LENGTH & STRUCTURE ENFORCEMENT
// ═══════════════════════════════════════════════════════════════════════════

export interface StructureViolation {
  type: 'too_long' | 'missing_sources' | 'meta_talk';
  message: string;
}

/**
 * Validates answer structure against Swedish UX rules.
 * Returns violations that should trigger style finalizer.
 */
export function validateStructure(
  answer: string,
  sourceCount: number
): StructureViolation[] {
  
  const violations: StructureViolation[] = [];
  const lines = answer.split('\n').filter(l => l.trim().length > 0);

  // 1. Check length (max 14 lines)
  if (lines.length > 14) {
    violations.push({
      type: 'too_long',
      message: `${lines.length} rader (max 14)`,
    });
  }

  // 2. Check for "Källor:" section when sources exist
  if (sourceCount > 0 && !answer.match(/Källor:/i) && !answer.match(/\[\d+\]/)) {
    violations.push({
      type: 'missing_sources',
      message: 'Källor finns men inga citat i svar',
    });
  }

  // 3. Check for meta-talk (thinking out loud)
  const metaPatterns = [
    /jag ska nu/i,
    /låt mig/i,
    /först.*sedan/i,
    /för att svara/i,
    /baserat på.*analyserar jag/i,
  ];

  for (const pattern of metaPatterns) {
    if (pattern.test(answer)) {
      violations.push({
        type: 'meta_talk',
        message: `Meta-prat detekterat: ${pattern.source}`,
      });
      break;
    }
  }

  return violations;
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLE FINALIZER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Triggered when structure violations are detected.
 * Rewrites answer to conform to Swedish UX standards.
 */
export async function runStyleFinalizer(
  originalAnswer: string,
  question: string,
  violations: StructureViolation[]
): Promise<string> {
  
  console.warn(`⚠️  Style violations detected: ${violations.map(v => v.type).join(', ')}`);
  
  // Build corrective prompt
  const issues = violations.map(v => `- ${v.message}`).join('\n');
  
  const correctivePrompt = `Detta svar bryter mot strukturregler:
${issues}

URSPRUNGLIGT SVAR:
${originalAnswer}

FRÅGA: ${question}

Skriv om enligt STRUKTUR-mallen (max 10-14 rader, inga meta-kommentarer, tydliga citat).`;

  // This would call the LLM with ANSWER_PROFILE
  // For now, return a placeholder
  return originalAnswer; // Will be implemented with actual LLM call
}
