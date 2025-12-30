/**
 * SWEDISH UX/PERSONA HARDENING - Prompt Profiles
 * Single source of truth for Gemma 3 12B system prompts (via Ollama)
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

LAGRUM-CITAT (VIKTIGT):
• När du citerar lagtext: använd EXAKT lagrum från källan
• Format: "Enligt RF 2 kap. 1 §: [exakt text]"
• Om SFS-nummer finns i källan: inkludera det (t.ex. "SFS 1974:152")
• Citera ALDRIG lagrum som inte finns i KÄLLOR

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
// E) CONCEPT PROFILE - Fix 5: Begreppsavgränsning för juridiska begrepp
// ═══════════════════════════════════════════════════════════════════════════

export const CONCEPT_PROFILE: PromptProfile = {
  name: 'Legal Concept Expert',
  purpose: 'Structured conceptual explanation with clear boundaries',
  temperature: 0.5,
  max_tokens: 500,  // Längre för begreppsförklaringar

  systemPrompt: `Du är en svensk myndighetsjurist som förklarar juridiska begrepp.

SVARSSTRUKTUR (obligatorisk):

1. SAMMANFATTNING (1-2 meningar)
   Vad är begreppet i korthet?

2. DEFINITION enligt [källa]
   Citera den formella definitionen med exakt lagrum.

3. BEGREPPSAVGRÄNSNING:
   ✓ INKLUDERAR:
   • [vad som omfattas, punkt 1]
   • [vad som omfattas, punkt 2]

   ✗ EXKLUDERAR:
   • [vanligt missförstånd 1]
   • [vad som INTE omfattas]

4. RELEVANTA LAGRUM
   • [SFS-nummer + lagtext] [1]
   • [SFS-nummer + lagtext] [2]

5. PRAKTISK TILLÄMPNING (valfri)
   Ett kort exempel på hur begreppet tillämpas i praktiken.

REGLER:
• Använd EXAKTA SFS-nummer från KÄLLOR
• Citera [n] för varje påstående
• INKLUDERAR/EXKLUDERAR måste vara konkreta punkter
• ALDRIG generiska svar - varje punkt ska vara specifik
• Om källorna är otillräckliga: "Komplett begreppsavgränsning kräver ytterligare källor."`,
};

// ═══════════════════════════════════════════════════════════════════════════
// F) EVIDENCE PROFILE - För claim verification
// ═══════════════════════════════════════════════════════════════════════════

export const EVIDENCE_PROFILE: PromptProfile = {
  name: 'Evidence Classifier',
  purpose: 'Classify claims against sources',
  temperature: 0.1,
  max_tokens: 500,
  responseFormat: 'json_object',

  systemPrompt: `Klassificera varje påstående mot källorna.

KLASSIFICERING:
• SUPPORTED: Påståendet finns explicit i källa
• NOT_SUPPORTED: Påståendet saknas (varken bekräftas eller motsägs)
• CONTRADICTED: Källorna säger motsatsen

OUTPUT-FORMAT:
{
  "verifications": [
    {
      "claim": "påståendet som verifieras",
      "classification": "SUPPORTED|NOT_SUPPORTED|CONTRADICTED",
      "source_ids": ["1", "2"],
      "confidence": 0.85,
      "reasoning": "kort motivering"
    }
  ]
}

REGLER:
• ENDAST klassificera mot tillgängliga källor
• ALDRIG gissa eller anta
• Confidence 0.9+ kräver exakt matchning
• Ange source_ids för alla SUPPORTED claims`,
};

// ═══════════════════════════════════════════════════════════════════════════
// PROFILE SELECTOR - Välj rätt profil baserat på frågetyp
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detekterar om frågan handlar om ett juridiskt begrepp
 * som bör besvaras med CONCEPT_PROFILE.
 */
export function isConceptQuestion(question: string): boolean {
  const conceptPatterns = [
    /vad (är|innebär|betyder|menas med)\s+/i,
    /förklara\s+(begreppet|vad|innebörden)/i,
    /definition\s+(av|på)\s+/i,
    /vad\s+är\s+(skillnaden|distinktionen)/i,
    /hur\s+definieras\s+/i,
    /begrepp(et)?\s+/i,
  ];

  // Måste också innehålla något juridiskt
  const legalIndicators = [
    /offentlighet/i,
    /sekretess/i,
    /yttrandefrihet/i,
    /tryckfrihet/i,
    /offentlighetsprincipen/i,
    /allemansrätt/i,
    /meddelarfrihet/i,
    /upphandling/i,
    /förvaltning/i,
    /beslut/i,
    /myndighet/i,
    /personuppgift/i,
    /gdpr/i,
    /dataskydd/i,
  ];

  const isConceptQ = conceptPatterns.some(p => p.test(question));
  const hasLegalTerm = legalIndicators.some(p => p.test(question));

  return isConceptQ && hasLegalTerm;
}

