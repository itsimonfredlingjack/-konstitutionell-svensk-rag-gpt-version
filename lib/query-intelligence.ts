/**
 * Query Intelligence - Router & Expansion for Constitutional-GPT
 * 
 * Handles:
 * 1. Query routing (smalltalk vs juridik vs oklart)
 * 2. Swedish legal abbreviation expansion
 * 3. Entity extraction (SFS, myndigheter, etc.)
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type QueryType =
  | 'SMALLTALK'           // "Hur mår du?", "Hej!"
  | 'SYSTEM_META'         // "Vilken modell är du?", "Vad kan du?"
  | 'META_CAPABILITIES'   // "Vad kan du hjälpa med?", "Hur funkar du?" [CHAT mode]
  | 'FEEDBACK'            // "Dåligt svar", "Du fattar inte" [CHAT mode]
  | 'TASK_HELP'           // "Hjälp mig skriva", "Sammanfatta" [CHAT mode]
  | 'INCOMPLETE_INPUT'    // "Vad", "Hur?", "Ja" - ofullständig input [CHAT mode]
  | 'VAGUE_QUERY'         // "Jag undrar om OSL", "Berätta om TF" - vag fråga [CHAT mode]
  | 'ABOUT_USER'          // "Vad vet du om mig?", "Vem är jag?" [CHAT mode]
  | 'LEGAL_EXPLICIT'      // "OSL 21 kap", "TF 1:10" - specifik lag + kapitel/paragraf [EVIDENCE mode]
  | 'LEGAL_QUERY'         // "Vad säger TF?", "Vilka lagar..." [ASSIST mode]
  | 'LEGAL_AMBIGUOUS'     // "RF om SFS" - otydlig, behöver förtydligande [CHAT mode]
  | 'DOCUMENT_QUERY'      // "Enligt bifogade dokument..."
  | 'ABBREVIATION'        // "TF?", "OSL?" - needs clarification [CHAT mode]
  | 'UNKNOWN';            // Default → ASSIST mode

export interface LawReference {
  lawAbbrev: string;          // "osl", "tf", "rf"
  chapter?: number;           // 21
  paragraph?: number;         // 7
  fullName?: string;          // "Offentlighets- och sekretesslagen"
  sfs?: string;               // "2018:218"
}

export interface QueryAnalysis {
  type: QueryType;
  shouldRetrieve: boolean;       // Whether to query ChromaDB
  expandedQuery?: string;        // Query with expanded abbreviations
  directResponse?: string;       // For SMALLTALK/SYSTEM_META
  clarificationNeeded?: string;  // For ABBREVIATION/LEGAL_AMBIGUOUS
  lawReference?: LawReference;   // For LEGAL_EXPLICIT - used for hard filtering
  entities: {
    sfsNumbers: string[];
    authorities: string[];
    docTypes: string[];
    years: number[];
    lawNames: string[];
  };
  expandedTerms: string[];
  confidence: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// SWEDISH LEGAL ABBREVIATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const SWEDISH_LAW_ABBREVIATIONS: Record<string, { full: string; sfs?: string; description: string }> = {
  // Grundlagar
  'tf': { full: 'Tryckfrihetsförordningen', sfs: '1949:105', description: 'Grundlag om tryckfrihet' },
  'rf': { full: 'Regeringsformen', sfs: '1974:152', description: 'Sveriges grundlag' },
  'ygl': { full: 'Yttrandefrihetsgrundlagen', sfs: '1991:1469', description: 'Grundlag om yttrandefrihet' },
  'so': { full: 'Successionsordningen', sfs: '1810:0926', description: 'Grundlag om tronföljd' },
  'ro': { full: 'Riksdagsordningen', sfs: '2014:801', description: 'Riksdagens arbetsordning' },
  
  // Viktiga lagar
  'osl': { full: 'Offentlighets- och sekretesslagen', sfs: '2018:218', description: 'Lag om sekretess' },
  'osfl': { full: 'Offentlighets- och sekretesslagen', sfs: '2018:218', description: 'ALIAS för OSL' },
  'fl': { full: 'Förvaltningslagen', sfs: '2017:900', description: 'Lag om förvaltning' },
  'kl': { full: 'Kommunallagen', sfs: '2017:725', description: 'Lag om kommuner' },
  'brb': { full: 'Brottsbalken', sfs: '1962:700', description: 'Strafflagstiftning' },
  'rb': { full: 'Rättegångsbalken', sfs: '1942:740', description: 'Processrätt' },
  'jb': { full: 'Jordabalken', sfs: '1970:994', description: 'Fastighetsrätt' },
  'äb': { full: 'Ärvdabalken', sfs: '1958:637', description: 'Arvsrätt' },
  'fb': { full: 'Föräldrabalken', sfs: '1949:381', description: 'Familjerätt' },
  'mb': { full: 'Miljöbalken', sfs: '1998:808', description: 'Miljölagstiftning' },
  'pbl': { full: 'Plan- och bygglagen', sfs: '2010:900', description: 'Bygglov och planering' },
  'lob': { full: 'Lagen om offentlig upphandling', sfs: '2016:1145', description: 'Upphandling' },
  'lou': { full: 'Lagen om offentlig upphandling', sfs: '2016:1145', description: 'ALIAS för LOB' },
  'gdpr': { full: 'Dataskyddsförordningen + Dataskyddslagen', sfs: '2018:218', description: 'EU-förordning + svensk lag' },
  'pul': { full: 'Personuppgiftslagen (upphävd)', sfs: '1998:204', description: 'Ersatt av GDPR' },
  'lul': { full: 'Lag med särskilda bestämmelser om unga lagöverträdare', sfs: '1964:167', description: 'Unga lagöverträdare' },
  'lvu': { full: 'Lag med särskilda bestämmelser om vård av unga', sfs: '1990:52', description: 'Tvångsvård unga' },
  'lvm': { full: 'Lag om vård av missbrukare', sfs: '1988:870', description: 'Tvångsvård missbruk' },
  'lss': { full: 'Lagen om stöd och service till vissa funktionshindrade', sfs: '1993:387', description: 'Funktionshinder' },
  'sol': { full: 'Socialtjänstlagen', sfs: '2001:453', description: 'Social omsorg' },
  'hsl': { full: 'Hälso- och sjukvårdslagen', sfs: '2017:30', description: 'Sjukvård' },
  'aml': { full: 'Arbetsmiljölagen', sfs: '1977:1160', description: 'Arbetsmiljö' },
  'las': { full: 'Lagen om anställningsskydd', sfs: '1982:80', description: 'Anställningsskydd' },
  'mbl': { full: 'Lagen om medbestämmande i arbetslivet', sfs: '1976:580', description: 'Facklig rätt' },
  'afl': { full: 'Socialförsäkringsbalken (tidigare AFL)', sfs: '2010:110', description: 'Socialförsäkring' },
  'sfb': { full: 'Socialförsäkringsbalken', sfs: '2010:110', description: 'Socialförsäkring' },
};

// ═══════════════════════════════════════════════════════════════════════════
// PATTERN MATCHING
// ═══════════════════════════════════════════════════════════════════════════

const SMALLTALK_PATTERNS = [
  /^(hej|hallå|tjena|tjo|god (morgon|dag|kväll))[\s!?]*$/i,
  /^hur (mår|går det|är det|har) (du|ni|det)[\s!?]*$/i,
  /^(tack|tackar)[\s!]*$/i,
  /^(adjö|hejdå|vi ses)[\s!?]*$/i,
  /^vad (heter|kallas) du[\s?]*$/i,
  /^vem (är|skapade) du[\s?]*$/i,
];

const SYSTEM_META_PATTERNS = [
  /^vad (är|för) (du|ni) för (en )?(llm|ai|modell|system)[\s?]*$/i,
  /^vilken (modell|ai|version) (är|använder) (du|ni|detta)[\s?]*$/i,
  /^vad kan du (göra|hjälpa med)[\s?]*$/i,
  /^hur (fungerar|funkar) (du|systemet)[\s?]*$/i,
  /^berätta om dig själv[\s?]*$/i,
  /^vad (är|innebär) constitutional[\s-]?(ai|gpt)?[\s?]*$/i,
];

const LEGAL_INDICATORS = [
  /vad säger/i,
  /enligt (lag|lagen|lagstiftning)/i,
  /vilka lagar/i,
  /juridisk/i,
  /lagrum/i,
  /paragraf/i,
  /kapitel.*§/i,
  /\d{4}:\d+/,  // SFS-nummer
  /prop\./i,
  /sou\s*\d{4}/i,
  /bet\./i,
];

const PURE_ABBREVIATION_PATTERN = /^([a-zåäö]{2,5})[\s?!]*$/i;

// Pattern för explicita lagreferenser: "OSL 21 kap 7 §", "TF 1:10", "RF 2 kap. 1 §"
// Grupper: [1]=lag, [2]=kapitel, [3]=paragraf (optional)
const EXPLICIT_LAW_PATTERN = /\b(osl|osfl|tf|rf|ygl|brb|rb|jb|äb|fb|mb|pbl|fl|kl|sol|hsl|lss|las|mbl|aml|lvu|lvm|lul|sfb|afl|lou|lob|gdpr|ro|so)\s*(\d{1,3})\s*(?:kap(?:itel)?\.?|:)\s*(\d{1,3})?\s*(§|para(?:graf)?)?/i;

// Alternativt format: "21 kap 7 § OSL"
const EXPLICIT_LAW_PATTERN_REVERSED = /(\d{1,3})\s*kap(?:itel)?\.?\s*(\d{1,3})?\s*§?\s*(osl|osfl|tf|rf|ygl|brb|rb|jb|äb|fb|mb|pbl|fl|kl|sol|hsl|lss|las|mbl|aml|lvu|lvm|lul|sfb|afl|lou|lob|gdpr|ro|so)\b/i;

// Pattern för tvetydiga frågor: "RF om SFS", "lag om X"
const AMBIGUOUS_LAW_PATTERN = /\b(rf|tf|ygl|osl)\s+(om|angående|gällande)\s+(sfs|lag|bestämmelser?)/i;

// ═══════════════════════════════════════════════════════════════════════════
// NYA PATTERNS FÖR ASSISTANSLAGRET (CHAT MODE)
// ═══════════════════════════════════════════════════════════════════════════

// META_CAPABILITIES: Frågor om vad boten kan göra
const META_CAPABILITIES_PATTERNS = [
  /vad kan du (hjälpa|göra|bistå)/i,
  /vad har du för (funktioner|möjligheter|kapacitet)/i,
  /hur (kan du hjälpa|funkar du|fungerar detta)/i,
  /vad är du (bra på|kapabel till)/i,
  /vilka frågor kan (du|jag ställa)/i,
  /vad (klarar|kan) du (av)?/i,
  /berätta (vad du|om dina) (kan|funktioner)/i,
];

// FEEDBACK: Negativ feedback eller missnöje
const FEEDBACK_PATTERNS = [
  /dåligt svar/i,
  /fel(aktigt)? svar/i,
  /det (där|stämmer inte|hjälper inte|är fel)/i,
  /du (fattar|förstår) (inte|ej)/i,
  /förklara (det )?(bättre|annorlunda|igen)/i,
  /det var inte (det jag|vad jag) (frågade|menade)/i,
  /missförstod/i,
  /nej,? (det var|jag menade)/i,
  /prova igen/i,
];

// TASK_HELP: Hjälp med att skriva eller göra något
const TASK_HELP_PATTERNS = [
  /hjälp mig (att )?(skriva|formulera|göra)/i,
  /kan du (skriva|göra|formulera)/i,
  /skriv (ett|en|en kort)/i,
  /sammanfatta (det här|detta|texten)/i,
  /gör (en|ett) (plan|utkast|förslag|sammanfattning)/i,
  /översätt/i,
  /korrekturläs/i,
  /förenkla (texten|detta)/i,
];

// INCOMPLETE_INPUT: Ofullständig input (bara ett ord/frågeord)
const INCOMPLETE_INPUT_PATTERNS = [
  /^(vad|hur|var|när|vem|vilka?)[\s?!]*$/i,      // Bara frågeord: "Vad?", "Hur?"
  /^(ja|nej|ok|okej|mm|hmm|jo)[\s?!]*$/i,        // Bara bekräftelse: "Ja", "Nej"
  /^\.{2,}$/,                                      // Bara punkter: "..."
  /^[\s?!]+$/,                                     // Bara whitespace/skiljetecken
  /^(eh|öh|ähm?|hmm)[\s?!]*$/i,                   // Tvekljud
];

// VAGUE_QUERY: Vaga frågor om ett ämne (behöver följdfråga)
const VAGUE_QUERY_PATTERNS = [
  /jag (har|undrar|funderar) (frågor?|funderingar?|tankar?) (om|kring|angående)/i,
  /jag vill (veta mer|lära mig|förstå) om/i,
  /berätta (om|lite om|något om)\s+\w+/i,
  /kan du förklara\s+\w+[\s?]*$/i,                // "Kan du förklara OSL?" (utan specifik fråga)
  /^(vad är|vad innebär)\s+\w{2,5}[\s?]*$/i,     // "Vad är OSL?" (bara förkortning)
];

// ABOUT_USER: Personliga frågor om användaren
const ABOUT_USER_PATTERNS = [
  /vad (vet|kan) du (om|säga om) mig/i,           // "Vad vet du om mig?"
  /vem (är|tror du) (jag|att jag)/i,              // "Vem är jag?", "Vem tror du att jag är?"
  /känner du (igen )?mig/i,                        // "Känner du mig?"
  /minns du (vem jag är|mig)/i,                    // "Minns du mig?"
  /har du (någon|info|information) om mig/i,       // "Har du information om mig?"
  /kommer du ihåg (mig|vårt samtal)/i,             // "Kommer du ihåg mig?"
  /vad (heter|kallas) jag/i,                       // "Vad heter jag?"
  /sparar du (data|information) om (mig|användare)/i, // "Sparar du data om mig?"
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ROUTER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function analyzeQuery(query: string): QueryAnalysis {
  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();
  
  // Default result
  const result: QueryAnalysis = {
    type: 'UNKNOWN',
    shouldRetrieve: true,
    entities: {
      sfsNumbers: [],
      authorities: [],
      docTypes: [],
      years: [],
      lawNames: [],
    },
    expandedTerms: [],
    confidence: 0.5,
  };

  // 1. Check for SMALLTALK
  if (SMALLTALK_PATTERNS.some(p => p.test(trimmed))) {
    result.type = 'SMALLTALK';
    result.shouldRetrieve = false;
    // LLM genererar svar istället för hardcoded
    result.confidence = 0.95;
    return result;
  }

  // 2. Check for SYSTEM_META
  if (SYSTEM_META_PATTERNS.some(p => p.test(trimmed))) {
    result.type = 'SYSTEM_META';
    result.shouldRetrieve = false;
    // LLM genererar svar istället för hardcoded
    result.confidence = 0.95;
    return result;
  }

  // 2b. Check for META_CAPABILITIES (vad kan du hjälpa med?)
  if (META_CAPABILITIES_PATTERNS.some(p => p.test(trimmed))) {
    result.type = 'META_CAPABILITIES';
    result.shouldRetrieve = false;
    // LLM genererar svar istället för hardcoded
    result.confidence = 0.95;
    return result;
  }

  // 2c. Check for FEEDBACK (dåligt svar, du fattar inte)
  if (FEEDBACK_PATTERNS.some(p => p.test(trimmed))) {
    result.type = 'FEEDBACK';
    result.shouldRetrieve = false;
    // LLM genererar svar istället för hardcoded
    result.confidence = 0.9;
    return result;
  }

  // 2d. Check for TASK_HELP (hjälp mig skriva, sammanfatta)
  if (TASK_HELP_PATTERNS.some(p => p.test(trimmed))) {
    result.type = 'TASK_HELP';
    result.shouldRetrieve = false;
    // LLM genererar svar istället för hardcoded
    result.confidence = 0.85;
    return result;
  }

  // 2e. Check for INCOMPLETE_INPUT (bara frågeord, "Vad?", "Ja")
  // VIKTIGT: Kör FÖRE förkortnings-check så "Vad?" inte tolkas som okänd förkortning
  if (INCOMPLETE_INPUT_PATTERNS.some(p => p.test(trimmed))) {
    result.type = 'INCOMPLETE_INPUT';
    result.shouldRetrieve = false;
    // LLM genererar mjuk förtydligande
    result.confidence = 0.85;
    return result;
  }

  // 2f. Check for VAGUE_QUERY (vaga frågor om ett ämne)
  if (VAGUE_QUERY_PATTERNS.some(p => p.test(trimmed))) {
    result.type = 'VAGUE_QUERY';
    result.shouldRetrieve = false;
    // LLM genererar följdfråga med exempel
    result.confidence = 0.75;
    return result;
  }

  // 2g. Check for ABOUT_USER (personliga frågor om användaren)
  if (ABOUT_USER_PATTERNS.some(p => p.test(trimmed))) {
    result.type = 'ABOUT_USER';
    result.shouldRetrieve = false;
    // LLM genererar svar om privacy/minne
    result.confidence = 0.9;
    return result;
  }

  // 3. Check for EXPLICIT law references (e.g., "OSL 21 kap 7 §", "TF 1:10")
  // This takes priority - enables hard filtering
  const explicitMatch = trimmed.match(EXPLICIT_LAW_PATTERN);
  const explicitReversedMatch = trimmed.match(EXPLICIT_LAW_PATTERN_REVERSED);

  if (explicitMatch || explicitReversedMatch) {
    let lawAbbrev: string;
    let chapter: number;
    let paragraph: number | undefined;

    if (explicitMatch) {
      // Format: "OSL 21 kap 7 §"
      lawAbbrev = explicitMatch[1].toLowerCase();
      chapter = parseInt(explicitMatch[2], 10);
      paragraph = explicitMatch[3] ? parseInt(explicitMatch[3], 10) : undefined;
    } else {
      // Format: "21 kap 7 § OSL"
      lawAbbrev = explicitReversedMatch![3].toLowerCase();
      chapter = parseInt(explicitReversedMatch![1], 10);
      paragraph = explicitReversedMatch![2] ? parseInt(explicitReversedMatch![2], 10) : undefined;
    }

    const lawInfo = SWEDISH_LAW_ABBREVIATIONS[lawAbbrev];

    result.type = 'LEGAL_EXPLICIT';
    result.shouldRetrieve = true;
    result.lawReference = {
      lawAbbrev: lawAbbrev,
      chapter: chapter,
      paragraph: paragraph,
      fullName: lawInfo?.full,
      sfs: lawInfo?.sfs,
    };

    // Bygg expanderad query
    const chapterStr = `${chapter} kap.`;
    const paragraphStr = paragraph ? ` ${paragraph} §` : '';
    const lawName = lawInfo?.full || lawAbbrev.toUpperCase();
    result.expandedQuery = `${lawName} ${chapterStr}${paragraphStr}`;

    if (lawInfo) {
      result.entities.lawNames.push(lawInfo.full);
      if (lawInfo.sfs) result.entities.sfsNumbers.push(lawInfo.sfs);
      result.expandedTerms.push(lawInfo.full);
    }
    result.confidence = 0.95;
    return result;
  }

  // 4. Check for AMBIGUOUS law queries (e.g., "RF om SFS")
  const ambiguousMatch = trimmed.match(AMBIGUOUS_LAW_PATTERN);
  if (ambiguousMatch) {
    const lawAbbrev = ambiguousMatch[1].toLowerCase();
    const lawInfo = SWEDISH_LAW_ABBREVIATIONS[lawAbbrev];

    result.type = 'LEGAL_AMBIGUOUS';
    result.shouldRetrieve = false;  // Don't retrieve until clarified
    result.clarificationNeeded = `Din fråga om ${lawInfo?.full || lawAbbrev.toUpperCase()} är lite otydlig. Kan du förtydliga vad du vill veta? Till exempel:\n• Vilken specifik paragraf eller kapitel?\n• Vad är din fråga om bestämmelsen?`;
    result.confidence = 0.6;
    return result;
  }

  // 5. Check for pure abbreviation (e.g., "TF?", "OSL?")
  const abbrevMatch = trimmed.match(PURE_ABBREVIATION_PATTERN);
  if (abbrevMatch) {
    const abbrev = abbrevMatch[1].toLowerCase();
    const lawInfo = SWEDISH_LAW_ABBREVIATIONS[abbrev];

    if (lawInfo) {
      result.type = 'LEGAL_QUERY';
      result.shouldRetrieve = true;
      result.expandedQuery = `Vad säger ${lawInfo.full} (${lawInfo.sfs || abbrev.toUpperCase()})? ${lawInfo.description}`;
      result.entities.lawNames.push(lawInfo.full);
      if (lawInfo.sfs) result.entities.sfsNumbers.push(lawInfo.sfs);
      result.expandedTerms.push(lawInfo.full);
      result.confidence = 0.9;
      return result;
    } else {
      // Unknown abbreviation
      result.type = 'ABBREVIATION';
      result.shouldRetrieve = false;
      result.clarificationNeeded = `Förkortningen "${abbrev.toUpperCase()}" känns inte igen. Kan du förtydliga vad du menar?`;
      result.confidence = 0.7;
      return result;
    }
  }

  // 6. Check for legal indicators and expand abbreviations
  const hasLegalIndicator = LEGAL_INDICATORS.some(p => p.test(trimmed));
  const { expanded, foundAbbreviations } = expandAbbreviations(trimmed);
  
  if (hasLegalIndicator || foundAbbreviations.length > 0) {
    result.type = 'LEGAL_QUERY';
    result.shouldRetrieve = true;
    result.expandedQuery = expanded !== trimmed ? expanded : undefined;
    result.confidence = hasLegalIndicator ? 0.9 : 0.7;
    
    // Extract entities
    foundAbbreviations.forEach(abbrev => {
      const info = SWEDISH_LAW_ABBREVIATIONS[abbrev];
      if (info) {
        result.entities.lawNames.push(info.full);
        if (info.sfs) result.entities.sfsNumbers.push(info.sfs);
        result.expandedTerms.push(info.full);
      }
    });
  }

  // 5. Extract SFS numbers from query
  const sfsMatches = trimmed.match(/\b(\d{4}:\d+)\b/g);
  if (sfsMatches) {
    result.entities.sfsNumbers.push(...sfsMatches);
    result.type = 'LEGAL_QUERY';
    result.confidence = Math.max(result.confidence, 0.85);
  }

  // 6. Extract years
  const yearMatches = trimmed.match(/\b(19\d{2}|20[0-2]\d)\b/g);
  if (yearMatches) {
    result.entities.years.push(...yearMatches.map(Number));
  }

  // 7. Default to UNKNOWN (will use RAG)
  if (result.type === 'UNKNOWN') {
    result.shouldRetrieve = true;
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function expandAbbreviations(query: string): { expanded: string; foundAbbreviations: string[] } {
  let expanded = query;
  const foundAbbreviations: string[] = [];

  // Sort by length descending to match longer abbreviations first
  const sortedAbbrevs = Object.entries(SWEDISH_LAW_ABBREVIATIONS)
    .sort((a, b) => b[0].length - a[0].length);

  for (const [abbrev, info] of sortedAbbrevs) {
    // Match whole word only (with optional punctuation)
    const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
    if (regex.test(expanded)) {
      foundAbbreviations.push(abbrev);
      // Replace with full name
      expanded = expanded.replace(regex, `${info.full} (${abbrev.toUpperCase()})`);
    }
  }

  return { expanded, foundAbbreviations };
}

// ═══════════════════════════════════════════════════════════════════════════
// CHAT RESPONSES - MOVED TO LLM
// ═══════════════════════════════════════════════════════════════════════════
//
// Tidigare hade vi hardcoded response-funktioner här:
// - getSmallTalkResponse()
// - getSystemMetaResponse()
// - getMetaCapabilitiesResponse()
// - getFeedbackResponse()
// - getTaskHelpResponse()
//
// Dessa är nu ersatta med LLM-genererade svar via:
// - lib/orchestration/chat-profiles.ts (profiler per QueryType)
// - lib/api.ts generateChatResponse() (LLM-anrop)
//
// Detta ger varierade, naturliga svar istället för identiska statiska strängar.
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY: Get search query for ChromaDB
// ═══════════════════════════════════════════════════════════════════════════

export function getOptimalSearchQuery(analysis: QueryAnalysis, originalQuery: string): string {
  // If we have an expanded query, use it
  if (analysis.expandedQuery) {
    return analysis.expandedQuery;
  }
  
  // If we extracted law names, prioritize them
  if (analysis.entities.lawNames.length > 0) {
    const lawNames = analysis.entities.lawNames.join(' ');
    return `${originalQuery} ${lawNames}`;
  }
  
  // If we have SFS numbers, add them
  if (analysis.entities.sfsNumbers.length > 0) {
    return `${originalQuery} ${analysis.entities.sfsNumbers.join(' ')}`;
  }
  
  return originalQuery;
}
