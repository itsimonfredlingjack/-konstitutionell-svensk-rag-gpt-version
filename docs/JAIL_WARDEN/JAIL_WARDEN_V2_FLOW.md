# Jail Warden v2 Flow Diagram

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER QUERY                                  │
│            "Vad säger pressfrihetslagen om offentlighet?"           │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    JAIL WARDEN V2 (PRE-CORRECTION)                  │
│                                                                     │
│  1. Lowercase comparison                                            │
│  2. Pattern matching: /\bpressfrihetslagen\b/i                     │
│  3. Lookup in QUESTION_REWRITES dictionary                          │
│                                                                     │
│  ✓ MATCH FOUND: "pressfrihetslagen"                                │
│                                                                     │
│  Output:                                                            │
│  • rewrittenQuestion: "Vad säger Tryckfrihetsförordningen (TF)..." │
│  • systemAddition: "VIKTIGT: Användaren frågade om..."             │
│  • detectedMisconception: "pressfrihetslagen"                      │
│  • correctionApplied: true                                          │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                    ▼                         ▼
         ┌──────────────────┐     ┌──────────────────┐
         │  SEARCH QUERY    │     │  SYSTEM PROMPT   │
         │                  │     │                  │
         │  Corrected:      │     │  Base +          │
         │  "TF (SFS        │     │  Correction      │
         │   1949:105)"     │     │  Instructions    │
         └──────┬───────────┘     └──────┬───────────┘
                │                        │
                ▼                        │
     ┌─────────────────────┐             │
     │  CHROMADB SEARCH    │             │
     │                     │             │
     │  Semantic search    │             │
     │  with corrected     │             │
     │  terminology        │             │
     └──────┬──────────────┘             │
            │                            │
            │  Returns top 10 docs       │
            │  about TF                  │
            │                            │
            ▼                            │
     ┌─────────────────────┐             │
     │  CONTEXT BUILDER    │             │
     │                     │             │
     │  Formats docs into  │             │
     │  numbered snippets  │             │
     └──────┬──────────────┘             │
            │                            │
            └────────────┬───────────────┘
                         │
                         ▼
            ┌──────────────────────────┐
            │   Ministral 3 14B (Ollama) │
            │                          │
            │   Input:                 │
            │   • System: Base +       │
            │     "Du MÅSTE börja med: │
            │      'Det finns ingen...'│
            │   • User: Context + Q    │
            │                          │
            │   Model MUST start with  │
            │   correction explanation │
            └──────┬───────────────────┘
                   │
                   ▼
            ┌──────────────────────────┐
            │  RAW ANSWER              │
            │                          │
            │  "Det finns ingen lag    │
            │   som heter 'press-      │
            │   frihetslagen'. Många   │
            │   tror att tryckfrihet   │
            │   regleras i en lag...   │
            │                          │
            │   Tryckfrihetsförord-    │
            │   ningen (TF) reglerar..." │
            └──────┬───────────────────┘
                   │
                   ▼
            ┌──────────────────────────┐
            │  JAIL WARDEN V1          │
            │  (POST-CORRECTION BACKUP)│
            │                          │
            │  Scans for any remaining │
            │  hallucinations:         │
            │  • pressfrihetslagen     │
            │  • offentlighetslagen    │
            │  • etc.                  │
            │                          │
            │  ✓ No issues found       │
            │    (V2 prevented them)   │
            └──────┬───────────────────┘
                   │
                   ▼
            ┌──────────────────────────┐
            │  CITATION GATING         │
            │                          │
            │  Strip model-generated   │
            │  citations [1], [2]      │
            │  Remove "enligt källa"   │
            └──────┬───────────────────┘
                   │
                   ▼
            ┌──────────────────────────┐
            │  APPEND REAL SOURCES     │
            │                          │
            │  Add ChromaDB sources:   │
            │  ---                     │
            │  Källor:                 │
            │  [1] TF SFS 1949:105     │
            │  [2] Prop. 2024/25:...   │
            └──────┬───────────────────┘
                   │
                   ▼
         ┌─────────────────────────────┐
         │     FINAL RESPONSE          │
         │                             │
         │  {                          │
         │    answer: "Det finns...",  │
         │    warden_status:           │
         │      "QUESTION_REWRITTEN",  │
         │    warden_details: {        │
         │      question_rewrite: {...}│
         │      misconceptions: [...]  │
         │    },                       │
         │    reasoning_steps: [       │
         │      "Jail Warden V2...",   │
         │      "Fråga omskriven..."   │
         │    ]                        │
         │  }                          │
         └─────────────────────────────┘
