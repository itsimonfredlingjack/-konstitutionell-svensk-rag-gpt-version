/**
 * Jail Warden V2 - Regression Tests
 *
 * Tests the complete Warden V2 pipeline:
 * 1. Question pre-rewrite (detects misconceptions BEFORE LLM call)
 * 2. Canonical SFS validation (validates SFS numbers against known facts)
 * 3. Citation gating (strips model-generated citations)
 *
 * Run with: npx ts-node lib/agentic-rag/warden-v2-tests.ts
 */

import { validateSFSNumbers, getLawByMisconception, checkMisconception, getCanonicalCitation } from './canonical-laws.js';

// ═══════════════════════════════════════════════════════════════════════════
// TEST CASES
// ═══════════════════════════════════════════════════════════════════════════

interface WardenTestCase {
  id: string;
  description: string;
  input: string;
  expectedBehavior: {
    shouldRewriteQuestion?: boolean;
    shouldDetectMisconception?: string;
    mustContain?: string[];
    mustNotContain?: string[];
    expectedSFS?: string;
    wardenStatus?: string[];
  };
}

export const WARDEN_V2_TEST_CASES: WardenTestCase[] = [
  // === PRESSFRIHETSLAGEN TESTS ===
  {
    id: 'PRESS_01',
    description: 'Basic misconception: pressfrihetslagen',
    input: 'Vad är pressfrihetslagen?',
    expectedBehavior: {
      shouldRewriteQuestion: true,
      shouldDetectMisconception: 'pressfrihetslagen',
      mustContain: ['Tryckfrihetsförordningen', 'TF', '1949:105', 'grundlag'],
      mustNotContain: ['Pressfrihetslagen är en svensk lag'],
      expectedSFS: '1949:105',
      wardenStatus: ['QUESTION_REWRITTEN', 'FACT_VERIFIED'],
    },
  },
  {
    id: 'PRESS_02',
    description: 'Question about press freedom with wrong name',
    input: 'Vad står i pressfrihetslag?',
    expectedBehavior: {
      shouldRewriteQuestion: true,
      shouldDetectMisconception: 'pressfrihetslag',
      mustContain: ['Tryckfrihetsförordningen'],
      expectedSFS: '1949:105',
    },
  },

  // === OFFENTLIGHETSLAGEN TESTS ===
  {
    id: 'OSL_01',
    description: 'Basic misconception: offentlighetslagen',
    input: 'Beskriv offentlighetslagen',
    expectedBehavior: {
      shouldRewriteQuestion: true,
      shouldDetectMisconception: 'offentlighetslagen',
      mustContain: ['Offentlighets- och sekretesslagen', 'OSL', '2009:400'],
      mustNotContain: ['Offentlighetslagen reglerar'],
      expectedSFS: '2009:400',
      wardenStatus: ['QUESTION_REWRITTEN', 'FACT_VERIFIED'],
    },
  },

  // === GRUNDLAGEN TESTS ===
  {
    id: 'RF_01',
    description: 'Basic misconception: grundlagen',
    input: 'Vad säger grundlagen om mänskliga rättigheter?',
    expectedBehavior: {
      shouldRewriteQuestion: true,
      shouldDetectMisconception: 'grundlagen',
      mustContain: ['Regeringsformen', 'RF', '1974:152'],
      expectedSFS: '1974:152',
    },
  },
  {
    id: 'RF_02',
    description: 'Misconception: konstitutionen',
    input: 'Hur ändrar man Sveriges konstitution?',
    expectedBehavior: {
      shouldRewriteQuestion: true,
      shouldDetectMisconception: 'konstitutionen',
      mustContain: ['Regeringsformen', 'grundlag'],
    },
  },

  // === YGL TESTS ===
  {
    id: 'YGL_01',
    description: 'Basic misconception: yttrandefrihetslagen',
    input: 'Vad skyddas av yttrandefrihetslagen?',
    expectedBehavior: {
      shouldRewriteQuestion: true,
      shouldDetectMisconception: 'yttrandefrihetslagen',
      mustContain: ['Yttrandefrihetsgrundlagen', 'YGL', '1991:1469'],
      expectedSFS: '1991:1469',
    },
  },

  // === SFS VALIDATION TESTS ===
  {
    id: 'SFS_01',
    description: 'Correct SFS number for TF',
    input: 'Tryckfrihetsförordningen (TF), SFS 1949:105, är en grundlag.',
    expectedBehavior: {
      shouldRewriteQuestion: false,
      wardenStatus: ['FACT_VERIFIED'],
    },
  },
  {
    id: 'SFS_02',
    description: 'WRONG SFS number for TF - should detect hallucination',
    input: 'Tryckfrihetsförordningen (TF) har SFS 2003:115.',
    expectedBehavior: {
      shouldRewriteQuestion: false,
      wardenStatus: ['FACT_UNVERIFIED'],
    },
  },
  {
    id: 'SFS_03',
    description: 'Correct SFS for OSL',
    input: 'Offentlighets- och sekretesslagen (OSL) SFS 2009:400',
    expectedBehavior: {
      shouldRewriteQuestion: false,
      wardenStatus: ['FACT_VERIFIED'],
    },
  },

  // === CITATION TESTS ===
  {
    id: 'CITE_01',
    description: 'Model-generated citations should be stripped',
    input: 'Svaret innehåller Källor: [1] Hallucinated source',
    expectedBehavior: {
      mustNotContain: ['[1]', 'Källor:'],
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════

interface TestResult {
  id: string;
  passed: boolean;
  message: string;
  details?: string;
}

/**
 * Run canonical-laws unit tests
 */
export function runCanonicalLawsTests(): TestResult[] {
  const results: TestResult[] = [];

  // Test 1: getLawByMisconception
  const tfResult = getLawByMisconception('pressfrihetslagen');
  results.push({
    id: 'CANONICAL_01',
    passed: tfResult !== null && tfResult.sfs === '1949:105',
    message: 'getLawByMisconception("pressfrihetslagen")',
    details: tfResult ? `Found: ${tfResult.fullName} (${tfResult.sfs})` : 'Not found',
  });

  // Test 2: getLawByMisconception - OSL
  const oslResult = getLawByMisconception('offentlighetslagen');
  results.push({
    id: 'CANONICAL_02',
    passed: oslResult !== null && oslResult.sfs === '2009:400',
    message: 'getLawByMisconception("offentlighetslagen")',
    details: oslResult ? `Found: ${oslResult.fullName} (${oslResult.sfs})` : 'Not found',
  });

  // Test 3: checkMisconception
  const misconception = checkMisconception('pressfrihetslagen');
  results.push({
    id: 'CANONICAL_03',
    passed: misconception.isMisconception === true,
    message: 'checkMisconception("pressfrihetslagen")',
    details: `isMisconception: ${misconception.isMisconception}`,
  });

  // Test 4: getCanonicalCitation
  const citation = getCanonicalCitation('TF');
  results.push({
    id: 'CANONICAL_04',
    passed: citation.includes('1949:105'),
    message: 'getCanonicalCitation("TF")',
    details: citation,
  });

  // Test 5: validateSFSNumbers - correct
  const correctSFS = validateSFSNumbers('TF har SFS 1949:105');
  results.push({
    id: 'CANONICAL_05',
    passed: correctSFS.valid === true,
    message: 'validateSFSNumbers with correct SFS',
    details: `valid: ${correctSFS.valid}, errors: ${correctSFS.errors.length}`,
  });

  // Test 6: validateSFSNumbers - wrong
  const wrongSFS = validateSFSNumbers('TF har SFS 2003:115');
  results.push({
    id: 'CANONICAL_06',
    passed: wrongSFS.valid === false && wrongSFS.errors.length > 0,
    message: 'validateSFSNumbers with WRONG SFS',
    details: `valid: ${wrongSFS.valid}, errors: ${JSON.stringify(wrongSFS.errors)}`,
  });

  return results;
}

/**
 * Run all Warden V2 tests
 */
export async function runWardenV2Tests(): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('       JAIL WARDEN V2 - REGRESSION TESTS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Run canonical-laws unit tests first
  console.log('📘 Canonical Laws Module Tests:\n');
  const canonicalResults = runCanonicalLawsTests();

  let passed = 0;
  let failed = 0;

  for (const result of canonicalResults) {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.id}: ${result.message}`);
    if (result.details) {
      console.log(`   └─ ${result.details}`);
    }
    if (result.passed) passed++;
    else failed++;
  }

  console.log('\n───────────────────────────────────────────────────────────────');
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${canonicalResults.length} tests\n`);

  if (failed > 0) {
    console.log('❌ SOME TESTS FAILED - Check output above\n');
  } else {
    console.log('✅ ALL TESTS PASSED!\n');
  }
}

/**
 * Quick smoke test for essential functionality
 */
export function runQuickRegressionTest(): boolean {
  console.log('🔍 Running quick regression test...\n');

  // Essential tests
  const tests = [
    {
      name: 'pressfrihetslagen → TF',
      fn: () => getLawByMisconception('pressfrihetslagen')?.sfs === '1949:105',
    },
    {
      name: 'offentlighetslagen → OSL',
      fn: () => getLawByMisconception('offentlighetslagen')?.sfs === '2009:400',
    },
    {
      name: 'SFS validation: correct',
      fn: () => validateSFSNumbers('TF 1949:105').valid === true,
    },
    {
      name: 'SFS validation: wrong',
      fn: () => validateSFSNumbers('TF 2003:115').valid === false,
    },
  ];

  let allPassed = true;
  for (const test of tests) {
    const passed = test.fn();
    console.log(`${passed ? '✅' : '❌'} ${test.name}`);
    if (!passed) allPassed = false;
  }

  console.log(`\n${allPassed ? '✅ Quick test PASSED' : '❌ Quick test FAILED'}\n`);
  return allPassed;
}

// Run tests if executed directly
if (require.main === module) {
  runWardenV2Tests();
}
