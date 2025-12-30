# Constitutional-GPT

Agentic RAG system för svenska myndighetsdokument.

## Arkitektur

```
User → Frontend (3001) → Backend API (8000) → ChromaDB
                       ↘ Ollama (11434) ↗
                         ├─ gemma3:12b (BRAIN)
                         └─ gpt-sw3:6.7b (VOICE)
```

## Två-modell System

| Modell | Roll | Används för |
|--------|------|-------------|
| **Gemma 3 12B** | BRAIN | Faktasvar, RAG, juridisk analys |
| **GPT-SW3 6.7B** | VOICE | Chat, style pass, naturlig svenska |

## Response Modes

| Mode | Beskrivning | Källor |
|------|-------------|--------|
| CHAT | Konversation utan RAG | Aldrig |
| ASSIST | Smart svar med tvåpass | Bakom toggle |
| EVIDENCE | Fullständig verifiering | Alltid synliga |

## Tjänster

| Service | Port | Beskrivning |
|---------|------|-------------|
| constitutional-gpt | 3001 | Next.js frontend |
| simons-ai-backend | 8000 | FastAPI + ChromaDB access |
| Ollama | 11434 | LLM inference (Gemma + GPT-SW3) |

## Starta/Stoppa

```bash
# Visa status
systemctl --user status constitutional-gpt
lsof -i :3001 :8000 :11434

# Kontrollera Ollama-modeller
ollama list
ollama ps

# Starta om frontend
systemctl --user restart constitutional-gpt

# Loggar
journalctl --user -u constitutional-gpt -f
```

## Utveckling

Frontend har HMR aktiverat - bara redigera filer:
- Pages: `app/page.tsx`
- API Client: `lib/api.ts`
- Orchestration: `lib/orchestration/`
- Agent Logic: `lib/agentic-rag/`

## Dataflöde

1. **Fråga från användare**
   - `useChat()` hook i `lib/hooks.ts`
   - Kallar `agentQuery()` i `lib/api.ts`
   - Orchestrator bestämmer mode (CHAT/ASSIST/EVIDENCE)

2. **CHAT (GPT-SW3)**
   - Ingen dokumentsökning
   - Direkt svar via GPT-SW3
   - Naturlig konversation

3. **ASSIST (Tvåpass)**
   - ChromaDB semantic search
   - Pass A: Gemma genererar sakligt draft
   - Pass B: GPT-SW3 applicerar naturlig svenska
   - Källor bakom toggle

4. **EVIDENCE (Gemma)**
   - ChromaDB semantic search
   - Gemma genererar tekniskt svar
   - Källor alltid synliga

5. **Verifiering**
   - Jail Warden v2 kollar fakta mot källor
   - Hallucinerande citat tas bort automatiskt

## ChromaDB Collections

- `riksdag_documents_p1`: ~230K dokument
- `swedish_gov_docs`: ~305K dokument (växer)

Total: ~535K+ svenska myndighetsdokument
