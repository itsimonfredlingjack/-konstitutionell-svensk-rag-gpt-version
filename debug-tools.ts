/**
 * Debug script to test Ollama native tool calling format
 */

const OLLAMA_URL = 'http://localhost:11434';

const tools = [
  {
    type: 'function',
    function: {
      name: 'search_documents',
      description: 'Söker i dokumentdatabasen',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Sökfrågan' },
        },
        required: ['query'],
      },
    },
  },
];

async function testToolCalling() {
  console.log('Testing Ollama tool calling with ministral-3:14b...\n');

  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'ministral-3:14b',
      messages: [
        {
          role: 'system',
          content: 'Du är en juridisk assistent. Använd search_documents för att hitta information.',
        },
        {
          role: 'user',
          content: 'Sök efter regler om bygglov',
        },
      ],
      tools,
      stream: false,
    }),
  });

  const data = await response.json();

  console.log('Full response:');
  console.log(JSON.stringify(data, null, 2));

  if (data.message?.tool_calls) {
    console.log('\n✅ Tool calls found:');
    data.message.tool_calls.forEach((tc: any, i: number) => {
      console.log(`  [${i}] ${tc.function?.name}`);
      console.log(`      args type: ${typeof tc.function?.arguments}`);
      console.log(`      args: ${JSON.stringify(tc.function?.arguments)}`);
    });
  } else {
    console.log('\n⚠️ No tool_calls in response');
    console.log('Content:', data.message?.content);
  }
}

testToolCalling().catch(console.error);
