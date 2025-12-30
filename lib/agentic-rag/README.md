# Agentic RAG - Constitutional AI

Direct RAG för svenska myndighetsdokument (535K docs i ChromaDB).

## Modeller - Två-modell Arkitektur

| Modell | Alias | Roll | Backend |
|--------|-------|------|---------|
| **gemma3:12b** | BRAIN | Faktasvar, RAG, analys | Ollama (port 11434) |
| **fcole90/ai-sweden-gpt-sw3:6.7b** | VOICE | Chat, style pass, naturlig svenska | Ollama (port 11434) |

## Response Modes

| Mode | Modell(er) | Retrieval | Källor |
|------|-----------|-----------|--------|
| **CHAT** | GPT-SW3 only | ❌ | Aldrig |
| **ASSIST** | Gemma → GPT-SW3 | ✅ | Bakom toggle |
| **EVIDENCE** | Gemma only | ✅ | Alltid synliga |

## Arkitektur

```
CHAT:     Fråga → GPT-SW3 → Svar (ingen RAG)
ASSIST:   Fråga → ChromaDB → Gemma (draft) → GPT-SW3 (style) → Svar
EVIDENCE: Fråga → ChromaDB → Gemma → Svar med citat
```

## Tvåpass ASSIST Flow

1. **Pass A (BRAIN)**: Gemma genererar sakligt draft med citat [1], [2]
   - Låg temperatur (0.1) för precision
   - Strukturerad JSON-output via `format`-parameter

2. **Pass B (VOICE)**: GPT-SW3 skriver om till naturlig svenska
   - Behåller all sakinfo och citat-markeringar
   - Tar bort stela byråkrat-formuleringar

## Structured Outputs

Använder Ollamas `format`-parameter för garanterad JSON:

```typescript
const response = await callOllama({
  model: 'gemma3:12b',
  messages: [...],
  format: CANONICAL_RESPONSE_JSON_SCHEMA,  // Schema-bound output
});
```

## CanonicalResponse Schema

```typescript
interface CanonicalResponse {
  answer: string;       // Huvudsvar
  followups: string[];  // Max 3 följdfrågor
  mode: 'CHAT' | 'ASSIST' | 'EVIDENCE';
  citations?: Citation[];  // Endast ASSIST/EVIDENCE
  confidence?: number;     // 0-1
  debug?: DebugInfo;
}
```

## Filer

- `agent-loop.ts` - Huvudloop med mode-routing
- `tools.ts` - search_documents, think_longer
- `../orchestration/orchestrator.ts` - Query-analys och mode-beslut
- `../orchestration/ollama-client.ts` - Ollama API med structured outputs
- `../orchestration/response-schema.ts` - CanonicalResponse definitioner
- `../api.ts` - Frontend API med Jail Warden v2

## Guardrails

- **CHAT** triggar ALDRIG retrieval (runtime-check)
- **QueryType → Mode** mappning i orchestrator
- Jail Warden v2 verifierar fakta mot källor

## VIKTIGT

- Använd Ollama (port 11434), INTE llama-server
- Gemma = BRAIN (faktasvar), GPT-SW3 = VOICE (naturlig svenska)
- CHAT-mode använder ALDRIG dokument eller lagcitat
