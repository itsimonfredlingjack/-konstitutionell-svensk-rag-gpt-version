/**
 * Swedish Legal Corrections Dictionary
 *
 * Maps common GPT hallucinations to correct Swedish legal terms.
 * Used by Jail Warden to verify and correct answers before displaying to user.
 *
 * Pattern: { incorrect_term: correct_term_with_citation }
 */

export const SWEDISH_LAW_CORRECTIONS: Record<string, string> = {
  // === GRUNDLAGAR (Constitutional Laws) ===
  'pressfrihetslagen': 'Tryckfrihetsförordningen (TF, 1949:105)',
  'pressfrihetslag': 'Tryckfrihetsförordningen (TF, 1949:105)',
  'yttrandefrihetslag': 'Yttrandefrihetsgrundlagen (YGL, 1991:1469)',
  'yttrandefrihetslagen': 'Yttrandefrihetsgrundlagen (YGL, 1991:1469)',
  'grundlagen': 'Regeringsformen (RF, 1974:152)',
  'svenska grundlagen': 'Regeringsformen (RF, 1974:152)',
  'konstitutionen': 'Regeringsformen (RF, 1974:152)',

  // === DATASKYDD (Data Protection) ===
  'dataskyddslagen': 'Dataskyddslagen (2018:218) - kompletterar GDPR',
  'personuppgiftslagen': 'Upphävd 2018-05-25, ersatt av GDPR + Dataskyddslagen (2018:218)',
  'pul': 'Upphävd 2018-05-25, ersatt av GDPR + Dataskyddslagen (2018:218)',
  'PUL': 'Upphävd 2018-05-25, ersatt av GDPR + Dataskyddslagen (2018:218)',

  // === OFFENTLIGHET & SEKRETESS (Public Access & Secrecy) ===
  'sekretesslagen': 'Offentlighets- och sekretesslagen (OSL, 2009:400)',
  'offentlighetslagen': 'Offentlighets- och sekretesslagen (OSL, 2009:400) + Tryckfrihetsförordningen kap. 2',
  'arkivlagen': 'Arkivlagen (1990:782)',

  // === MYNDIGHETER (Authorities) - namn som ändrats ===
  'datainspektionen': 'Integritetsskyddsmyndigheten (IMY) - bytte namn 2021',
  'Datainspektionen': 'Integritetsskyddsmyndigheten (IMY) - bytte namn 2021',
  'DI': 'Integritetsskyddsmyndigheten (IMY) - DI blev IMY 2021',
  'post- och telestyrelsen': 'Post- och telestyrelsen (PTS) - korrekt namn',
  'konsumentverket': 'Konsumentverket - korrekt (men kollar Konsumentombudsmannen)',

  // === FÖRVALTNINGSRÄTT (Administrative Law) ===
  'förvaltningsprocesslagen': 'Förvaltningsprocesslagen (1971:291)',
  'kommunallagen': 'Kommunallagen (2017:725)',
  'förvaltningslagen': 'Förvaltningslagen (2017:900)',

  // === STRAFFRÄTT (Criminal Law) ===
  'strafflagen': 'Brottsbalken (BrB, 1962:700)',
  'brottslagen': 'Brottsbalken (BrB, 1962:700)',

  // === CIVILRÄTT (Civil Law) ===
  'avtalslagen': 'Lag om avtal och andra rättshandlingar på förmögenhetsrättens område (AvtL, 1915:218)',
  'köplagen': 'Köplagen (1990:931)',
  'konsumentköplagen': 'Konsumentköplagen (2022:260) - ersatte 1990:932',

  // === ARBETSRÄTT (Labor Law) ===
  'arbetsrättslagen': 'Ingen generell "arbetsrättslag" - se LAS, MBL, AML',
  'las': 'Lag om anställningsskydd (LAS, 1982:80)',
  'LAS': 'Lag om anställningsskydd (LAS, 1982:80)',

  // === PROCESSRÄTT (Procedural Law) ===
  'processlagen': 'Rättegångsbalken (RB, 1942:740)',
  'domstolslagen': 'Rättegångsbalken (RB, 1942:740) eller Domstolslagen (beroende på kontext)',

  // === VANLIGA FELSTAVNINGAR ===
  'tryckfrihetslagen': 'Tryckfrihetsförordningen (TF, 1949:105)',
  'regeringslagen': 'Regeringsformen (RF, 1974:152)',
  'successionslagen': 'Successionsordningen (SO, 1810:0926)',
};

