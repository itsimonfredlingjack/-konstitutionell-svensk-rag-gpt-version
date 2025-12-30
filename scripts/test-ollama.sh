#!/usr/bin/env bash
# Test Ollama models for Constitutional-GPT
# Usage: ./test-ollama.sh

set -euo pipefail

echo "═══════════════════════════════════════════════════════════════"
echo "  Constitutional-GPT Model Tests"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Test 1: GPT-SW3 (VOICE)
echo "Test 1: GPT-SW3 (VOICE) - Naturlig svenska..."
VOICE_RESPONSE=$(curl -s http://localhost:11434/api/chat \
  -H 'Content-Type: application/json' \
  --data-binary @- <<'JSON'
{
  "model": "fcole90/ai-sweden-gpt-sw3:6.7b",
  "messages": [
    { "role": "user", "content": "Hej" }
  ],
  "stream": false,
  "options": { "num_predict": 30 }
}
JSON
)

if echo "$VOICE_RESPONSE" | jq -e '.message.content' > /dev/null 2>&1; then
  echo "  ✅ GPT-SW3 svarar: $(echo "$VOICE_RESPONSE" | jq -r '.message.content' | head -c 50)..."
else
  echo "  ❌ GPT-SW3 fel: $VOICE_RESPONSE"
  exit 1
fi
echo ""

# Test 2: Gemma 3 (BRAIN)
echo "Test 2: Gemma 3 (BRAIN) - Faktasvar..."
BRAIN_RESPONSE=$(curl -s http://localhost:11434/api/chat \
  -H 'Content-Type: application/json' \
  --data-binary @- <<'JSON'
{
  "model": "gemma3:12b",
  "messages": [
    { "role": "user", "content": "Vad ar GDPR?" }
  ],
  "stream": false,
  "options": { "num_predict": 50 }
}
JSON
)

if echo "$BRAIN_RESPONSE" | jq -e '.message.content' > /dev/null 2>&1; then
  echo "  ✅ Gemma 3 svarar: $(echo "$BRAIN_RESPONSE" | jq -r '.message.content' | head -c 50)..."
else
  echo "  ❌ Gemma 3 fel: $BRAIN_RESPONSE"
  exit 1
fi
echo ""

# Test 3: Structured outputs
echo "Test 3: Structured outputs (format schema)..."
SCHEMA_RESPONSE=$(curl -s http://localhost:11434/api/chat \
  -H 'Content-Type: application/json' \
  --data-binary @- <<'JSON'
{
  "model": "gemma3:12b",
  "messages": [
    { "role": "system", "content": "Svara ENDAST som JSON enligt schema." },
    { "role": "user", "content": "Ge ett kort svar och en foldfrage." }
  ],
  "format": {
    "type": "object",
    "properties": {
      "answer": { "type": "string" },
      "followups": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["answer", "followups"]
  },
  "stream": false,
  "options": { "num_predict": 100 }
}
JSON
)

PARSED=$(echo "$SCHEMA_RESPONSE" | jq -r '.message.content')
if echo "$PARSED" | jq -e '.answer and .followups' > /dev/null 2>&1; then
  echo "  ✅ Strukturerad output korrekt:"
  echo "     answer: $(echo "$PARSED" | jq -r '.answer' | head -c 40)..."
  echo "     followups: $(echo "$PARSED" | jq -r '.followups | length') st"
else
  echo "  ❌ Strukturerad output fel: $PARSED"
  exit 1
fi
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "  🎉 Alla tester passerade!"
echo "═══════════════════════════════════════════════════════════════"