```

## Decision Tree

```
                    User Query
                        │
                        ▼
              ┌─────────────────┐
              │ Contains known  │
              │ misconception?  │
              └────┬────────┬───┘
                   │        │
              YES  │        │  NO
                   │        │
                   ▼        ▼
         ┌─────────────┐  ┌─────────────────┐
         │  V2 REWRITE │  │  PASS THROUGH   │
         │             │  │                 │
         │  Status:    │  │  Status:        │
         │  QUESTION_  │  │  UNCHANGED or   │
         │  REWRITTEN  │  │  FACT_VERIFIED  │
         └─────────────┘  └─────────────────┘
                   │              │
                   └──────┬───────┘
                          │
                          ▼
                   Search + LLM
                          │
                          ▼
                ┌─────────────────┐
                │ V1 finds more   │
                │ hallucinations? │
                └────┬────────┬───┘
                     │        │
                YES  │        │  NO
                     │        │
                     ▼        ▼
            ┌─────────────┐  Keep
            │ Apply V1    │  current
            │ corrections │  status
            │             │
            │ Keep V2     │
            │ status      │
            │ (priority)  │
            └─────────────┘
```

## Status Priority Chart

```
Priority  Status              Trigger
────────  ──────────────────  ───────────────────────────────────
   1      QUESTION_REWRITTEN  V2 detected and rewrote query
   2      TERM_CORRECTED      V1 found hallucination in output
   3      CITATIONS_STRIPPED  Model generated fake citations
   4      FACT_VERIFIED       SFS validation passed
   5      UNCHANGED           No corrections needed
```

## V1 vs V2 Comparison

```
┌────────────────────────────────────────────────────────────────┐
│                    JAIL WARDEN V1 (Post-Correction)            │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  User: "pressfrihetslagen"                                     │
│         ↓                                                      │
│  Search: "pressfrihetslagen" (WRONG TERM)                      │
│         ↓                                                      │
│  Poor search results (term mismatch)                           │
│         ↓                                                      │
│  LLM: Generates answer about "pressfrihetslagen"               │
│         ↓                                                      │
│  V1: Regex replace "pressfrihetslagen" → "TF"                  │
│         ↓                                                      │
│  Output: Inconsistent (search was wrong, answer patched)       │
│                                                                │
│  Problems:                                                     │
│  ✗ Wrong search query = bad context                           │
│  ✗ Model may hallucinate content about non-existent law       │
│  ✗ Post-correction creates inconsistency                      │
│  ✗ User doesn't learn the correct terminology                 │
│                                                                │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│                    JAIL WARDEN V2 (Pre-Correction)             │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  User: "pressfrihetslagen"                                     │
│         ↓                                                      │
│  V2: Detect + rewrite to "TF (SFS 1949:105)"                   │
│         ↓                                                      │
│  Search: "Tryckfrihetsförordningen" (CORRECT TERM)             │
│         ↓                                                      │
│  Good search results (exact terminology match)                 │
│         ↓                                                      │
│  LLM: Receives instruction to explain misconception            │
│         ↓                                                      │
│  LLM: Must start with: "Det finns ingen lag som heter..."      │
│         ↓                                                      │
│  Output: Educational + accurate                                │
│         ↓                                                      │
│  V1: Backup check (usually finds nothing)                      │
│                                                                │
│  Benefits:                                                     │
│  ✓ Correct search query = accurate context                    │
│  ✓ Model grounded in real law from the start                  │
│  ✓ User learns correct terminology                            │
│  ✓ No inconsistency between search and answer                 │
│  ✓ Dual-layer defense (V2 + V1 backup)                        │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

## Implementation Files

```
constitutional-gpt/
├── lib/
│   └── api.ts                           # Main implementation
│       ├── Lines 6-166: V2 query rewrite
│       ├── Lines 168-210: V1 post-correction (backup)
│       └── Lines 540-665: agentQuery() with V2 integration
│
├── JAIL_WARDEN_V2_IMPLEMENTATION.md     # This document
├── JAIL_WARDEN_V2_TEST_EXAMPLES.md      # Test cases
└── JAIL_WARDEN_V2_FLOW.md               # Flow diagrams
```

---

**Key Insight:** V2 moves correction from "damage control" (fixing wrong answers) to "damage prevention" (ensuring right questions).
