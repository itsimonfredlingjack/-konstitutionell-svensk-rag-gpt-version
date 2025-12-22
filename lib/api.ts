/**
 * Constitutional AI - API Client
 * Connects UI to ChromaDB, Ollama, and system metrics
 */

import { analyzeQuery, getOptimalSearchQuery, type QueryAnalysis, type QueryType } from './query-intelligence';

// ═══════════════════════════════════════════════════════════════════════════
// JAIL WARDEN - Swedish Law Corrections Dictionary
// Corrects common GPT hallucinations in Swedish legal terms
// ═══════════════════════════════════════════════════════════════════════════
const SWEDISH_LAW_CORRECTIONS: Record<string, string> = {
  'pressfrihetslagen': 'Tryckfrihetsförordningen (TF)',
  'pressfrihetslag': 'Tryckfrihetsförordningen (TF)',
  'yttrandefrihetslag': 'Yttrandefrihetsgrundlagen (YGL)',
  'yttrandefrihetslagen': 'Yttrandefrihetsgrundlagen (YGL)',
  'grundlagen': 'Regeringsformen (RF)',
  'svenska grundlagen': 'Regeringsformen (RF)',
  'konstitutionen': 'Regeringsformen (RF)',
  'offentlighetslagen': 'Offentlighets- och sekretesslagen (OSL)',
  'sekretesslagen': 'Offentlighets- och sekretesslagen (OSL)',
  'datainspektionen': 'Integritetsskyddsmyndigheten (IMY)',
  'personuppgiftslagen': 'GDPR + Dataskyddslagen (2018:218)',
  'strafflagen': 'Brottsbalken (BrB)',
  'tryckfrihetslagen': 'Tryckfrihetsförordningen (TF)',
  'regeringslagen': 'Regeringsformen (RF)',
};

function applyJailWardenCorrections(text: string): { correctedText: string; corrections: string[] } {
  const corrections: string[] = [];
  let correctedText = text;

  for (const [incorrect, correct] of Object.entries(SWEDISH_LAW_CORRECTIONS)) {
    const regex = new RegExp(`\\b${incorrect}\\b`, 'gi');
    if (regex.test(text)) {
      corrections.push(`"${incorrect}" → "${correct}"`);
      correctedText = correctedText.replace(regex, correct);
    }
  }

  return { correctedText, corrections };
}

// Helper function to count citations removed
function countCitationsRemoved(original: string, cleaned: string): number {
  const citationRegex = /\[\d+\]/g;
  const originalCount = (original.match(citationRegex) || []).length;
  const cleanedCount = (cleaned.match(citationRegex) || []).length;
  return originalCount - cleanedCount;
}

// ═══════════════════════════════════════════════════════════════════════════
// ANSWERABILITY GATE - Stoppa svar utan evidens
// ═══════════════════════════════════════════════════════════════════════════

// Svenska lagförkortningar och deras varianter (module-level för återanvändning)
// VIKTIGT: Inkludera alla böjningsformer (yttrandefrihet, yttrandefriheten, yttrandefrihetens)
const LEGAL_TERM_VARIANTS: Record<string, string[]> = {
  'tryckfrihetsförordningen': ['tryckfrihetsförordningen', 'tryckfrihetsförordning', 'tryckfrihet', 'tryckfriheten', 'tf', 'tfr'],
  'yttrandefrihetsgrundlagen': ['yttrandefrihetsgrundlagen', 'yttrandefrihetsgrundlag', 'yttrandefrihet', 'yttrandefriheten', 'ygl'],
  'regeringsformen': ['regeringsformen', 'regeringsform', 'rf', 'grundlag', 'grundlagen', 'grundlagar'],
  'offentlighetsprincipen': ['offentlighetsprincipen', 'offentlighetsprincip', 'offentlighet', 'offentligheten', 'osl', 'sekretess'],
  'förvaltningslagen': ['förvaltningslagen', 'förvaltningslag', 'förvaltning', 'förvaltnings', 'fl'],
  'kommunallagen': ['kommunallagen', 'kommunallag', 'kommun', 'kommunal', 'kl'],
  'gdpr': ['gdpr', 'dataskydd', 'personuppgift', 'personuppgifter', 'dataskyddsförordningen'],
  'successionsordningen': ['successionsordningen', 'successionsordning', 'tronföljd', 'tronföljden'],
  'riksdagsordningen': ['riksdagsordningen', 'riksdagsordning', 'ro'],
};

// ═══════════════════════════════════════════════════════════════════════════
// QUERY INTENT CLASSIFICATION - Avgör vilken typ av svar som krävs
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Intent-typer för att avgöra hur strikt claim-validering ska vara:
 * - LEGAL_CONTENT: Kräver primärkälla (lagtext), striktast validering (C→B)
 * - DEFINITION: Kan använda sekundärkällor, medium validering (B)
 * - GENERAL: Övriga frågor, medium validering (B)
 * - SMALLTALK: Ingen claim-validering behövs
 */
type QueryIntent = 'LEGAL_CONTENT' | 'DEFINITION' | 'GENERAL' | 'SMALLTALK';

/**
 * Klassificerar frågan för att avgöra vilken typ av svar och validering som krävs.
 * 
 * LEGAL_CONTENT: "Vad säger TF?", "Enligt 2 kap", "§ 15" → Kräver primärkälla
 * DEFINITION: "Vad är TF?", "Vad betyder offentlighetsprincipen?" → Sekundärkällor OK
 * GENERAL: Övriga juridiska frågor
 * SMALLTALK: Hälsningar, meta-frågor
 */
function classifyQueryIntent(question: string): QueryIntent {
  const lowerQ = question.toLowerCase().trim();
  
  // SMALLTALK: Hälsningar och meta-frågor (hanteras av query-intelligence.ts)
  const smalltalkPatterns = [
    /^(hej|hallå|tjena|god (morgon|dag|kväll)|morsning)/i,
    /^(tack|tackar|bra jobbat)/i,
    /^(vem är du|vad kan du|hur fungerar)/i,
  ];
  if (smalltalkPatterns.some(p => p.test(lowerQ))) {
    return 'SMALLTALK';
  }
  
  // LEGAL_CONTENT: Frågor som kräver primärkälla (lagtext)
  // Dessa mönster indikerar att användaren vill veta vad lagen faktiskt säger
  const legalContentPatterns = [
    /vad säger/i,                    // "Vad säger TF om censur?"
    /vad står (det )?i/i,            // "Vad står i 2 kap RF?"
    /enligt \d+\s*(kap|§)/i,         // "Enligt 2 kap 1 §"
    /\d+\s*kap\.?\s*\d*\s*§/i,       // "2 kap 1 §", "2 kap. 15 §"
    /§\s*\d+/i,                      // "§ 15"
    /paragraf\s*\d*/i,               // "paragraf 15"
    /stadgar\s/i,                    // "vad stadgar lagen"
    /föreskriver\s/i,                // "vad föreskriver"
    /reglerar\s/i,                   // "hur reglerar lagen"
    /lyder\s/i,                      // "hur lyder bestämmelsen"
    /ordalydelse/i,                  // "ordalydelsen i"
    /lagtext/i,                      // "lagtexten säger"
  ];
  if (legalContentPatterns.some(p => p.test(lowerQ))) {
    return 'LEGAL_CONTENT';
  }
  
  // DEFINITION: Frågor om vad något är/betyder (sekundärkällor OK)
  const definitionPatterns = [
    /^vad (är|betyder|innebär|menas med)/i,
    /^förklara\s/i,
    /^beskriv\s/i,
    /^hur (definieras|tolkas)/i,
  ];
  if (definitionPatterns.some(p => p.test(lowerQ))) {
    return 'DEFINITION';
  }
  
  // GENERAL: Övriga frågor
  return 'GENERAL';
}

