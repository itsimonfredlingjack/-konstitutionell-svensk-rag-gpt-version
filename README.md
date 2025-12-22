# Constitutional-GPT

Agentic RAG system för svenska myndighetsdokument.

## Arkitektur

```
User → Frontend (3001) → Backend API (8000) → ChromaDB
                      ↘ llama-server (8080) ↗
```

## Tjänster

| Service | Port | Beskrivning |
|---------|------|-------------|
| constitutional-gpt | 3001 | Next.js frontend |
| simons-ai-backend | 8000 | FastAPI + ChromaDB access |
| llama-server | 8080 | GPT-OSS 20B inference |

## Starta/Stoppa

```bash
# Visa status
sudo systemctl status constitutional-gpt llama-server simons-ai-backend

# Starta om frontend
sudo systemctl restart constitutional-gpt

# Loggar
sudo journalctl -u constitutional-gpt -f
```

## Utveckling

Frontend har HMR aktiverat - bara redigera filer:
- Pages: `app/page.tsx`
- API Client: `lib/api.ts`
- Agent Logic: `lib/agentic-rag/`

## Dataflöde

1. **Fråga från användare**
   - `useChat()` hook i `lib/hooks.ts`
   - Kallar `agentQuery()` i `lib/api.ts`

2. **Dokumentsökning**
   - POST `/api/constitutional/search` (backend:8000)
   - ChromaDB semantic search med fallback till text search

3. **LLM Svar**
   - POST `/v1/chat/completions` (llama-server:8080)
   - GPT-OSS 20B med Harmony template
   - Jail Warden v2 validering

4. **Källor**
   - Max 5 dokument visas med [1], [2] etc.
   - Hallucinerande citat tas bort automatiskt

## Modeller

**VIKTIGT:** GPT-OSS 20B är huvudmodellen för all kommunikation. Ta inte bort!

## ChromaDB Collections

- `riksdag_documents_p1`: ~230K dokument
- `swedish_gov_docs`: ~305K dokument (växer)

Total: ~535K+ svenska myndighetsdokument