/**
 * BM25 Hybrid Search - Kombinerar semantisk sökning med keyword-baserad BM25
 *
 * Fördelar:
 * - BM25 hittar exakta juridiska termer (SFS, lagnamn, förkortningar)
 * - Semantisk sökning hittar koncept och synonymer
 * - Hybrid = bäst av båda världar
 *
 * Fusion-metod: RRF (Reciprocal Rank Fusion) för stabilare ranking
 * RRF = 1/(k + rank_semantic) + 1/(k + rank_bm25)
 *
 * Hard Filtering: För LEGAL_EXPLICIT queries används metadata-filter
 * för att begränsa sökning till specifik lag + kapitel.
 */

import type { QueryAnalysis, LawReference } from '../query-intelligence';

// ═══════════════════════════════════════════════════════════════════════════
// BM25 & RRF CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const BM25_CONFIG = {
  k1: 1.5,    // Term frequency saturation (1.2-2.0 typical)
  b: 0.75,   // Length normalization (0.75 is standard)
};

const RRF_CONFIG = {
  k: 60,     // RRF konstant (60 är standard, lägre = mer vikt på toppresultat)
  enabled: true,  // Använd RRF istället för viktad genomsnitt
};

const HYBRID_WEIGHTS = {
  bm25: 0.3,
  semantic: 0.7,
};

// Reranker configuration (Fix 4: 100-200 kandidater, rerank 50-100, prompt top 12-20)
const RERANKER_CONFIG = {
  enabled: true,
  endpoint: 'http://localhost:8000/api/constitutional/rerank',
  fetchK: 150,     // Hämta 150 kandidater från semantisk sökning
  rerankK: 75,     // Skicka top-75 till reranker
  returnK: 15,     // Returnera top-15 till LLM-prompt
};

// Swedish stop words for BM25
const SWEDISH_STOP_WORDS = new Set([
  'och', 'att', 'som', 'för', 'på', 'av', 'med', 'en', 'ett', 'den', 'det',
  'är', 'var', 'ska', 'kan', 'om', 'till', 'från', 'i', 'har', 'de', 'vi',
  'du', 'han', 'hon', 'sig', 'sin', 'sina', 'detta', 'dessa', 'hur', 'vad',
  'vilka', 'vilken', 'vilket', 'när', 'där', 'här', 'efter', 'innan', 'under',
  'över', 'mellan', 'vid', 'mot', 'genom', 'utan', 'inom', 'enligt', 'samt',
  'eller', 'men', 'så', 'om', 'än', 'bara', 'även', 'dock', 'redan', 'också',
  'endast', 'själv', 'andra', 'annan', 'annat', 'samma', 'egen', 'eget', 'egna',
]);

// Swedish legal terms to BOOST (never remove, increase weight)
const SWEDISH_LEGAL_BOOST_TERMS = new Set([
  'sfs', 'prop', 'bet', 'sou', 'ds', 'rf', 'osl', 'tf', 'ygl', 'rl', 'bl',
  'lag', 'förordning', 'paragraf', 'kapitel', 'stycke', 'punkt', 'moment',
  'riksdag', 'regering', 'myndighet', 'domstol', 'kammarrätt', 'hovrätt',
  'tingsrätt', 'förvaltningsrätt', 'högsta', 'proposition', 'motion',
  'utskott', 'betänkande', 'utredning', 'remiss', 'yttrande',
]);

// ═══════════════════════════════════════════════════════════════════════════
// BM25 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface BM25Document {
  id: string;
  title: string;
  content: string;
  terms: string[];        // Tokenized and normalized terms
  termFreq: Map<string, number>;  // Term frequencies
  length: number;         // Number of terms
}

export interface BM25Index {
  documents: BM25Document[];
  avgDocLength: number;
  docFreq: Map<string, number>;  // Document frequency per term
  totalDocs: number;
}

