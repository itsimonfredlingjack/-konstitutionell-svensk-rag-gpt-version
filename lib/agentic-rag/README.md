# Agentic RAG - Constitutional AI

Direct RAG för svenska myndighetsdokument (535K docs i ChromaDB).

## Modeller - KRITISK KONFIGURATION

| Modell | Roll | Backend |
|--------|------|---------|
| **gpt-oss** | Alla LLM-anrop | llama-server (port 8080) |

**Hermes och Ollama är BORTTAGNA.** Constitutional-GPT använder ENDAST llama-server.

## Arkitektur

```
Fråga → ChromaDB (sökning) → GPT-OSS (svar) → Warden v2 (verifiering)
```

Tool-calling är DISABLED eftersom gpt-oss inte stöder strukturerade tool_calls.
Direct RAG används istället: search → context → LLM.

## GPT-OSS Beteende

GPT-OSS körs med Harmony template via `--jinja` och `--reasoning-format auto`.
Reasoning effort styrs via server-side `--chat-template-kwargs '{"reasoning_effort":"low"}'`.

Svar finns ALLTID i `content`-fältet. `reasoning_content` exponeras ALDRIG till användare.
Vid tom `content` körs en finalizer-retry.

## Filer

- `agent-loop.ts` - Huvudloop, direct RAG-strategi
- `tools.ts` - search_documents, think_longer, etc.
- `api.ts` - Warden v2, citation gating

## VARNING

- Använd INTE Ollama - endast llama-server (port 8080)
- Återinför ALDRIG Hermes
- GPT-OSS är huvudmodellen för all kommunikation
