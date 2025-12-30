#!/usr/bin/env node
/**
 * Acceptance Tests A-E for Constitutional-GPT
 * Tests the query routing logic directly
 */

// Patterns from query-intelligence.ts
const META_CAPABILITIES_PATTERNS = [
  /vad kan du (hjälpa|göra|bistå)/i,
  /vad har du för (funktioner|möjligheter|kapacitet)/i,
  /hur (kan du hjälpa|funkar du|fungerar detta)/i,
  /vad är du (bra på|kapabel till)/i,
  /vilka frågor kan (du|jag ställa)/i,
  /vad (klarar|kan) du (av)?/i,
  /berätta (vad du|om dina) (kan|funktioner)/i,
];

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

const INCOMPLETE_INPUT_PATTERNS = [
  /^(vad|hur|var|när|vem|vilka?)[\s?!]*$/i,
  /^(ja|nej|ok|okej|mm|hmm|jo)[\s?!]*$/i,
  /^\.{2,}$/,
  /^[\s?!]+$/,
  /^(eh|öh|ähm?|hmm)[\s?!]*$/i,
];

const VAGUE_QUERY_PATTERNS = [
  /jag (har|undrar|funderar) (frågor?|funderingar?|tankar?) (om|kring|angående)/i,
  /jag vill (veta mer|lära mig|förstå) om/i,
  /berätta (om|lite om|något om)\s+\w+/i,
  /kan du förklara\s+\w+[\s?]*$/i,
  /^(vad är|vad innebär)\s+\w{2,5}[\s?]*$/i,
];

const EXPLICIT_LAW_PATTERN = /\b(osl|osfl|tf|rf|ygl|brb|rb|jb|äb|fb|mb|pbl|fl|kl|sol|hsl|lss|las|mbl|aml|lvu|lvm|lul|sfb|afl|lou|lob|gdpr|ro|so)\s*(\d{1,3})\s*(?:kap(?:itel)?\.?|:)\s*(\d{1,3})?\s*(§|para(?:graf)?)?/i;

const CHAT_MODE_TYPES = [
  'SMALLTALK', 'SYSTEM_META', 'META_CAPABILITIES', 'FEEDBACK',
  'TASK_HELP', 'INCOMPLETE_INPUT', 'VAGUE_QUERY', 'LEGAL_AMBIGUOUS', 'ABBREVIATION'
];

const EVIDENCE_MODE_TYPES = ['LEGAL_EXPLICIT'];

function analyzeQuery(query) {
  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();

  // META_CAPABILITIES
  if (META_CAPABILITIES_PATTERNS.some(p => p.test(trimmed))) {
    return { type: 'META_CAPABILITIES', shouldRetrieve: false };
  }

  // FEEDBACK
  if (FEEDBACK_PATTERNS.some(p => p.test(trimmed))) {
    return { type: 'FEEDBACK', shouldRetrieve: false };
  }

  // INCOMPLETE_INPUT - before abbreviation check
  if (INCOMPLETE_INPUT_PATTERNS.some(p => p.test(trimmed))) {
    return { type: 'INCOMPLETE_INPUT', shouldRetrieve: false };
  }

  // VAGUE_QUERY
  if (VAGUE_QUERY_PATTERNS.some(p => p.test(trimmed))) {
    return { type: 'VAGUE_QUERY', shouldRetrieve: false };
  }

  // LEGAL_EXPLICIT - specific law reference
  if (EXPLICIT_LAW_PATTERN.test(trimmed)) {
    return { type: 'LEGAL_EXPLICIT', shouldRetrieve: true };
  }

  // Default: LEGAL_QUERY (ASSIST mode)
  return { type: 'LEGAL_QUERY', shouldRetrieve: true };
}

function determineMode(type, shouldRetrieve) {
  if (CHAT_MODE_TYPES.includes(type)) return 'CHAT';
  if (EVIDENCE_MODE_TYPES.includes(type)) return 'EVIDENCE';
  if (!shouldRetrieve) return 'CHAT';
  return 'ASSIST';
}

// Acceptance Tests
const tests = [
  {
    name: "A - Meta-fråga",
    query: "Vad kan du hjälpa till med?",
    expected: { mode: 'CHAT', retrieve: false },
    reason: "CHAT mode, no retrieval"
  },
  {
    name: "B - Incomplete input",
    query: "Vad",
    expected: { mode: 'CHAT', retrieve: false },
    reason: "CHAT mode (INCOMPLETE_INPUT), no retrieval"
  },
  {
    name: "C - Feedback",
    query: "Det är dåligt svar",
    expected: { mode: 'CHAT', retrieve: false },
    reason: "CHAT mode (FEEDBACK), no retrieval"
  },
  {
    name: "D - Legal explicit",
    query: "OSL 21 kap 7 §",
    expected: { mode: 'EVIDENCE', retrieve: true },
    reason: "EVIDENCE mode, with retrieval, citations visible"
  },
  {
    name: "E - Vague query",
    query: "Jag har funderingar om OSL men vet ej vad jag ska fråga",
    expected: { mode: 'CHAT', retrieve: false },
    reason: "CHAT mode (VAGUE_QUERY), no retrieval"
  }
];

console.log("═══════════════════════════════════════════════════════════════");
console.log("  CONSTITUTIONAL-GPT ACCEPTANCE TESTS");
console.log("  Two-model architecture: Gemma 3 (BRAIN) + GPT-SW3 (VOICE)");
console.log("═══════════════════════════════════════════════════════════════");
console.log("");

let passed = 0;
let failed = 0;

for (const test of tests) {
  const analysis = analyzeQuery(test.query);
  const mode = determineMode(analysis.type, analysis.shouldRetrieve);

  const passMode = test.expected.mode === mode;
  const passRetrieval = test.expected.retrieve === analysis.shouldRetrieve;
  const pass = passMode && passRetrieval;

  if (pass) passed++;
  else failed++;

  console.log(`Test ${test.name}:`);
  console.log(`  Query: "${test.query}"`);
  console.log(`  Expected: ${test.reason}`);
  console.log(`  Result: mode=${mode}, type=${analysis.type}, retrieve=${analysis.shouldRetrieve}`);
  console.log(`  ${pass ? "✅ PASS" : "❌ FAIL"}`);
  console.log("");
}

console.log("═══════════════════════════════════════════════════════════════");
console.log(`  RESULTS: ${passed}/${tests.length} tests passed`);
if (passed === tests.length) {
  console.log("  🎉 ALL ACCEPTANCE TESTS PASSED!");
} else {
  console.log(`  ⚠️  ${failed} test(s) failed`);
}
console.log("═══════════════════════════════════════════════════════════════");
console.log("");
console.log("Model Configuration:");
console.log("  BRAIN (Faktasvar): gemma3:12b");
console.log("  VOICE (Svenska): fcole90/ai-sweden-gpt-sw3:6.7b");
console.log("");

process.exit(failed > 0 ? 1 : 0);
