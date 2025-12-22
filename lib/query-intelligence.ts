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
  | 'SMALLTALK'      // "Hur mår du?", "Vad är du?"
  | 'SYSTEM_META'    // "Vilken modell är du?", "Vad kan du?"
  | 'LEGAL_QUERY'    // "Vad säger TF?", "Vilka lagar..."
  | 'DOCUMENT_QUERY' // "Enligt bifogade dokument..."
  | 'ABBREVIATION'   // "TF?", "OSL?" - needs clarification
  | 'UNKNOWN';       // Default, use RAG

export interface QueryAnalysis {
  type: QueryType;
  shouldRetrieve: boolean;       // Whether to query ChromaDB
  expandedQuery?: string;        // Query with expanded abbreviations
  directResponse?: string;       // For SMALLTALK/SYSTEM_META
  clarificationNeeded?: string;  // For ABBREVIATION
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
    result.directResponse = getSmallTalkResponse(lower);
    result.confidence = 0.95;
    return result;
  }

  // 2. Check for SYSTEM_META
  if (SYSTEM_META_PATTERNS.some(p => p.test(trimmed))) {
    result.type = 'SYSTEM_META';
    result.shouldRetrieve = false;
    result.directResponse = getSystemMetaResponse(lower);
    result.confidence = 0.95;
    return result;
  }

  // 3. Check for pure abbreviation (e.g., "TF?", "OSL?")
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

  // 4. Check for legal indicators and expand abbreviations
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

function getSmallTalkResponse(query: string): string {
  if (/hur (mår|går det)/.test(query)) {
    return 'Jag är en AI-assistent så jag har inga känslor, men jag är redo att hjälpa dig med frågor om svensk lagstiftning och myndighetsdokument!';
  }
  if (/hej|hallå|tjena/.test(query)) {
    return 'Hej! Jag är Constitutional-GPT, en AI specialiserad på svenska myndighetsdokument. Vad kan jag hjälpa dig med?';
  }
  if (/tack/.test(query)) {
    return 'Varsågod! Har du fler frågor om svensk lagstiftning?';
  }
  if (/adjö|hejdå/.test(query)) {
    return 'Hejdå! Välkommen tillbaka om du har fler frågor.';
  }
  if (/vad heter|vem är/.test(query)) {
    return 'Jag heter Constitutional-GPT och är en AI-assistent specialiserad på svenska myndighetsdokument och lagstiftning.';
  }
  return 'Hej! Hur kan jag hjälpa dig med frågor om svensk lagstiftning?';
}

function getSystemMetaResponse(query: string): string {
  if (/modell|llm|ai/.test(query)) {
    return 'Jag är Constitutional-GPT, byggd på GPT-OSS 20B-modellen via llama-server. Jag är specialiserad på svenska myndighetsdokument och har tillgång till över 535 000 dokument från riksdagen och andra myndigheter via ChromaDB.';
  }
  if (/vad kan du/.test(query)) {
    return 'Jag kan hjälpa dig med:\n• Frågor om svensk lagstiftning (TF, RF, YGL, OSL, etc.)\n• Söka i riksdagsdokument (propositioner, motioner, betänkanden)\n• Förklara juridiska begrepp\n• Hitta relevanta SFS-nummer och lagrum';
  }
  if (/hur fungerar/.test(query)) {
    return 'Jag använder Agentic RAG (Retrieval-Augmented Generation):\n1. Din fråga analyseras och expanderas\n2. Relevanta dokument hämtas från ChromaDB (535K+ dokument)\n3. GPT-OSS 20B genererar ett svar baserat på dokumenten\n4. Jail Warden v2 validerar svaret mot källorna';
  }
  if (/constitutional/.test(query)) {
    return 'Constitutional-GPT är ett AI-system för svenska myndighetsdokument. Namnet kommer från att systemet innehåller Sveriges grundlagar och fokuserar på konstitutionell rätt. Jag har tillgång till riksdagsdokument, propositioner, betänkanden och annan offentlig information.';
  }
  return 'Jag är Constitutional-GPT, en AI-assistent för svenska myndighetsdokument. Fråga mig om svensk lagstiftning!';
}

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