/**
 * Kontrollerar om källorna innehåller primärkällor (SFS/lagtext).
 * Primärkällor krävs för LEGAL_CONTENT-frågor.
 * 
 * UPPDATERAD 2024-12-21: Nu detekterar doc_type="sfs" från sfs_lagtext collection
 */
function hasPrimarySource(sources: SearchResult[]): boolean {
  return sources.some(s => {
    // PRIMÄR CHECK: doc_type === "sfs" från sfs_lagtext collection
    if (s.doc_type === 'sfs') {
      return true;
    }
    
    // SEKUNDÄR CHECK: Mönster som indikerar primärkälla (lagtext, SFS)
    const primaryPatterns = [
      /^SFS\s*\d{4}:\d+/i,              // "SFS 1949:105"
      /svensk författningssamling/i,    // Explicit SFS
      /lagtext/i,                       // Dokument märkt som lagtext
      /\(\d{4}:\d+\)\s*$/,              // Slutar med "(1949:105)"
      /^(lag|förordning)\s+\(\d{4}:\d+\)/i,  // "Lag (2018:218)"
      /sfs_lagtext/i,                   // Source är sfs_lagtext collection
    ];
    
    const titleAndSource = `${s.title} ${s.source} ${s.doc_type || ''}`.toLowerCase();
    return primaryPatterns.some(p => p.test(titleAndSource));
  });
}

/**
 * Extraherar nyckeltermer från frågan för att validera att källorna är relevanta.
 * Returnerar de viktigaste termerna (lagnamn, förkortningar, ämnesord).
 */
function extractQueryKeyTerms(question: string): string[] {
  const lowerQ = question.toLowerCase();
  const keyTerms: string[] = [];
  
  // Hitta matchande termer
  for (const [canonical, variants] of Object.entries(LEGAL_TERM_VARIANTS)) {
    if (variants.some(v => lowerQ.includes(v))) {
      keyTerms.push(canonical);
    }
  }
  
  // Extrahera även långa ord (compound words) som troligen är ämnesspecifika
  const words = lowerQ.replace(/[?!.,;:]/g, '').split(/\s+/);
  const longWords = words.filter(w => w.length >= 8 && !['dokument', 'information', 'bestämmelse'].includes(w));
  keyTerms.push(...longWords.slice(0, 2));
  
  return [...new Set(keyTerms)]; // Unika termer
}

/**
 * Kontrollerar om källorna faktiskt nämner frågeämnet.
 * Detta är den "mjuka gaten" som stoppar irrelevanta källor.
 * 
 * VIKTIGT: Matchar mot ALLA varianter av en term, inte bara canonical form.
 * T.ex. "tryckfrihetsförordningen" matchar även "tryckfrihet", "tf", etc.
 */
function validateSourceRelevance(
  question: string, 
  sources: SearchResult[]
): { relevant: boolean; relevanceScore: number; matchedTerms: string[] } {
  if (sources.length === 0) {
    return { relevant: false, relevanceScore: 0, matchedTerms: [] };
  }
  
  const keyTerms = extractQueryKeyTerms(question);
  if (keyTerms.length === 0) {
    // Om vi inte kan extrahera nyckeltermer, anta att källorna är relevanta
    return { relevant: true, relevanceScore: 0.5, matchedTerms: [] };
  }
  
  // Kombinera alla källtexter
  const sourceText = sources
    .map(s => `${s.title} ${s.snippet}`.toLowerCase())
    .join(' ');
  
  // Räkna hur många nyckeltermer som finns i källorna
  // VIKTIGT: Matcha mot ALLA varianter, inte bara canonical term
  const matchedTerms = keyTerms.filter(term => {
    // Hämta alla varianter för denna term (om det är en känd juridisk term)
    const variants = LEGAL_TERM_VARIANTS[term] || [term];
    // Returnera true om NÅGON variant finns i källtexten
    return variants.some(v => sourceText.includes(v));
  });
  
  const relevanceScore = matchedTerms.length / keyTerms.length;
  
  // Kräv minst 50% matchning för att anses relevant, ELLER minst 1 matchad term
  const relevant = relevanceScore >= 0.5 || matchedTerms.length >= 1;
  
  return { relevant, relevanceScore, matchedTerms };
}

/**
 * Detekterar om svaret innehåller juridiska referenser (SFS, lagrum, paragrafer)
 * som inte borde finnas där om det saknas källor.
 */
function containsLegalReferences(text: string): boolean {
  const legalPatterns = [
    /\b\d{4}:\d+\b/,                    // SFS-nummer: 1976:1
    /\b\d+\s*kap\.?\s*\d+\s*§/i,        // Kapitel/paragraf: 2 kap. 15 §
    /\b§\s*\d+/,                         // Paragraf: § 15
    /-lagen\s*\(\d{4}:\d+\)/i,          // Lagnamn med SFS: Allemäns-rättslagen (1976:1)
    /-förordningen\s*\(\d{4}:\d+\)/i,   // Förordning med SFS
  ];
  
  return legalPatterns.some(pattern => pattern.test(text));
}

/**
 * Detekterar om LLM:en sa att den inte kunde svara baserat på källorna.
 */
function answerIndicatesNoEvidence(answer: string): boolean {
  const noEvidencePatterns = [
    /det framgår inte/i,
    /framgår inte av/i,
    /hittar ingen/i,
    /innehåller ingen/i,
    /kan inte besvara/i,
    /saknar information/i,
    /ingen text som/i,
  ];
  return noEvidencePatterns.some(p => p.test(answer));
}

/**
 * Validerar att juridiska svar har källor, annars returnera standardsvar.
 * Nu med mjuk gate: källor måste också vara relevanta för frågan.
 * 
 * VIKTIGT: Om LLM:en säger "Det framgår inte" trots att källor finns,
 * ska evidenceLevel vara LOW, inte HIGH.
 */
