# Jail Warden v2 Implementation Summary

## Overview
Implemented query pre-correction in `/home/ai-server/AN-FOR-NO-ASSHOLES/09_CONSTITUTIONAL-AI/constitutional-gpt/lib/api.ts` to detect and correct misconceptions BEFORE the LLM call, not after.

## Key Changes

### 1. New Data Structures

```typescript
interface LegalCorrection {
  correctName: string;
  sfs: string;
  type: 'grundlag' | 'lag' | 'myndighet';
  explanation: string;
  commonMisconception: string;
}

const QUESTION_REWRITES: Record<string, LegalCorrection> = {
  // 14 common misconceptions mapped to corrections
  'pressfrihetslagen': { ... },
  'offentlighetslagen': { ... },
  // ... etc
};
```

### 2. Core Function: `rewriteQuestionWithWardenV2()`

```typescript
function rewriteQuestionWithWardenV2(question: string): QueryRewriteResult {
  // Returns:
  // - rewrittenQuestion: Corrected version with proper terminology
  // - systemAddition: Instructions to inject into system prompt
  // - detectedMisconception: The incorrect term found
  // - correctionApplied: boolean flag
}
```

### 3. Modified `agentQuery()` Flow

**OLD (V1):**
```
User Question → Search → LLM → Post-Correct Answer → Return
```

**NEW (V2):**
```
User Question → V2 Rewrite → Search (with corrected) → LLM (with instructions) → V1 Backup Correction → Return
```

### 4. Implementation Details

#### Step 0: Pre-Correction (NEW)
```typescript
const rewriteResult = rewriteQuestionWithWardenV2(question);

if (rewriteResult.correctionApplied) {
  // Use rewritten question for search
  searchQuery = rewriteResult.rewrittenQuestion;

  // Inject correction instructions into system prompt
  systemPrompt = baseSystemPrompt + rewriteResult.systemAddition;
}
```

#### Example Correction

**Input Question:**
```
"Vad säger pressfrihetslagen om offentlighet?"
```

**Rewrite Result:**
```typescript
{
  rewrittenQuestion: "Vad säger Tryckfrihetsförordningen (TF) (SFS 1949:105) om offentlighet?",
  systemAddition: `
VIKTIGT: Användaren frågade om "pressfrihetslagen". Det finns ingen lag som heter "pressfrihetslagen".

Du MÅSTE börja ditt svar med:
"Det finns ingen lag som heter "pressfrihetslagen". Många tror att tryckfrihet regleras i en lag, men det är faktiskt en av Sveriges fyra grundlagar."

Sedan kan du fortsätta svara på frågan med rätt terminologi: Tryckfrihetsförordningen (TF) (SFS 1949:105).
`,
  detectedMisconception: "pressfrihetslagen",
  correctionApplied: true
}
```

**System Prompt Sent to LLM:**
```
Du är en svensk juridisk expert specialiserad på svensk lagstiftning och myndighetsdokument. Svara alltid på svenska.

VIKTIGT: Användaren frågade om "pressfrihetslagen". Det finns ingen lag som heter "pressfrihetslagen".

Du MÅSTE börja ditt svar med:
"Det finns ingen lag som heter "pressfrihetslagen". Många tror att tryckfrihet regleras i en lag, men det är faktiskt en av Sveriges fyra grundlagar."

Sedan kan du fortsätta svara på frågan med rätt terminologi: Tryckfrihetsförordningen (TF) (SFS 1949:105).
```

### 5. Supported Corrections

| Incorrect Term | Corrects To | Type |
|----------------|-------------|------|
| pressfrihetslagen | Tryckfrihetsförordningen (TF) | grundlag (SFS 1949:105) |
| offentlighetslagen | Offentlighets- och sekretesslagen (OSL) | lag (SFS 2009:400) |
| yttrandefrihetslagen | Yttrandefrihetsgrundlagen (YGL) | grundlag (SFS 1991:1469) |
| grundlagen | Regeringsformen (RF) | grundlag (SFS 1974:152) |
| konstitutionen | Regeringsformen (RF) | grundlag (SFS 1974:152) |
| sekretesslagen | Offentlighets- och sekretesslagen (OSL) | lag (SFS 2009:400) |
| datainspektionen | Integritetsskyddsmyndigheten (IMY) | myndighet |
| personuppgiftslagen | Dataskyddslagen (2018:218) och GDPR | lag (SFS 2018:218) |
| strafflagen | Brottsbalken (BrB) | lag (SFS 1962:700) |
| tryckfrihetslagen | Tryckfrihetsförordningen (TF) | grundlag (SFS 1949:105) |
| regeringslagen | Regeringsformen (RF) | grundlag (SFS 1974:152) |

