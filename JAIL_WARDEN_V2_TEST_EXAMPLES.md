# Jail Warden v2 Test Examples

## How to Test

Run the constitutional-gpt app and try these queries to verify V2 is working:

### Test 1: pressfrihetslagen

**Query:**
```
Vad säger pressfrihetslagen om offentlighet?
```

**Expected Behavior:**
1. Reasoning steps should show:
   - "Kontrollerar fråga med Jail Warden V2..."
   - "Jail Warden V2: Upptäckte missuppfattning 'pressfrihetslagen'"
   - "Fråga omskriven till: Vad säger Tryckfrihetsförordningen (TF) (SFS 1949:105) om offentlighet?"

2. Search should use corrected query: `Tryckfrihetsförordningen (TF)`

3. Answer should begin with:
   > Det finns ingen lag som heter "pressfrihetslagen". Många tror att tryckfrihet regleras i en lag, men det är faktiskt en av Sveriges fyra grundlagar.

4. `warden_status` should be `"QUESTION_REWRITTEN"`

5. `warden_details` should include:
   ```json
   {
     "question_rewrite": {
       "original": "Vad säger pressfrihetslagen om offentlighet?",
       "rewritten": "Vad säger Tryckfrihetsförordningen (TF) (SFS 1949:105) om offentlighet?"
     },
     "misconceptions_detected": ["pressfrihetslagen"]
   }
   ```

---

### Test 2: offentlighetslagen

**Query:**
```
Hur fungerar offentlighetslagen i Sverige?
```

**Expected Behavior:**
1. Detects "offentlighetslagen" as misconception
2. Rewrites to "Offentlighets- och sekretesslagen (OSL) (SFS 2009:400)"
3. Answer explains distinction between:
   - Offentlighetsprincipen (in TF)
   - Offentlighets- och sekretesslagen (OSL)

---

### Test 3: grundlagen

**Query:**
```
Vilka rättigheter skyddas i grundlagen?
```

**Expected Behavior:**
1. Detects "grundlagen" as ambiguous
2. Rewrites to "Regeringsformen (RF) (SFS 1974:152)"
3. Answer explains Sverige has 4 grundlagar:
   - Regeringsformen (RF)
   - Tryckfrihetsförordningen (TF)
   - Yttrandefrihetsgrundlagen (YGL)
   - Successionsordningen (SO)

---

### Test 4: datainspektionen

**Query:**
```
Hur kontaktar jag Datainspektionen?
```

**Expected Behavior:**
1. Detects "datainspektionen" as outdated
2. Rewrites to "Integritetsskyddsmyndigheten (IMY)"
3. Answer explains name change 2021

---

### Test 5: personuppgiftslagen

**Query:**
```
Vad säger personuppgiftslagen om cookies?
```

**Expected Behavior:**
1. Detects "personuppgiftslagen" as outdated (PuL)
2. Rewrites to "Dataskyddslagen (2018:218) och GDPR"
3. Answer explains PuL was replaced by GDPR + Dataskyddslagen 2018

---

### Test 6: No Misconception (Control)

**Query:**
```
Vad säger Tryckfrihetsförordningen om handlingsoffentlighet?
```

**Expected Behavior:**
1. No rewrite performed
2. `warden_status`: `"UNCHANGED"` or `"FACT_VERIFIED"`
3. `question_rewrite` should be undefined in `warden_details`
4. Answer proceeds normally without correction preamble

---

## Verification Checklist

For each test, verify:

- [ ] Reasoning steps show V2 detection and rewrite
- [ ] Search query uses corrected terminology
- [ ] System prompt includes correction instructions
- [ ] Answer begins with explanation of misconception
- [ ] `warden_status` correctly set to `"QUESTION_REWRITTEN"`
- [ ] `warden_details.question_rewrite` contains original and rewritten
- [ ] `warden_details.misconceptions_detected` lists incorrect terms

---

## Console Log Example

When V2 detects a misconception, you should see console output like:

```
[Jail Warden V2] Detected misconception: pressfrihetslagen
[Jail Warden V2] Rewritten: Vad säger Tryckfrihetsförordningen (TF) (SFS 1949:105) om offentlighet?
[Jail Warden V2] Injecting system prompt addition (127 chars)
```

---

## Edge Cases to Test

### Multiple Misconceptions in One Query

**Query:**
```
Kan pressfrihetslagen och offentlighetslagen komma i konflikt?
```

**Expected:** Currently only rewrites first detected misconception. Future enhancement: support multiple.

### Case Sensitivity

**Query:**
```
Vad säger PRESSFRIHETSLAGEN?
```

**Expected:** Should still detect (case-insensitive regex).

### Partial Match Prevention

**Query:**
```
Tryckfrihetslagens historia
```

**Expected:** Should NOT rewrite "Tryckfrihetslagens" (correct genitive form). Word boundary regex `\\b` prevents this.

---

## Performance Impact

Expected overhead per query:
- Regex matching: <1ms
- String replacement: <1ms
- Total V2 overhead: ~2-5ms (negligible)

Benefits:
- Better search results (correct terminology)
- Reduced hallucinations (proactive correction)
- Educational user experience (explains misconception)

---

## Debugging

If V2 doesn't trigger:

1. Check regex word boundaries match your input
2. Verify lowercase comparison works
3. Check for typos in `QUESTION_REWRITES` keys
4. Console.log the `rewriteResult` in `agentQuery()`

---

## Future Test Cases to Add

- [ ] SFS number validation (e.g., "SFS 1949:999" doesn't exist)
- [ ] Cross-reference validation (e.g., "TF 5 kap. 99 §" doesn't exist)
- [ ] Temporal awareness (e.g., "OSL 2009" wasn't in effect in 2008)
- [ ] Entity disambiguation (e.g., "kommunfullmäktige" - which kommun?)

---

**Last Updated:** 2025-12-20