export interface HybridSearchResult {
  id: string;
  title: string;
  content: string;
  preview: string;
  bm25Score: number;
  semanticScore: number;
  hybridScore: number;
  rrfScore?: number;           // RRF fusion score
  rerankerScore?: number;      // Cross-encoder reranker score
  semanticRank?: number;       // Rank i semantisk sökning
  bm25Rank?: number;           // Rank i BM25 sökning
  source?: string;
  docType?: string;
  year?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// TOKENIZATION & NORMALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tokenize and normalize Swedish text for BM25
 */
export function tokenize(text: string): string[] {
  if (!text) return [];

  // Convert to lowercase
  let normalized = text.toLowerCase();

  // Preserve Swedish legal references (SFS numbers, etc.)
  // Replace with placeholders to avoid splitting
  const sfsPattern = /(\d{4}:\d+)/g;
  const sfsMatches: string[] = [];
  normalized = normalized.replace(sfsPattern, (match) => {
    sfsMatches.push(`sfs_${match.replace(':', '_')}`);
    return `__SFS_${sfsMatches.length - 1}__`;
  });

  // Split on non-word characters
  const tokens = normalized
    .split(/[^\wåäöÅÄÖ_]+/)
    .filter(t => t.length > 1)
    .map(t => {
      // Restore SFS placeholders
      const sfsMatch = t.match(/__SFS_(\d+)__/);
      if (sfsMatch) {
        return sfsMatches[parseInt(sfsMatch[1])];
      }
      return t;
    });

  // Filter stop words but KEEP legal terms
  const filteredTokens = tokens.filter(t => {
    if (SWEDISH_LEGAL_BOOST_TERMS.has(t)) return true;
    if (t.startsWith('sfs_')) return true;  // Keep SFS numbers
    if (SWEDISH_STOP_WORDS.has(t)) return false;
    return t.length > 2;  // Minimum 3 chars
  });

  return filteredTokens;
}

/**
 * Simple Swedish stemmer (basic suffix removal)
 */
function stem(word: string): string {
  // Very basic Swedish stemming - just remove common suffixes
  const suffixes = ['arna', 'erna', 'orna', 'ande', 'ingar', 'ning', 'tion', 'het', 'lig', 'iskt', 'isk', 'ar', 'er', 'or', 'en', 'et', 'na', 'a', 's'];

  for (const suffix of suffixes) {
    if (word.length > suffix.length + 3 && word.endsWith(suffix)) {
      return word.slice(0, -suffix.length);
    }
  }

  return word;
}

// ═══════════════════════════════════════════════════════════════════════════
// BM25 INDEX
// ═══════════════════════════════════════════════════════════════════════════

// In-memory cache for BM25 index (built from semantic search results)
let bm25Cache: BM25Index | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Build BM25 index from documents
 */
export function buildBM25Index(documents: Array<{ id: string; title: string; content: string }>): BM25Index {
  const bm25Docs: BM25Document[] = [];
  const docFreq = new Map<string, number>();
  let totalLength = 0;

  for (const doc of documents) {
    // Combine title and content for better matching
    const fullText = `${doc.title} ${doc.title} ${doc.content}`; // Title weighted 2x
    const terms = tokenize(fullText).map(stem);

    // Calculate term frequencies
    const termFreq = new Map<string, number>();
    for (const term of terms) {
      termFreq.set(term, (termFreq.get(term) || 0) + 1);
    }

    // Update document frequencies
    const uniqueTerms = new Set(terms);
    for (const term of uniqueTerms) {
      docFreq.set(term, (docFreq.get(term) || 0) + 1);
    }

    bm25Docs.push({
      id: doc.id,
      title: doc.title,
      content: doc.content,
      terms,
      termFreq,
      length: terms.length,
    });

    totalLength += terms.length;
  }

  return {
    documents: bm25Docs,
    avgDocLength: totalLength / Math.max(documents.length, 1),
    docFreq,
    totalDocs: documents.length,
  };
}

/**
 * Calculate BM25 score for a query against a document
 */
export function calculateBM25Score(
  query: string,
  doc: BM25Document,
  index: BM25Index
): number {
  const queryTerms = tokenize(query).map(stem);
  const { k1, b } = BM25_CONFIG;
  let score = 0;

  for (const term of queryTerms) {
    // Term frequency in document
    const tf = doc.termFreq.get(term) || 0;
    if (tf === 0) continue;

    // Inverse document frequency
    const df = index.docFreq.get(term) || 0;
    const idf = Math.log((index.totalDocs - df + 0.5) / (df + 0.5) + 1);

    // BM25 term score with length normalization
    const lengthNorm = 1 - b + b * (doc.length / index.avgDocLength);
    const tfNorm = (tf * (k1 + 1)) / (tf + k1 * lengthNorm);

    // Boost legal terms
    const boostFactor = SWEDISH_LEGAL_BOOST_TERMS.has(term) ? 2.0 : 1.0;

    score += idf * tfNorm * boostFactor;
  }

  return score;
}

// ═══════════════════════════════════════════════════════════════════════════
// HYBRID SEARCH WITH RRF
// ═══════════════════════════════════════════════════════════════════════════

const BACKEND_URL = 'http://localhost:8000';

/**
 * Calculate Reciprocal Rank Fusion score
 * RRF(d) = Σ 1/(k + rank_i(d)) för varje rankinglista i
 */
function calculateRRF(semanticRank: number, bm25Rank: number, k: number = RRF_CONFIG.k): number {
  return (1 / (k + semanticRank)) + (1 / (k + bm25Rank));
}

/**
 * Hard filter configuration for LEGAL_EXPLICIT queries
 */
interface LawFilter {
  kortnamn?: string;     // Law abbreviation (OSL, TF, RF, etc.)
  kapitel?: number;      // Chapter number
  paragraf?: number;     // Paragraph number
}

/**
 * Perform hybrid search combining BM25 and semantic search with RRF fusion
 *
 * @param query - Search query
 * @param options - Search options including hard filters for LEGAL_EXPLICIT queries
 */
export async function hybridSearch(
  query: string,
  options: {
    limit?: number;
    docType?: string;
    year?: number;
    bm25Weight?: number;
    semanticWeight?: number;
    useRRF?: boolean;
    useReranker?: boolean;
    lawReference?: LawReference;  // Hard filter for LEGAL_EXPLICIT queries
  } = {}
): Promise<HybridSearchResult[]> {
  const {
    limit = 10,
    docType,
    year,
    bm25Weight = HYBRID_WEIGHTS.bm25,
    semanticWeight = HYBRID_WEIGHTS.semantic,
    useRRF = RRF_CONFIG.enabled,
    useReranker = RERANKER_CONFIG.enabled,
    lawReference,
  } = options;

  const fusionMethod = useRRF ? 'RRF' : 'Weighted';
  const hasLawFilter = lawReference?.lawAbbrev;
  const filterInfo = hasLawFilter
    ? ` [FILTER: ${lawReference.lawAbbrev.toUpperCase()}${lawReference.chapter ? ` kap ${lawReference.chapter}` : ''}${lawReference.paragraph ? ` § ${lawReference.paragraph}` : ''}]`
    : '';
  console.log(`🔀 hybrid_search: "${query}" (${fusionMethod}, reranker: ${useReranker})${filterInfo}`);

  // 1. Get MORE semantic results for RRF/Reranking (based on config)
  const candidateLimit = useReranker ? RERANKER_CONFIG.fetchK : (useRRF ? 100 : Math.min(limit * 3, 30));

  // Build law filter for LEGAL_EXPLICIT queries
  const lawFilter: LawFilter | undefined = lawReference?.lawAbbrev
    ? {
        kortnamn: lawReference.lawAbbrev.toUpperCase(),
        kapitel: lawReference.chapter,
        paragraf: lawReference.paragraph,
      }
    : undefined;

  const semanticResults = await semanticSearch(query, {
    limit: candidateLimit,
    docType,
    year,
    lawFilter,  // Pass hard filter to ChromaDB
  });

  if (semanticResults.length === 0) {
    console.log('   → Inga semantiska träffar');
    return [];
  }

  // 2. Build BM25 index from semantic results
  const index = buildBM25Index(semanticResults.map(r => ({
    id: r.id,
    title: r.title,
    content: r.content || r.preview || '',
  })));

  // 3. Calculate BM25 scores for all documents
  const docsWithScores = index.documents.map((doc, i) => {
    const semanticResult = semanticResults[i];
    const bm25Score = calculateBM25Score(query, doc, index);
    return {
      doc,
      semanticResult,
      bm25Score,
      semanticScore: semanticResult.score || 0,
    };
  });

  // 4. Create ranked lists for RRF
  // Semantic ranking (already sorted from API, but let's be explicit)
  const semanticRanked = [...docsWithScores].sort((a, b) => b.semanticScore - a.semanticScore);
  const semanticRankMap = new Map(semanticRanked.map((d, i) => [d.doc.id, i + 1])); // 1-indexed

  // BM25 ranking
  const bm25Ranked = [...docsWithScores].sort((a, b) => b.bm25Score - a.bm25Score);
  const bm25RankMap = new Map(bm25Ranked.map((d, i) => [d.doc.id, i + 1])); // 1-indexed

  // Normalize BM25 scores to 0-1
  const maxBM25 = Math.max(...docsWithScores.map(d => d.bm25Score), 0.001);

  // 5. Calculate final scores (RRF or weighted)
  const scoredResults: HybridSearchResult[] = docsWithScores.map(({ doc, semanticResult, bm25Score, semanticScore }) => {
    const normalizedBM25 = bm25Score / maxBM25;
    const semanticRank = semanticRankMap.get(doc.id) || semanticRanked.length;
    const bm25Rank = bm25RankMap.get(doc.id) || bm25Ranked.length;

    // Choose fusion method
    let hybridScore: number;
    let rrfScore: number | undefined;

    if (useRRF) {
      rrfScore = calculateRRF(semanticRank, bm25Rank);
      hybridScore = rrfScore; // RRF score is the primary score
    } else {
      hybridScore = (normalizedBM25 * bm25Weight) + (semanticScore * semanticWeight);
    }

    return {
      id: doc.id,
      title: doc.title,
      content: doc.content,
      preview: doc.content.substring(0, 300),
      bm25Score: normalizedBM25,
      semanticScore,
      hybridScore,
      rrfScore,
      semanticRank,
      bm25Rank,
      source: semanticResult.source,
      docType: semanticResult.docType,
      year: semanticResult.year,
    };
  });

  // 6. Sort by hybrid/RRF score
  scoredResults.sort((a, b) => b.hybridScore - a.hybridScore);

  // 7. Optional: Apply cross-encoder reranker on top-K
  let finalResults: HybridSearchResult[];

  if (useReranker) {
    // Take top rerankK for reranking, return top returnK
    const topForReranking = scoredResults.slice(0, RERANKER_CONFIG.rerankK);
    finalResults = await applyReranker(query, topForReranking, RERANKER_CONFIG.returnK);
  } else {
    finalResults = scoredResults.slice(0, limit);
  }

  // 8. Log results
  console.log(`   → ${finalResults.length} resultat (${fusionMethod}${useReranker ? ' + reranker' : ''})`);
  if (finalResults.length > 0) {
    const top = finalResults[0];
    const scoreInfo = useRRF
      ? `RRF: ${top.rrfScore?.toFixed(4)}, semRank: ${top.semanticRank}, bm25Rank: ${top.bm25Rank}`
      : `hybrid: ${top.hybridScore.toFixed(3)}`;
    console.log(`   → Topp: "${top.title.substring(0, 40)}..." (${scoreInfo})`);
  }

  return finalResults;
}

/**
 * Apply cross-encoder reranker via backend API
 * Falls back to original ranking if reranker fails
 */
async function applyReranker(
  query: string,
  docs: HybridSearchResult[],
  topK: number
): Promise<HybridSearchResult[]> {
  try {
    const response = await fetch(RERANKER_CONFIG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        documents: docs.map(d => ({
          id: d.id,
          title: d.title,
          content: d.content,
        })),
        top_k: topK,
      }),
    });

    if (!response.ok) {
      console.warn(`⚠️ Reranker failed (${response.status}), using RRF ranking`);
      return docs.slice(0, topK);
    }

    const reranked = await response.json();

    // Map reranker results back to full HybridSearchResult objects
    const docMap = new Map(docs.map(d => [d.id, d]));
    const results: HybridSearchResult[] = [];

    for (const item of reranked.results || []) {
      const original = docMap.get(item.id);
      if (original) {
        results.push({
          ...original,
          rerankerScore: item.score,
          hybridScore: item.score, // Reranker score becomes primary
        });
      }
    }

    console.log(`   → Reranker: ${results.length} docs reranked`);
    return results.slice(0, topK);

  } catch (error) {
    console.warn('⚠️ Reranker error, using RRF ranking:', error);
    return docs.slice(0, topK);
  }
}

