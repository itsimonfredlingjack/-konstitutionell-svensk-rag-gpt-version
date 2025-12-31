#!/usr/bin/env npx tsx
/**
 * Test native function calling with Ministral 3 14B
 */

import { runNativeAgent, formatNativeAgentLog } from '../lib/agentic-rag/native-agent';

async function main() {
  const question = process.argv[2] || 'Vad är GDPR och vilka regler gäller för personuppgifter?';

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  🧪 TEST: Native Function Calling - Ministral 3 14B       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n📋 Fråga: "${question}"\n`);

  const state = await runNativeAgent(question);

  console.log('\n' + formatNativeAgentLog(state));

  if (state.collectedDocuments.length > 0) {
    console.log('\n📚 INSAMLADE DOKUMENT:');
    for (const doc of state.collectedDocuments.slice(0, 5)) {
      console.log(`   • ${doc.title || 'Untitled'} (${doc.score}%)`);
    }
  }

  if (state.thoughts.length > 0) {
    console.log('\n💭 TANKAR:');
    for (const thought of state.thoughts) {
      console.log(`   "${thought.substring(0, 100)}${thought.length > 100 ? '...' : ''}"`);
    }
  }

  console.log('\n✅ Test complete!');
}

main().catch(console.error);
