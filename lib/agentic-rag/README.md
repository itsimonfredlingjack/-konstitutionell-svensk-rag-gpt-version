# Agentic RAG - Constitutional AI

ReAct-baserad agent för svenska myndighetsdokument (535K docs i ChromaDB).

## Modeller - KRITISK KONFIGURATION

| Modell | Roll | Varför |
|--------|------|--------|
| **gpt-oss:20b** | Användarsvar | Bästa generalist. Stark på resonemang, juridik, analys. RADERA ALDRIG. |
| **hermes3:8b** | Tool calling | Agent-finetunad. Pålitlig JSON för ReAct-loopen. |
| **functiongemma** | Routing hint | 270M snabb routing (optional). |

## Arkitektur

```
Fråga → FunctionGemma (hint) → Hermes-3 (tool selection) → ChromaDB → GPT-OSS (svar)
```

## GPT-OSS Beteende

GPT-OSS returnerar svar i `thinking`-fältet, inte `response`. Detta hanteras av `formatGptOssAnswer()` som extraherar lagar och SFS-nummer.

## Filer

- `agent-loop.ts` - Huvudloop, modellkonfiguration
- `tools.ts` - search_documents, think_longer, etc.

## VARNING

Ändra INTE modellkonfigurationen utan att förstå hela systemet. GPT-OSS valdes efter omfattande testning - den är överlägsen för användarinteraktion.