/**
 * Perform semantic search via backend
 * Supports hard filtering by law (kortnamn) and chapter (kapitel) for LEGAL_EXPLICIT queries
 */
async function semanticSearch(
  query: string,
  options: {
    limit: number;
    docType?: string;
    year?: number;
    lawFilter?: LawFilter;  // Hard filter for specific law/chapter
  }
): Promise<Array<{
  id: string;
  title: string;
  content: string;
  preview: string;
  score: number;
  source?: string;
  docType?: string;
  year?: number;
}>> {
  try {
    const filters: any = {};
    if (options.docType) filters.doc_type = options.docType.toLowerCase();
    if (options.year) filters.date_from = `${options.year}-01-01`;

    // Apply hard law filter for LEGAL_EXPLICIT queries
    // This ensures only documents from the specific law/chapter are returned
    if (options.lawFilter) {
      if (options.lawFilter.kortnamn) {
        filters.kortnamn = options.lawFilter.kortnamn;
      }
      if (options.lawFilter.kapitel !== undefined) {
        filters.kapitel = options.lawFilter.kapitel;
      }
      if (options.lawFilter.paragraf !== undefined) {
        filters.paragraf = options.lawFilter.paragraf;
      }
      console.log(`   → Hard filter applied: ${JSON.stringify(options.lawFilter)}`);
    }

    const response = await fetch(`${BACKEND_URL}/api/constitutional/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        limit: options.limit,
        page: 1,
        sort: 'relevance',
        filters: Object.keys(filters).length > 0 ? filters : undefined,
      }),
    });

    if (!response.ok) {
      console.error(`Semantic search failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return (data.results || []).map((item: any, idx: number) => ({
      id: item.id || `result-${idx}`,
      title: item.title || 'Untitled',
      content: item.content || item.snippet || '',
      preview: item.snippet || item.content?.substring(0, 300) || '',
      score: item.score || 0,
      source: item.source || item.doc_type || 'Unknown',
      docType: item.doc_type,
      year: item.year,
    }));
  } catch (error) {
    console.error('Semantic search error:', error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a query benefits from BM25 (contains specific terms)
 */
export function shouldUseBM25(query: string): boolean {
  const terms = tokenize(query);

  // Check for legal terms, SFS numbers, abbreviations
  const hasLegalTerm = terms.some(t =>
    SWEDISH_LEGAL_BOOST_TERMS.has(t) ||
    t.startsWith('sfs_') ||
    /^\d{4}:\d+$/.test(t) ||
    /^[A-ZÅÄÖ]{2,5}$/.test(t)  // Abbreviations like RF, OSL, TF
  );

  return hasLegalTerm;
}

/**
 * Get recommended weights based on query type
 */
export function getRecommendedWeights(query: string): { bm25: number; semantic: number } {
  const terms = tokenize(query);

  // Count legal/specific terms
  const legalTermCount = terms.filter(t =>
    SWEDISH_LEGAL_BOOST_TERMS.has(t) ||
    t.startsWith('sfs_') ||
    /^\d{4}:\d+$/.test(t)
  ).length;

  // More legal terms = more BM25 weight
  if (legalTermCount >= 2) {
    return { bm25: 0.5, semantic: 0.5 };  // Equal weight for highly specific queries
  } else if (legalTermCount === 1) {
    return { bm25: 0.4, semantic: 0.6 };  // Slight BM25 boost
  }

  // Default: favor semantic for conceptual queries
  return { bm25: 0.3, semantic: 0.7 };
}

export { HYBRID_WEIGHTS, RRF_CONFIG, RERANKER_CONFIG, SWEDISH_LEGAL_BOOST_TERMS };