/**
 * Known correct terms that should NOT be flagged
 */
export const VERIFIED_CORRECT_TERMS: string[] = [
  'Tryckfrihetsförordningen',
  'TF',
  'Yttrandefrihetsgrundlagen',
  'YGL',
  'Regeringsformen',
  'RF',
  'Successionsordningen',
  'SO',
  'Riksdagsordningen',
  'RO',
  'Offentlighets- och sekretesslagen',
  'OSL',
  'GDPR',
  'Dataskyddslagen',
  'Integritetsskyddsmyndigheten',
  'IMY',
  'Brottsbalken',
  'BrB',
  'Rättegångsbalken',
  'RB',
  'Förvaltningslagen',
  'FL',
  'Förvaltningsprocesslagen',
  'FPL',
  'Kommunallagen',
  'KL',
];

/**
 * Extract potential legal term mentions from text
 */
export function extractLegalTerms(text: string): string[] {
  const patterns = [
    // Swedish law patterns
    /\b[A-ZÅÄÖ][a-zåäö]+(?:lagen|förordningen|balken|ordningen)\b/g,
    // Abbreviations in parentheses
    /\((?:TF|YGL|RF|SO|RO|OSL|BrB|RB|FL|FPL|KL|LAS|MBL|AML|PUL|GDPR|IMY)\)/g,
    // SFS numbers
    /\b\d{4}:\d+\b/g,
    // Authority names
    /\b(?:Datainspektionen|Integritetsskyddsmyndigheten|Konsumentverket|Skatteverket)\b/gi,
  ];

  const terms = new Set<string>();
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(m => terms.add(m.replace(/[()]/g, '')));
    }
  }

  return Array.from(terms);
}

/**
 * Check if a term needs correction
 */
export function needsCorrection(term: string): boolean {
  const lowerTerm = term.toLowerCase();
  return Object.keys(SWEDISH_LAW_CORRECTIONS).some(
    key => lowerTerm.includes(key.toLowerCase())
  );
}

/**
 * Get correction for a term if it exists
 */
export function getCorrection(term: string): string | null {
  const lowerTerm = term.toLowerCase();
  for (const [incorrect, correct] of Object.entries(SWEDISH_LAW_CORRECTIONS)) {
    if (lowerTerm.includes(incorrect.toLowerCase())) {
      return correct;
    }
  }
  return null;
}

/**
 * Apply all corrections to a text
 */
export function applyCorrections(text: string): {
  correctedText: string;
  corrections: Array<{ original: string; corrected: string }>;
} {
  const corrections: Array<{ original: string; corrected: string }> = [];
  let correctedText = text;

  for (const [incorrect, correct] of Object.entries(SWEDISH_LAW_CORRECTIONS)) {
    // Case-insensitive search but preserve original case in corrections array
    const regex = new RegExp(`\\b${escapeRegExp(incorrect)}\\b`, 'gi');
    const matches = text.match(regex);

    if (matches) {
      matches.forEach(match => {
        if (!corrections.some(c => c.original.toLowerCase() === match.toLowerCase())) {
          corrections.push({ original: match, corrected: correct });
        }
      });
      // Replace with just the law name (not the full explanation) for readability
      const lawName = correct.split('(')[0].trim();
      correctedText = correctedText.replace(regex, lawName);
    }
  }

  return { correctedText, corrections };
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Verify claims against ChromaDB (to be called from n8n or agent-loop)
 */
export interface ClaimVerification {
  claim: string;
  verified: boolean;
  source?: string;
  correction?: string;
  confidence: number;
}

export interface JailWardenResponse {
  original_text: string;
  corrected_text: string;
  corrections_made: Array<{ original: string; corrected: string }>;
  unverified_claims: string[];
  status: 'VERIFIED' | 'CORRECTED' | 'UNVERIFIED';
  confidence: number;
}
