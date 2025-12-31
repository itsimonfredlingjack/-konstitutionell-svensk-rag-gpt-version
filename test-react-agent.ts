/**
 * Test script for ReAct Agent
 *
 * Run with: npx tsx test-react-agent.ts
 */

import { runReactAgent } from './lib/agentic-rag/react-agent';

async function main() {
  console.log('🧪 Testing ReAct Agent with complex query...\n');

  // Complex multi-faceted question that should trigger multiple tool calls
  const testQuestion = 'Vilka regler gäller för bygglov och finns det några undantag för friggebodar?';

  try {
    const response = await runReactAgent(testQuestion);

    console.log('\n\n');
    console.log('═'.repeat(70));
    console.log('📊 TEST RESULTS');
    console.log('═'.repeat(70));
    console.log(`Question: ${response.question}`);
    console.log(`Mode: ${response.mode}`);
    console.log(`Iterations: ${response.iterations}`);
    console.log(`Documents found: ${response.documents_found}`);
    console.log(`Tools used: ${response.tools_used.join(', ')}`);
    console.log(`Confidence: ${response.final_confidence.toFixed(2)}`);
    console.log(`Total time: ${response.total_time_ms}ms`);
    console.log('─'.repeat(70));
    console.log('ANSWER:');
    console.log(response.answer);
    console.log('─'.repeat(70));
    if (response.citations && response.citations.length > 0) {
      console.log('CITATIONS:');
      response.citations.forEach((c, i) => {
        console.log(`  [${i + 1}] ${c.title}${c.sfs ? ` (${c.sfs})` : ''}`);
      });
    }
    if (response.followups && response.followups.length > 0) {
      console.log('FOLLOW-UPS:');
      response.followups.forEach((f, i) => {
        console.log(`  ${i + 1}. ${f}`);
      });
    }
    console.log('═'.repeat(70));

    // Verify expected behavior
    const checks = [
      { name: 'Has answer', pass: response.answer.length > 50 },
      { name: 'Used tools', pass: response.tools_used.length > 0 },
      { name: 'Found documents', pass: response.documents_found > 0 },
      { name: 'Confidence > 0.4', pass: response.final_confidence > 0.4 },
      { name: 'Completed in <60s', pass: response.total_time_ms < 60000 },
    ];

    console.log('\n✅ CHECKS:');
    checks.forEach(c => {
      console.log(`  ${c.pass ? '✓' : '✗'} ${c.name}`);
    });

    const allPassed = checks.every(c => c.pass);
    console.log(`\n${allPassed ? '🎉 ALL CHECKS PASSED!' : '⚠️ SOME CHECKS FAILED'}`);

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main();
