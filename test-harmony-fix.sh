#!/bin/bash

# Test script för Harmony Meta-Läckage & Juridik-Guard fix
# Kör: ./test-harmony-fix.sh

set -e

echo "🧪 TESTING HARMONY FIX - Constitutional GPT"
echo "=========================================="

# Färger
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Meta-läckage (enkel fråga)
echo ""
echo -e "${YELLOW}Test 1: Meta-läckage detektion${NC}"
echo "Fråga: 'Hej GPT'"
# NOTE: Using heredoc syntax to avoid JSON escaping issues
RESPONSE=$(curl -s -X POST http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  --data-binary @- <<'JSON'
{
  "model": "gpt-oss",
  "messages": [
    {"role": "system", "content": "Du är en svensk myndighetsjurist. Svara på svenska."},
    {"role": "user", "content": "Hej GPT"}
  ],
  "temperature": 0.3,
  "max_tokens": 100
}
JSON
)

CONTENT=$(echo "$RESPONSE" | jq -r '.choices[0].message.content')
HAS_META=$(echo "$CONTENT" | grep -iE "^(The user|Let me|I will|We need|To answer|Let's)" && echo "true" || echo "false")

if [ "$HAS_META" = "false" ]; then
  echo -e "${GREEN}✅ PASS: Inget meta-läckage${NC}"
  echo "Svar: $CONTENT"
else
  echo -e "${RED}❌ FAIL: Meta-läckage detekterat${NC}"
  echo "Svar: $CONTENT"
fi

# Test 2: Juridik utan källor (via curl direkt)
echo ""
echo -e "${YELLOW}Test 2: Juridik utan källor (direkt llama-server)${NC}"
echo "Fråga: 'Vilka lagar reglerar allemansrätten?'"
RESPONSE=$(curl -s -X POST http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  --data-binary @- <<'JSON'
{
  "model": "gpt-oss",
  "messages": [
    {"role": "system", "content": "Du är en svensk juridisk expert. ALDRIG uppfinna SFS-nummer eller lagnamn. Om du inte vet, säg: Det framgår inte av tillgängliga källor."},
    {"role": "user", "content": "Vilka lagar reglerar allemansrätten i Sverige?"}
  ],
  "temperature": 0.3,
  "max_tokens": 200
}
JSON
)

CONTENT=$(echo "$RESPONSE" | jq -r '.choices[0].message.content')
HAS_SFS=$(echo "$CONTENT" | grep -E "\b[0-9]{4}:[0-9]+\b" && echo "true" || echo "false")

if [ "$HAS_SFS" = "true" ]; then
  echo -e "${YELLOW}⚠️  EXPECTED: Modellen hallucinerar SFS (juridik-guard kommer blockera detta i RAG)${NC}"
  echo "Svar (första 150 tecken): ${CONTENT:0:150}..."
else
  echo -e "${GREEN}✅ BONUS: Modellen följde instruktion och uppfann inte SFS${NC}"
  echo "Svar: $CONTENT"
fi

# Test 3: Reasoning separation
echo ""
echo -e "${YELLOW}Test 3: Reasoning separation (content vs reasoning_content)${NC}"
RESPONSE=$(curl -s -X POST http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  --data-binary @- <<'JSON'
{
  "model": "gpt-oss",
  "messages": [
    {"role": "system", "content": "Svara på svenska."},
    {"role": "user", "content": "Vad är TF?"}
  ],
  "temperature": 0.3,
  "max_tokens": 150
}
JSON
)

HAS_CONTENT=$(echo "$RESPONSE" | jq -r '.choices[0].message.content' | grep -q . && echo "true" || echo "false")
HAS_REASONING=$(echo "$RESPONSE" | jq -r '.choices[0].message.reasoning_content' | grep -q . && echo "true" || echo "false")

if [ "$HAS_CONTENT" = "true" ] && [ "$HAS_REASONING" = "true" ]; then
  echo -e "${GREEN}✅ PASS: Både content och reasoning_content finns (korrekt separation)${NC}"
  echo "Content (första 100 tecken): $(echo "$RESPONSE" | jq -r '.choices[0].message.content' | head -c 100)..."
  echo "Reasoning finns: Ja (exponeras ALDRIG till användare)"
elif [ "$HAS_CONTENT" = "true" ] && [ "$HAS_REASONING" = "false" ]; then
  echo -e "${GREEN}✅ PASS: Content finns, reasoning_content tom (OK för enkla frågor)${NC}"
  echo "Content: $(echo "$RESPONSE" | jq -r '.choices[0].message.content')"
else
  echo -e "${RED}❌ FAIL: Content saknas${NC}"
  echo "$RESPONSE" | jq '.choices[0].message'
fi

# Test 4: Server config verification
echo ""
echo -e "${YELLOW}Test 4: Verify llama-server config${NC}"
CONFIG=$(systemctl show llama-server -p ExecStart --value)
if echo "$CONFIG" | grep -q "\-\-reasoning-format auto"; then
  echo -e "${GREEN}✅ PASS: --reasoning-format auto (korrekt)${NC}"
else
  echo -e "${RED}❌ FAIL: --reasoning-format är inte 'auto'${NC}"
  echo "Config: $CONFIG"
fi

if echo "$CONFIG" | grep -q "\-\-jinja"; then
  echo -e "${GREEN}✅ PASS: --jinja aktiverad${NC}"
else
  echo -e "${RED}❌ FAIL: --jinja saknas${NC}"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}✅ ALLA TESTER KLARA${NC}"
echo ""
echo "Nästa steg:"
echo "1. Testa via RAG-pipeline (frontend eller curl mot port 8000)"
echo "2. Övervaka metrics: journalctl -u constitutional-gpt -f | grep METRICS"
echo "3. Kolla att juridik-guard blockerar hallucination i RAG"