/**
 * Väljer rätt PromptProfile baserat på frågetyp.
 */
export function selectProfile(question: string): PromptProfile {
  if (isConceptQuestion(question)) {
    return CONCEPT_PROFILE;
  }
  // Default: använd standardprofilen
  return ANSWER_PROFILE;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Build user prompt with sources
// ═══════════════════════════════════════════════════════════════════════════

export interface SourceDocument {
  id: string;
  title: string;
  content: string;
  sfs?: string;
  // SFS-specifik metadata för pinpoint-citat
  doc_type?: string;
  sfs_nummer?: string;
  kortnamn?: string;
  kapitel?: string;
  paragraf?: string;
  source_url?: string;
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

  // Build source list with [n] markers and SFS pinpoint citations
  const sourceList = sources
    .map((doc, idx) => {
      // Build SFS citation if available
      let citation = '';
      if (doc.doc_type === 'sfs' && doc.kortnamn) {
        // Format: "RF 2 kap. 1 §" eller "OSL 21 kap. 7 §"
        const parts = [doc.kortnamn];
        if (doc.kapitel) parts.push(doc.kapitel);
        if (doc.paragraf) parts.push(doc.paragraf);
        citation = ` (${parts.join(' ')})`;
        
        // Lägg till SFS-nummer för fullständig referens
        if (doc.sfs_nummer) {
          citation += ` [SFS ${doc.sfs_nummer}]`;
        }
      } else if (doc.sfs) {
        citation = ` (${doc.sfs})`;
      }
      
      const preview = doc.content.substring(0, 200).trim();
      return `[${idx + 1}] ${doc.title}${citation}\n${preview}...`;
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
// SFS CITATION VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extraherar och validerar SFS-citat från svar.
 * 
 * Letar efter mönster som:
 * - "RF 2 kap. 1 §"
 * - "OSL 21:7" (ska tolkas som "OSL 21 kap. 7 §")
 * - "SFS 1974:152"
 */
export function extractSFSCitations(answer: string): string[] {
  const citations: string[] = [];
  
  // Pattern 1: "RF 2 kap. 1 §" (standard format)
  const standardPattern = /\b([A-ZÅÄÖ]{2,5})\s+(\d+[a-z]?)\s*kap\.\s*(\d+[a-z]?)\s*§/g;
  let match;
  while ((match = standardPattern.exec(answer)) !== null) {
    citations.push(`${match[1]} ${match[2]} kap. ${match[3]} §`);
  }
  
  // Pattern 2: "OSL 21:7" (förkortad notation)
  const shortPattern = /\b([A-ZÅÄÖ]{2,5})\s+(\d+):(\d+)/g;
  while ((match = shortPattern.exec(answer)) !== null) {
    citations.push(`${match[1]} ${match[2]} kap. ${match[3]} §`);
  }
  
  // Pattern 3: "SFS 1974:152"
  const sfsPattern = /\bSFS\s+(\d{4}:\d+)/g;
  while ((match = sfsPattern.exec(answer)) !== null) {
    citations.push(`SFS ${match[1]}`);
  }
  
  return Array.from(new Set(citations)); // Remove duplicates
}

/**
 * Validerar att SFS-citat i svaret matchar tillgängliga källor.
 */
export function validateSFSCitations(
  answer: string,
  sources: SourceDocument[]
): { valid: string[]; invalid: string[] } {
  
  const citations = extractSFSCitations(answer);
  const valid: string[] = [];
  const invalid: string[] = [];
  
  for (const citation of citations) {
    // Kolla om citation finns i någon källa
    const found = sources.some(source => {
      if (source.doc_type !== 'sfs') return false;
      
      // Matcha mot kortnamn, kapitel, paragraf
      const sourceRef = [source.kortnamn, source.kapitel, source.paragraf]
        .filter(Boolean)
        .join(' ');
      
      return citation.includes(sourceRef) || sourceRef.includes(citation);
    });
    
    if (found) {
      valid.push(citation);
    } else {
      invalid.push(citation);
    }
  }
  
  return { valid, invalid };
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