### 6. Updated AgentResponse Interface

```typescript
export interface AgentResponse {
  // ... existing fields

  // V2 fields
  warden_version: 'v1' | 'v2';
  warden_status:
    | 'UNCHANGED'           // No correction needed
    | 'TERM_CORRECTED'      // V1 post-correction applied
    | 'QUESTION_REWRITTEN'  // V2 pre-correction applied (NEW!)
    | 'FACT_VERIFIED'
    | 'CITATIONS_STRIPPED'
    | 'ERROR';

  warden_details?: {
    misconceptions_detected?: string[];
    question_rewrite?: { original: string; rewritten: string }; // NEW!
    // ... other fields
  };
}
```

### 7. Status Priority

Warden status is determined with this priority:

1. **QUESTION_REWRITTEN** (V2 pre-correction) - highest priority
2. **TERM_CORRECTED** (V1 post-correction)
3. **CITATIONS_STRIPPED**
4. **FACT_VERIFIED**
5. **UNCHANGED** - default

### 8. Backwards Compatibility

V1 post-correction still runs as a backup:
```typescript
// Step 4: JAIL WARDEN V1 - Post-correction backup
const { correctedText, corrections } = applyJailWardenCorrections(rawAnswer || '');
```

This catches any hallucinations the model might still generate despite the V2 pre-correction.

## Testing Examples

### Test Case 1: pressfrihetslagen
```typescript
Input: "Vad säger pressfrihetslagen?"
Expected:
- searchQuery: "Vad säger Tryckfrihetsförordningen (TF) (SFS 1949:105)?"
- warden_status: "QUESTION_REWRITTEN"
- warden_details.misconceptions_detected: ["pressfrihetslagen"]
- Answer starts with: "Det finns ingen lag som heter 'pressfrihetslagen'..."
```

### Test Case 2: offentlighetslagen
```typescript
Input: "Hur tillämpar man offentlighetslagen?"
Expected:
- searchQuery: "Hur tillämpar man Offentlighets- och sekretesslagen (OSL) (SFS 2009:400)?"
- warden_status: "QUESTION_REWRITTEN"
- Answer clarifies TF vs OSL distinction
```

### Test Case 3: No misconception
```typescript
Input: "Vad säger Tryckfrihetsförordningen?"
Expected:
- searchQuery: "Vad säger Tryckfrihetsförordningen?" (unchanged)
- warden_status: "UNCHANGED" or "FACT_VERIFIED"
- No rewrite performed
```

## Files Modified

- `/home/ai-server/AN-FOR-NO-ASSHOLES/09_CONSTITUTIONAL-AI/constitutional-gpt/lib/api.ts`

## Backup

Backup created at:
- `/home/ai-server/AN-FOR-NO-ASSHOLES/09_CONSTITUTIONAL-AI/constitutional-gpt/lib/api.ts.backup`

## Next Steps (Future Enhancements)

1. Add SFS number validation against canonical database
2. Expand misconceptions dictionary based on real user queries
3. Add metrics tracking for V2 corrections
4. Implement A/B testing to measure improvement over V1
5. Add logging for correction effectiveness

## Key Advantages Over V1

1. **Proactive correction:** Fixes misconception before it poisons search and LLM context
2. **Educational:** System prompt forces LLM to explain the correction to the user
3. **Better search results:** Rewritten query uses correct terminology for semantic search
4. **Dual-layer defense:** V2 pre-correction + V1 post-correction as backup
5. **Traceable:** Full correction chain visible in reasoning_steps and warden_details

---

**Implementation Date:** 2025-12-20
**Status:** Complete and production-ready