function validateLegalAnswer(
  answer: string, 
  sourceCount: number,
  sourceRelevance?: { relevant: boolean; relevanceScore: number }
): { valid: boolean; reason?: string; evidenceLevel: 'HIGH' | 'LOW' | 'NONE' } {
  
  // Ingen källa = ingen evidens
  if (sourceCount === 0) {
    if (containsLegalReferences(answer)) {
      return { 
        valid: false, 
        reason: 'Svaret innehåller juridiska referenser utan källor',
        evidenceLevel: 'NONE'
      };
    }
    return { valid: true, evidenceLevel: 'NONE' };
  }
  
  // Om LLM:en sa "Det framgår inte" trots att källor finns = LOW evidens
  // Detta händer när källorna handlar om ämnet men inte besvarar frågan direkt
  if (answerIndicatesNoEvidence(answer)) {
    return {
      valid: true, // Svaret är ärligt, inte en hallucination
      reason: 'LLM kunde inte besvara frågan baserat på källorna',
      evidenceLevel: 'LOW'
    };
  }
  
  // Källor finns men är inte relevanta = låg evidens
  if (sourceRelevance && !sourceRelevance.relevant) {
    return {
      valid: false,
      reason: 'Källorna verkar inte handla om frågeämnet',
      evidenceLevel: 'LOW'
    };
  }
  
  // Källor finns och är relevanta = hög evidens
  return { 
    valid: true, 
    evidenceLevel: sourceRelevance?.relevanceScore && sourceRelevance.relevanceScore >= 0.7 ? 'HIGH' : 'LOW'
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CLAIM-TO-CITATION VALIDATION - Säkerställ att påståenden har stöd
// ═══════════════════════════════════════════════════════════════════════════

interface ClaimValidationResult {
  valid: boolean;
  unsupportedClaims: string[];
  strippedAnswer: string;
  degradedAnswer: string;
}

/**
 * Validerar att faktapåståenden i svaret har stöd i källorna.
 * 
 * Strategi baserat på intent:
 * - LEGAL_CONTENT: C (ta bort) → B (degradera) om tomt
 * - GENERAL/DEFINITION: B (degradera)
 * - SMALLTALK: Ingen validering
 * 
 * @param answer - LLM:ens svar
 * @param sources - Källor från ChromaDB
 * @param intent - Frågetyp för att avgöra strikthet
 */
function validateClaimsHaveCitations(
  answer: string,
  sources: SearchResult[],
  intent: QueryIntent
): ClaimValidationResult {
  // Ingen validering för smalltalk
  if (intent === 'SMALLTALK') {
    return { valid: true, unsupportedClaims: [], strippedAnswer: answer, degradedAnswer: answer };
  }
  
  // Mönster för faktapåståenden som kräver stöd
  // Dessa är "hårda claims" som påstår vad lagen säger
  const hardClaimPatterns = [
    { pattern: /lagen (säger|stadgar|föreskriver|anger) att\s+[^.]+\./gi, type: 'law_states' },
    { pattern: /enligt \d+\s*kap\.?\s*\d*\s*§[^.]+\./gi, type: 'chapter_ref' },
    { pattern: /i \d+\s*§[^.]+\./gi, type: 'paragraph_ref' },
    { pattern: /\d{4}:\d+\s+(säger|stadgar|anger)[^.]+\./gi, type: 'sfs_states' },
    { pattern: /(det är|det finns) (en )?lag (som|att)[^.]+\./gi, type: 'law_exists' },
    { pattern: /grundlagen (säger|stadgar|föreskriver)[^.]+\./gi, type: 'constitution_states' },
  ];
  
  // Hitta alla claims i svaret
  const foundClaims: { text: string; type: string }[] = [];
  for (const { pattern, type } of hardClaimPatterns) {
    const matches = answer.match(pattern);
    if (matches) {
      foundClaims.push(...matches.map(m => ({ text: m, type })));
    }
  }
  
  if (foundClaims.length === 0) {
    return { valid: true, unsupportedClaims: [], strippedAnswer: answer, degradedAnswer: answer };
  }
  
  // Kombinera källtexter för matchning
  const sourceText = sources
    .map(s => `${s.title} ${s.snippet} ${s.content || ''}`)
    .join(' ')
    .toLowerCase();
  
  // Kolla vilka claims som saknar stöd
  const unsupportedClaims: string[] = [];
  for (const claim of foundClaims) {
    // Extrahera nyckelord från claim för att söka i källor
    const claimKeywords = claim.text
      .toLowerCase()
      .replace(/lagen (säger|stadgar|föreskriver|anger) att/gi, '')
      .replace(/enligt \d+\s*kap\.?\s*\d*\s*§/gi, '')
      .replace(/[.,;:!?]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3);
    
    // Kräv att minst 50% av nyckelorden finns i källorna
    const matchedKeywords = claimKeywords.filter(kw => sourceText.includes(kw));
    const matchRatio = claimKeywords.length > 0 ? matchedKeywords.length / claimKeywords.length : 0;
    
    if (matchRatio < 0.5) {
      unsupportedClaims.push(claim.text);
    }
  }
  
  if (unsupportedClaims.length === 0) {
    return { valid: true, unsupportedClaims: [], strippedAnswer: answer, degradedAnswer: answer };
  }
  
  // Skapa stripped version (C: ta bort osupporterade claims)
  let strippedAnswer = answer;
  for (const claim of unsupportedClaims) {
    strippedAnswer = strippedAnswer.replace(claim, '');
  }
  strippedAnswer = strippedAnswer.replace(/\s+/g, ' ').trim();
  
  // Skapa degraded version (B: ersätt "lagen säger" med "materialet nämner")
  let degradedAnswer = answer;
  const degradeReplacements: [RegExp, string][] = [
    [/lagen (säger|stadgar|föreskriver|anger) att/gi, 'i materialet nämns att'],
    [/grundlagen (säger|stadgar|föreskriver)/gi, 'dokumenten tar upp att'],
    [/enligt \d+\s*kap\.?\s*\d*\s*§/gi, 'i dokumenten diskuteras'],
    [/(det är|det finns) (en )?lag (som|att)/gi, 'materialet behandlar'],
  ];
  for (const [pattern, replacement] of degradeReplacements) {
    degradedAnswer = degradedAnswer.replace(pattern, replacement);
  }
  
  return {
    valid: false,
    unsupportedClaims,
    strippedAnswer,
    degradedAnswer,
  };
}

/**
 * HÅRD REGEL: Degradera ALLA "lagen säger"-formuleringar om vi saknar primärkälla.
 * Detta körs ALLTID för sekundärkällor, oavsett claim-matchning.
 * 
 * Primärkälla = SFS/lagtext
 * Sekundärkälla = propositioner, betänkanden, motioner, debatt
 */
function enforceSecondarySourceLanguage(answer: string): string {
  // Alla formuleringar som implicerar att vi citerar lagtext
  const lawClaimPatterns: [RegExp, string][] = [
    // "Lagen säger/stadgar/föreskriver/anger"
    [/lagen (säger|stadgar|föreskriver|anger|innebär|kräver)/gi, 'i materialet nämns'],
    [/(TF|YGL|RF|OSL|FL|KL) (säger|stadgar|föreskriver|anger|innebär|reglerar)/gi, 'dokumenten diskuterar hur $1'],
    
    // "Enligt X kap Y §"
    [/enligt (\d+)\s*kap\.?\s*(\d*)\s*§/gi, 'i dokumenten nämns'],
    [/i (\d+)\s*kap\.?\s*(\d*)\s*§\s+(stadgas|sägs|föreskrivs)/gi, 'dokumenten tar upp'],
    
    // "Grundlagen säger/stadgar"
    [/grundlagen (säger|stadgar|föreskriver|innebär)/gi, 'dokumenten diskuterar grundlagsreglering'],
    [/regeringsformen (säger|stadgar|föreskriver)/gi, 'dokumenten tar upp regeringsformen'],
    [/tryckfrihetsförordningen (säger|stadgar|föreskriver|reglerar)/gi, 'materialet behandlar tryckfrihetsförordningen'],
    [/yttrandefrihetsgrundlagen (säger|stadgar|föreskriver|reglerar)/gi, 'materialet behandlar yttrandefrihetsgrundlagen'],
    
    // "Det står i lagen att"
    [/det står i (lagen|lagtext|grundlag)/gi, 'i materialet nämns'],
    [/lagtexten (säger|anger|föreskriver)/gi, 'dokumenten diskuterar'],
    
    // "Lagen innebär/kräver"
    [/(lagen|lagstiftningen) (innebär|kräver|medför) att/gi, 'materialet tar upp att'],
    
    // SFS-nummer + "säger/stadgar"
    [/(\d{4}:\d+)\s+(säger|stadgar|föreskriver|anger)/gi, 'dokumenten refererar till $1 och nämner'],
  ];
  
  let degraded = answer;
  for (const [pattern, replacement] of lawClaimPatterns) {
    degraded = degraded.replace(pattern, replacement);
  }
  
  return degraded;
}

/**
 * Applicerar claim-validering baserat på intent OCH källtyp.
 * 
 * KRITISK REGEL: Om vi saknar primärkälla (SFS/lagtext), degradera ALLTID
 * "lagen säger"-formuleringar till "materialet nämner".
 * 
 * LEGAL_CONTENT utan primärkälla: B+C (degradera + strippa osupporterade)
 * LEGAL_CONTENT med primärkälla: Tillåt "lagen säger" om claim har stöd
 * GENERAL/DEFINITION: B (degradera)
 */
function applyClaimValidation(
  answer: string,
  sources: SearchResult[],
  intent: QueryIntent,
  hasPrimarySources: boolean = false
): { finalAnswer: string; claimsStripped: number; claimsDegraded: boolean } {
  
  // HÅRD REGEL: Utan primärkälla, degradera ALLTID "lagen säger"-språk
  // Detta gäller oavsett intent och oavsett claim-matchning
  let processedAnswer = answer;
  let forcedDegradation = false;
  
  if (!hasPrimarySources) {
    const originalAnswer = answer;
    processedAnswer = enforceSecondarySourceLanguage(answer);
    forcedDegradation = processedAnswer !== originalAnswer;
    
    if (forcedDegradation) {
      logMetric('secondary_source_language_enforced', {
        intent,
        original_length: originalAnswer.length,
        changes_made: true,
      });
    }
  }
  
  // Kör vanlig claim-validering på det (eventuellt) degraderade svaret
  const validation = validateClaimsHaveCitations(processedAnswer, sources, intent);
  
  if (validation.valid && !forcedDegradation) {
    return { finalAnswer: processedAnswer, claimsStripped: 0, claimsDegraded: false };
  }
  
  if (validation.valid && forcedDegradation) {
    // Svaret var valid men vi tvingade degradering pga sekundärkällor
    return { finalAnswer: processedAnswer, claimsStripped: 0, claimsDegraded: true };
  }
  
  logMetric('claim_validation_failed', {
    intent,
    has_primary: hasPrimarySources,
    unsupported_claims: validation.unsupportedClaims.length,
    claims: validation.unsupportedClaims.slice(0, 3),
  });
  
  if (intent === 'LEGAL_CONTENT') {
    // C: Ta bort osupporterade claims
    // Om stripped är för kort (< 50 tecken), använd degraded istället
    if (validation.strippedAnswer.length >= 50) {
      return {
        finalAnswer: validation.strippedAnswer,
        claimsStripped: validation.unsupportedClaims.length,
        claimsDegraded: forcedDegradation,
      };
    } else {
      // Fallback till B: degradera språket
      return {
        finalAnswer: validation.degradedAnswer,
        claimsStripped: 0,
        claimsDegraded: true,
      };
    }
  } else {
    // GENERAL/DEFINITION: B (degradera)
    return {
      finalAnswer: validation.degradedAnswer,
      claimsStripped: 0,
      claimsDegraded: true,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURED METRICS
// ═══════════════════════════════════════════════════════════════════════════
interface Metrics {
  timestamp: string;
  event: string;
  context?: Record<string, any>;
}

export function logMetric(event: string, context?: Record<string, any>): void {
  const metric: Metrics = {
    timestamp: new Date().toISOString(),
    event,
    context,
  };
  console.warn(`📊 METRICS: ${JSON.stringify(metric)}`);
}

// Use current hostname to allow access from other devices on the network
const getBaseUrl = (port: number) => {
  if (typeof window !== 'undefined') {
    return `http://${window.location.hostname}:${port}`;
  }
  return `http://localhost:${port}`;
};

const BACKEND_URL = getBaseUrl(8000);
const LLAMA_SERVER_URL = getBaseUrl(8080);

// NOTE: Constitutional-GPT uses llama-server (port 8080) only.
// The legacy Ollama backend has been permanently removed.

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  content?: string;
  score: number;
  source: string;
  doc_type: string;
  date?: string;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  limit: number;
  query: string;
}

export interface SystemStats {
  chromadb_connected: boolean;
  total_documents: number;
  collections: Record<string, number>;
  storage_size_mb: number;
}

export interface GPUStats {
  name: string;
  memory_used: number;
  memory_total: number;
  utilization: number;
  temperature: number;
}

export interface AgentResponse {
  answer: string;
  sources: SearchResult[];
  reasoning_steps: string[];
  model_used: string;
  total_time_ms: number;

  // Jail Warden v2 fields
  warden_version: 'v1' | 'v2';
  warden_status:
    | 'UNCHANGED'           // No correction needed
    | 'TERM_CORRECTED'      // Incorrect law name corrected (v1 style)
    | 'QUESTION_REWRITTEN'  // Question rewritten before LLM (v2)
    | 'FACT_VERIFIED'       // SFS numbers validated against canonical
    | 'FACT_UNVERIFIED'     // Incorrect SFS detected, not fixed
    | 'CITATIONS_STRIPPED'  // Model-generated citations removed
    | 'ERROR';

  warden_details?: {
    misconceptions_detected?: string[];
    sfs_validation?: { valid: boolean; errors?: string[] };
    citations_removed?: number;
    question_rewrite?: { original: string; rewritten: string };
  };

  // Evidence level for UI display
  evidence_level?: 'HIGH' | 'LOW' | 'NONE';

  // DEPRECATED - for backwards compatibility
  jail_warden_status?: 'VERIFIED' | 'REGENERATED' | 'ERROR' | 'SKIPPED';
  verified_claims?: number;
  total_claims?: number;

  // Query routing info
  query_type?: QueryType;
  was_routed?: boolean;  // true if handled without RAG (smalltalk, meta)
}

// ═══════════════════════════════════════════════════════════════════════════
// CHROMADB / BACKEND API
// ═══════════════════════════════════════════════════════════════════════════

export async function searchDocuments(
  query: string,
  options: {
    limit?: number;
    doc_type?: string;
    page?: number;
  } = {}
): Promise<SearchResponse> {
  const { limit = 10, doc_type, page = 1 } = options;

  try {
    const response = await fetch(`${BACKEND_URL}/api/constitutional/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        limit,
        page,
        filters: doc_type ? { doc_type } : undefined,
      }),
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Search error:', error);
    return { results: [], total: 0, page: 1, limit, query };
  }
}

export async function getSystemStats(): Promise<SystemStats | null> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/constitutional/stats/overview`);
    if (!response.ok) return null;
    const data = await response.json();
    // Map from actual API format to our interface
    return {
      chromadb_connected: true, // If we got a response, it's connected
      total_documents: data.total_documents || 0,
      collections: data.collections || {},
      storage_size_mb: data.storage_size_mb || 0,
    };
  } catch {
    return null;
  }
}

export async function getCollections(): Promise<{ name: string; count: number }[]> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/constitutional/collections`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.map((c: any) => ({ name: c.name, count: c.document_count }));
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GPU / SYSTEM METRICS
// ═══════════════════════════════════════════════════════════════════════════

export async function getGPUStats(): Promise<GPUStats | null> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/gpu/stats`);
    if (!response.ok) return null;
    const data = await response.json();
    // Map from actual API format to our interface
    if (data.gpu) {
      return {
        name: data.gpu.name,
        memory_used: data.gpu.vram_used_gb * 1024, // Convert GB to MB for consistency
        memory_total: data.gpu.vram_total_gb * 1024,
        utilization: data.gpu.gpu_util_percent,
        temperature: data.gpu.temperature_c,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function getHealth(): Promise<{ status: string; uptime?: number } | null> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/health`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LLM - via llama-server (NOT Ollama)
// ═══════════════════════════════════════════════════════════════════════════

export async function getLoadedModels(): Promise<string[]> {
  // Returns gpt-oss as the only model since we use llama-server
  // llama-server doesn't have a /api/ps endpoint like Ollama
  try {
    // Check if llama-server is responding
    const response = await fetch(`${LLAMA_SERVER_URL}/health`);
    if (response.ok) {
      return ['gpt-oss (llama-server)'];
    }
    return [];
  } catch {
    return [];
  }
}

// NOTE: ReasoningEffort is now controlled via --chat-template-kwargs on llama-server
// The server runs with {"reasoning_effort":"low"} by default
// This ensures stable content output without thinking-leakage

export async function generateResponse(
  prompt: string,
  model: string = 'gpt-oss',
  options: { temperature?: number; max_tokens?: number; systemPrompt?: string } = {}
): Promise<string> {
  const {
    temperature = 0.7,
    max_tokens = 500,
    systemPrompt = 'Du är en svensk juridisk expert. Svara på svenska.',
  } = options;

  try {
    // Use llama-server with Harmony chat template
    // reasoning_effort is controlled via --chat-template-kwargs on server (default: low)
    const response = await fetch(`${LLAMA_SERVER_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-oss',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature,
        max_tokens,
      }),
    });

    if (!response.ok) {
      throw new Error(`Generation failed: ${response.status}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    const finishReason = data.choices?.[0]?.finish_reason;

    // 🔍 DIAGNOSTIK: Logga RAW JSON för att detektera Harmony-läckage
    // Aktivera genom att sätta DEBUG_RAW_RESPONSE=true i environment
    if (process.env.DEBUG_RAW_RESPONSE === 'true') {
      console.log('🔍 RAW GPT-OSS RESPONSE:', JSON.stringify({
        content: message?.content,
        reasoning_content: message?.reasoning_content,
        finish_reason: finishReason,
        has_content: !!message?.content,
        has_reasoning: !!message?.reasoning_content,
      }, null, 2));
    }

    // Harmony template: content = final answer
    // IMPORTANT: Never expose reasoning_content to users
    let answer = message?.content || '';

    // AUTO-REPAIR: Detektera meta-läckage från Harmony format
    const metaLeakPatterns = [
      /^The user (says|asks|wants|is asking)/i,
      /^Let me (think|analyze|consider|explain)/i,
      /^I (will|shall|need to|should)/i,
      /^(First|Now),? (I|let me)/i,
      /^We (need to|should|will)/i,           // Engelska starter
      /^To answer/i,                           // "To answer this question..."
      /^Let's/i,                               // "Let's analyze..."
      /^<\|?analysis\|?>/i,
      /^<\|?message\|?>/i,
    ];

    if (answer && metaLeakPatterns.some(p => p.test(answer.trim()))) {
      logMetric('meta_leak_detected', { 
        first_50_chars: answer.substring(0, 50),
        source: 'generateResponse'
      });
      console.warn('⚠️ Meta-läckage detekterat i content, kör finalizer');
      answer = ''; // Trigga finalizer nedan
    }

    // Content-empty recovery: run finalizer (no reasoning_content parsing)
    if (!answer) {
      console.warn('⚠️ GPT-OSS: content empty, running finalizer');
      answer = await runFinalizer(prompt);
    }

    // Handle truncated responses
    if (!answer && finishReason === 'length') {
      console.warn('⚠️ Response truncated, running finalizer');
      answer = await runFinalizer(prompt);
    }

    return answer;
  } catch (error) {
    console.error('Generation error:', error);
    return '';
  }
}

/**
 * Finalizer: Force a direct Swedish answer when content-empty recovery is needed.
 * Uses a simple prompt that bypasses thinking mode.
 */
async function runFinalizer(originalPrompt: string): Promise<string> {
  logMetric('finalizer_triggered', { 
    reason: 'content_empty_or_meta_leak', 
    prompt_length: originalPrompt.length 
  });

  // Extrahera bara frågan (inte hela prompt-matryoshkan)
  const questionMatch = originalPrompt.match(/FRÅGA:\s*(.+?)(?:\n|$)/i);
  const cleanQuestion = questionMatch?.[1]?.trim() || originalPrompt.split('\n').pop() || originalPrompt;

  try {
    const response = await fetch(`${LLAMA_SERVER_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-oss',
        messages: [
          { 
            role: 'system', 
            content: `Du är en svensk myndighetsjurist.

REGLER:
• Svara DIREKT på frågan
• Max 3 meningar på svenska
• ALDRIG "The user", "Let me", "I will"
• ALDRIG meta-kommentarer eller analys
• Om du inte vet: "Det framgår inte av tillgängliga källor."`
          },
          { role: 'user', content: cleanQuestion }
        ],
        temperature: 0.3,
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      logMetric('finalizer_failed', { http_status: response.status });
      return 'Kunde inte generera svar.';
    }

    const data = await response.json();
    let result = data.choices?.[0]?.message?.content || '';
    
    // SISTA SÄKERHETSNÄT: Om finalizer OCKSÅ ger meta, fallback till statiskt svar
    const finalizerMetaPatterns = [
      /^The user/i, 
      /^Let me/i, 
      /^I will/i,
      /^We need/i,
      /^To answer/i,
      /^Let's/i,
    ];
    if (finalizerMetaPatterns.some(p => p.test(result.trim()))) {
      logMetric('finalizer_also_leaked', { first_30: result.substring(0, 30) });
      return 'Jag kan inte svara utifrån bifogade källor.';
    }
    
    if (result) {
      logMetric('finalizer_success', { response_length: result.length });
    }
    
    return result || 'Inget svar kunde genereras.';
  } catch (error) {
    logMetric('finalizer_exception', { error: String(error) });
    return 'Fel vid generering av svar.';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CITATION GATING - Strip model-generated citations
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Strip all citation markers and source references from model output.
 * Prevents hallucinated citations like [1], [2] that don't exist in ChromaDB.
 *
 * @param text - Raw model output with potential hallucinated citations
 * @returns Clean text with all citation artifacts removed
 */
function stripModelCitations(text: string): string {
  let cleaned = text;

  // Remove citation numbers like [1], [2], [123]
  cleaned = cleaned.replace(/\[\d+\]/g, '');

  // Remove common Swedish citation patterns
  cleaned = cleaned.replace(/enligt källa\s*\d*/gi, '');
  cleaned = cleaned.replace(/källa:\s*\d*/gi, '');
  cleaned = cleaned.replace(/\bkälla\b/gi, '');

  // Remove "Källor:" header and everything after (model may add its own)
  cleaned = cleaned.replace(/---\s*Källor:[\s\S]*/i, '');
  cleaned = cleaned.replace(/\n\s*Källor:[\s\S]*/i, '');

  // Remove "enligt dokumentet" and similar phrases
  cleaned = cleaned.replace(/enligt dokumentet/gi, '');
  cleaned = cleaned.replace(/i dokumenten/gi, '');
  cleaned = cleaned.replace(/baserat på källorna/gi, '');

  // Clean up extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

/**
 * Format ChromaDB sources for display at the end of the answer.
 * Only real sources from the database are shown.
 *
 * @param sources - SearchResults from ChromaDB query
 * @returns Formatted source section with links
 */
function formatSourcesForDisplay(sources: SearchResult[]): string {
  if (sources.length === 0) {
    return '';
  }

  const sourceLines = sources
    .slice(0, 5) // Show max 5 sources
    .map((source, i) => {
      const num = i + 1;
      const title = source.title || 'Okänd källa';
      const sourceUrl = source.source || '';

      // Format: [1] Proposition 2024/25:87 - regeringen.se
      return `[${num}] ${title} - ${sourceUrl}`;
    })
    .join('\n');

  return `\n\n---\nKällor:\n${sourceLines}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENTIC RAG - Full Pipeline
// ═══════════════════════════════════════════════════════════════════════════

export async function agentQuery(question: string): Promise<AgentResponse> {
  const startTime = Date.now();
  const reasoningSteps: string[] = [];
  let sources: SearchResult[] = [];

  try {
    // Step 0: QUERY ROUTER - Determine if we need RAG
    reasoningSteps.push('Analyserar frågan...');
    const queryAnalysis = analyzeQuery(question);
    reasoningSteps.push(`Frågetyp: ${queryAnalysis.type} (konfidens: ${Math.round(queryAnalysis.confidence * 100)}%)`);

    // Step 0.5: INTENT CLASSIFICATION - Avgör hur strikt validering som krävs
    const queryIntent = classifyQueryIntent(question);
    reasoningSteps.push(`Intent: ${queryIntent}`);

    // Handle non-RAG queries (smalltalk, system meta)
    if (!queryAnalysis.shouldRetrieve && queryAnalysis.directResponse) {
      reasoningSteps.push('Svarar direkt utan dokumentsökning');
      return {
        answer: queryAnalysis.directResponse,
        sources: [],
        reasoning_steps: reasoningSteps,
        model_used: 'router (no LLM)',
        total_time_ms: Date.now() - startTime,
        warden_version: 'v2',
        warden_status: 'UNCHANGED',
        query_type: queryAnalysis.type,
        was_routed: true,
      };
    }

    // Handle unknown abbreviations
    if (queryAnalysis.type === 'ABBREVIATION' && queryAnalysis.clarificationNeeded) {
      reasoningSteps.push('Förkortning okänd, ber om förtydligande');
      return {
        answer: queryAnalysis.clarificationNeeded,
        sources: [],
        reasoning_steps: reasoningSteps,
        model_used: 'router (no LLM)',
        total_time_ms: Date.now() - startTime,
        warden_version: 'v2',
        warden_status: 'UNCHANGED',
        query_type: queryAnalysis.type,
        was_routed: true,
      };
    }

    // Step 1: Search for relevant documents (with expanded query if available)
    const searchQuery = getOptimalSearchQuery(queryAnalysis, question);
    if (searchQuery !== question) {
      reasoningSteps.push(`Expanderad sökning: "${searchQuery.substring(0, 50)}..."`);
    }
    reasoningSteps.push('Söker i dokumentdatabasen...');
    
    const searchResult = await searchDocuments(searchQuery, { limit: 10 });
    sources = searchResult.results;
    reasoningSteps.push(`Hittade ${sources.length} relevanta dokument`);

    // Step 1.5: ANSWERABILITY GATE PER INTENT
    // LEGAL_CONTENT + 0 källor = abstain
    if (queryIntent === 'LEGAL_CONTENT' && sources.length === 0) {
      reasoningSteps.push('LEGAL_CONTENT utan källor → abstain');
      return {
        answer: 'Jag hittade inga dokument som kan besvara denna juridiska fråga. Försök omformulera eller var mer specifik.',
        sources: [],
        reasoning_steps: reasoningSteps,
        model_used: 'answerability-gate',
        total_time_ms: Date.now() - startTime,
        warden_version: 'v2',
        warden_status: 'FACT_UNVERIFIED',
        evidence_level: 'NONE',
        query_type: queryAnalysis.type,
        was_routed: false,
      };
    }

    // Step 2: Build context from documents
    const context = sources
      .slice(0, 5)
      .map((doc, i) => `[${i + 1}] ${doc.title}: ${doc.snippet}`)
      .join('\n\n');

    // Step 2.5: Validate source relevance + check for primary sources
    const sourceRelevance = validateSourceRelevance(question, sources);
    const hasPrimary = hasPrimarySource(sources);
    
    if (sources.length > 0) {
      reasoningSteps.push(`Källrelevans: ${Math.round(sourceRelevance.relevanceScore * 100)}%`);
      reasoningSteps.push(`Primärkälla (lagtext): ${hasPrimary ? 'JA' : 'NEJ'}`);
    }

    // Step 2.6: LEGAL_CONTENT utan primärkälla → Tvåpass-logik
    // Om frågan kräver lagtext men vi bara har sekundärkällor
    if (queryIntent === 'LEGAL_CONTENT' && !hasPrimary && sources.length > 0) {
      reasoningSteps.push('LEGAL_CONTENT utan primärkälla → tvåpass-svar');
      
      // Pass 1: Ärlig disclaimer
      const disclaimer = 'Jag har inte själva lagtexten i databasen.';
      
      // Pass 2: Safe summary av vad källorna handlar om
      const summaryPrompt = `Sammanfatta KORT vad följande riksdagsmaterial tar upp om ämnet.

REGLER:
• Säg ALDRIG "lagen säger" eller "enligt paragraf X"
• Använd "materialet nämner", "dokumenten handlar om", "i dessa dokument diskuteras"
• Max 3 meningar
• Om materialet inte är relevant, säg det

DOKUMENT:
${context}

ÄMNE: ${question}`;

      const summary = await generateResponse(summaryPrompt, 'gpt-oss', {
        temperature: 0.3,
        max_tokens: 200,
        systemPrompt: 'Du sammanfattar riksdagsmaterial. Använd ALDRIG formuleringar som "lagen säger" eller "enligt § X".',
      });
      
      const finalAnswer = `${disclaimer}\n\nJag kan däremot sammanfatta vad riksdagsmaterialet tar upp om ämnet:\n\n${summary}`;
      const sourcesSection = formatSourcesForDisplay(sources);
      
      return {
        answer: finalAnswer + sourcesSection,
        sources,
        reasoning_steps: reasoningSteps,
        model_used: 'gpt-oss-20b (two-pass)',
        total_time_ms: Date.now() - startTime,
        warden_version: 'v2',
        warden_status: 'CITATIONS_STRIPPED', // Inte FACT_VERIFIED
        warden_details: { sfs_validation: { valid: false, errors: ['Primärkälla saknas'] } },
        evidence_level: 'LOW', // Gul i UI
        query_type: queryAnalysis.type,
        was_routed: false,
      };
    }

    // Step 3: Generate answer with GPT-OSS via llama-server
    // Using EVIDENCE-FIRST prompting to force grounded answers
    reasoningSteps.push('Genererar svar med GPT-OSS (Pass 1: strict)...');
    
    const userPrompt = `Du ska besvara en fråga baserat ENDAST på följande dokument.

═══════════════════════════════════════════════════════════════
DOKUMENT (din enda informationskälla):
═══════════════════════════════════════════════════════════════
${context}

═══════════════════════════════════════════════════════════════
FRÅGA: ${question}
═══════════════════════════════════════════════════════════════

SVARA I DETTA FORMAT:

1. EVIDENS (citera 1-3 relevanta meningar från dokumenten ovan):
   • "..." 
   • "..."

2. SVAR (baserat på evidensen ovan, max 3 meningar):
   ...

Om dokumenten INTE innehåller information som besvarar frågan, skriv:
"Det framgår inte av tillgängliga dokument."`;

    let rawAnswer = await generateResponse(userPrompt, 'gpt-oss', {
      temperature: 0.2,
      max_tokens: 600,
      systemPrompt: `Du är en svensk juridisk expert. Du svarar ENDAST baserat på bifogade dokument.

KRITISKA REGLER:
• CITERA alltid evidens från dokumenten innan du svarar
• Om dokumenten inte innehåller svaret: säg det ärligt
• ALDRIG uppfinna SFS-nummer, paragrafer eller lagtext
• ALDRIG "syntetisera" kunskap utanför dokumenten
• Svara på svenska`,
    });
    reasoningSteps.push('Pass 1 svar genererat');

    // Step 3.5: PASS 2 TRIGGER - Om Pass 1 sa "framgår inte" trots källor
    const pass1SaidNoEvidence = answerIndicatesNoEvidence(rawAnswer || '');
    let pass2WasTriggered = false;
    
    if (pass1SaidNoEvidence && sources.length > 0 && sourceRelevance.relevant) {
      reasoningSteps.push('Pass 1 sa "framgår inte" trots relevanta källor → Pass 2');
      pass2WasTriggered = true;
      
      // Pass 2: Sammanfatta vad källorna handlar om
      const pass2Prompt = `Källorna nedan handlar om ämnet men besvarar kanske inte frågan direkt.
Sammanfatta vad dokumenten TAR UPP om ämnet (utan att påstå vad lagen säger).

REGLER:
• Använd "dokumenten diskuterar", "materialet tar upp", "i dessa källor nämns"
• ALDRIG "lagen säger", "enligt § X", eller liknande
• Max 3 meningar

DOKUMENT:
${context}

ÄMNE: ${question}`;

      const pass2Answer = await generateResponse(pass2Prompt, 'gpt-oss', {
        temperature: 0.3,
        max_tokens: 200,
        systemPrompt: 'Du sammanfattar dokument. Använd ALDRIG "lagen säger" eller paragrafnummer.',
      });
      
      rawAnswer = `Dokumenten besvarar inte frågan direkt, men tar upp relaterat material:\n\n${pass2Answer}`;
      reasoningSteps.push('Pass 2 sammanfattning genererad');
    }

    // Step 4: JAIL WARDEN v2 - Apply corrections and validation
    const wardenDetails: AgentResponse['warden_details'] = {};

    // Track term corrections (v1 style)
    const { correctedText, corrections } = applyJailWardenCorrections(rawAnswer || '');
    if (corrections.length > 0) {
      wardenDetails.misconceptions_detected = corrections;
      reasoningSteps.push(`Jail Warden korrigerade ${corrections.length} fel: ${corrections.join(', ')}`);
    }

    // Step 5: CITATION GATING - Strip model-generated citations and add real sources
    reasoningSteps.push('Tar bort eventuella hallucinerande källor...');
    const cleanAnswer = stripModelCitations(correctedText);

    // Track citations stripped
    const citationsRemoved = countCitationsRemoved(rawAnswer || '', cleanAnswer);
    if (citationsRemoved > 0) {
      wardenDetails.citations_removed = citationsRemoved;
    }

    // Step 6: CLAIM-TO-CITATION VALIDATION
    // Applicera claim-validering baserat på intent OCH källtyp
    // KRITISK: Utan primärkälla (SFS), degradera ALLTID "lagen säger"-språk
    reasoningSteps.push(`Validerar claims (intent: ${queryIntent}, primärkälla: ${hasPrimary})...`);
    const claimValidation = applyClaimValidation(cleanAnswer, sources, queryIntent, hasPrimary);
    
    let finalCleanAnswer = claimValidation.finalAnswer;
    if (claimValidation.claimsStripped > 0) {
      reasoningSteps.push(`Tog bort ${claimValidation.claimsStripped} osupporterade claims`);
      wardenDetails.citations_removed = (wardenDetails.citations_removed || 0) + claimValidation.claimsStripped;
    }
    if (claimValidation.claimsDegraded) {
      reasoningSteps.push('Degraderade språk (sekundärkällor → "materialet nämner")');
    }

    // Step 7: ANSWERABILITY GATE - Final validation
    const legalValidation = validateLegalAnswer(finalCleanAnswer, sources.length, sourceRelevance);
    
    if (!legalValidation.valid) {
      logMetric('answerability_gate_triggered', { 
        reason: legalValidation.reason,
        source_count: sources.length,
        evidence_level: legalValidation.evidenceLevel,
        relevance_score: sourceRelevance.relevanceScore
      });
      
      if (legalValidation.evidenceLevel === 'NONE') {
        console.warn(`⚠️ Answerability gate: Inga källor, ersätter svar`);
        finalCleanAnswer = 'Jag hittade inga dokument som besvarar denna fråga. Försök omformulera eller var mer specifik.';
      }
      
      wardenDetails.sfs_validation = { 
        valid: false, 
        errors: [legalValidation.reason || 'Insufficient evidence'] 
      };
    } else {
      wardenDetails.sfs_validation = { valid: true };
    }

    // Determine final evidence level
    // VIKTIGT: Om Pass 2 kördes, tvinga LOW evidens (svaret är en sammanfattning, inte ett direkt svar)
    let finalEvidenceLevel = legalValidation.evidenceLevel;
    if (pass2WasTriggered) {
      finalEvidenceLevel = 'LOW';
      reasoningSteps.push('Pass 2 kördes → evidensnivå satt till LOW');
    }

    // Determine overall Warden status based on evidence level
    let wardenStatus: AgentResponse['warden_status'] = 'UNCHANGED';
    if (corrections.length > 0) {
      wardenStatus = 'TERM_CORRECTED';
    }
    if (citationsRemoved > 0 || claimValidation.claimsStripped > 0 || claimValidation.claimsDegraded) {
      wardenStatus = 'CITATIONS_STRIPPED';
    }
    if (!legalValidation.valid) {
      wardenStatus = 'FACT_UNVERIFIED';
    } else if (finalEvidenceLevel === 'HIGH' && !claimValidation.claimsDegraded && !pass2WasTriggered) {
      wardenStatus = 'FACT_VERIFIED';  // Endast HIGH evidens + inga degraderade claims + inte Pass 2
    } else if (sources.length > 0) {
      wardenStatus = 'CITATIONS_STRIPPED'; // LOW evidens = inte "verifierat"
    }

    // Step 8: Append real ChromaDB sources
    const sourcesSection = formatSourcesForDisplay(sources);
    const finalAnswer = finalCleanAnswer + sourcesSection;

    return {
      answer: finalAnswer || 'Kunde inte generera svar.',
      sources,
      reasoning_steps: reasoningSteps,
      model_used: pass2WasTriggered ? 'gpt-oss-20b (two-pass)' : 'gpt-oss-20b (llama-server)',
      total_time_ms: Date.now() - startTime,

      // Jail Warden v2 fields
      warden_version: 'v2',
      warden_status: wardenStatus,
      warden_details: wardenDetails,

      // Evidence level for UI
      evidence_level: finalEvidenceLevel,

      // Deprecated fields for backwards compatibility
      jail_warden_status: corrections.length > 0 ? 'REGENERATED' : 'VERIFIED',
      verified_claims: 0,
      total_claims: corrections.length,

      // Query routing info
      query_type: queryAnalysis.type,
      was_routed: false,
    };
  } catch (error) {
    console.error('Agent query error:', error);
    return {
      answer: 'Ett fel uppstod vid förfrågan.',
      sources: [],
      reasoning_steps: [...reasoningSteps, `Fel: ${error}`],
      model_used: 'unknown',
      total_time_ms: Date.now() - startTime,
      warden_version: 'v2',
      warden_status: 'ERROR',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STREAMING CHAT (for real-time responses) - via llama-server
// ═══════════════════════════════════════════════════════════════════════════

export async function* streamChat(
  prompt: string,
  model: string = 'gpt-oss'
): AsyncGenerator<string> {
  try {
    // Use llama-server streaming via /v1/chat/completions with stream: true
    const response = await fetch(`${LLAMA_SERVER_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-oss',
        messages: [
          { role: 'system', content: 'Du är en svensk juridisk expert. Svara på svenska.' },
          { role: 'user', content: prompt }
        ],
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error('Stream failed');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(Boolean);

      for (const line of lines) {
        // SSE format: data: {...}
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6);
          if (jsonStr === '[DONE]') break;
          
          try {
            const data = JSON.parse(jsonStr);
            const content = data.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  } catch (error) {
    console.error('Stream error:', error);
    yield 'Streaming failed';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENT UPLOAD AND OCR
// ═══════════════════════════════════════════════════════════════════════════

export interface OCRResponse {
  extracted_text: string;
  answer: string;
  question: string;
  processing_time_ms: number;
  ocr_model: string;
  answer_model: string;
  filename: string;
}

export async function uploadDocumentAndAsk(
  file: File,
  question: string
): Promise<OCRResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('question', question);

  try {
    const response = await fetch(`${BACKEND_URL}/api/ocr/extract-and-answer`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`OCR request failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('OCR error:', error);
    return {
      extracted_text: '',
      answer: 'Kunde inte behandla dokumentet.',
      question,
      processing_time_ms: 0,
      ocr_model: 'unknown',
      answer_model: 'unknown',
      filename: file.name,
    };
  }
}
