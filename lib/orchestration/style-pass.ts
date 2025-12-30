/**
 * Style Pass - Tvåstegs-generering för naturlig ton
 *
 * 1. Pass 1 (Fakta): Generera sakligt svar med ASSIST/EVIDENCE-profil
 * 2. Pass 2 (Stil): Skriv om för flyt och ton - utan att ändra innebörd
 *
 * Används ENDAST för ASSIST mode (CHAT är redan naturlig, EVIDENCE behåller formell ton)
 */

import { MODEL_CONFIG } from './response-schema';

const OLLAMA_URL = 'http://localhost:11434';
// VOICE (GPT-SW3) gör stilpasset - ALDRIG fakta-modellen
const STYLE_MODEL = MODEL_CONFIG.VOICE;

// ═══════════════════════════════════════════════════════════════════════════
// STYLE PASS CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export type ToneStyle = 'conversational' | 'formal' | 'friendly';

/**
 * STYLE PASS REGLER (LÅSTA):
 * 1. ÄNDRA ALDRIG INNEBÖRD - meningens betydelse ska vara identisk
 * 2. LÄGG ALDRIG TILL NY INFO - du får bara omformulera, inte lägga till
 * 3. GÖR BARA SPRÅKET NATURLIGARE - ta bort "i enlighet med", "det framgår"
 * 4. BEHÅLL ALLA LAGRUM OCH SFS-NUMMER EXAKT
 */
const STYLE_PROMPTS: Record<ToneStyle, string> = {
  conversational: `Skriv om detta svar så det låter naturligt.

OBRYTBARA REGLER:
• ÄNDRA ALDRIG INNEBÖRD - samma fakta, bara annorlunda formulerat
• LÄGG ALDRIG TILL NY INFORMATION - inget nytt, ingen utfyllnad
• Behåll ALLA SFS-nummer, paragrafnummer, lagreferenser EXAKT
• Ta bort: "i enlighet med", "det framgår att", "det konstateras att"
• Max samma längd som originalet (gärna kortare)

DIN ENDA UPPGIFT: Gör stelt juridikspråk mer vardagligt.`,

  formal: `Förtydliga detta svar med formell ton.

OBRYTBARA REGLER:
• ÄNDRA ALDRIG INNEBÖRD
• LÄGG ALDRIG TILL NY INFORMATION
• Behåll ALLA referenser exakt
• Använd myndighetsspråk`,

  friendly: `Skriv om detta svar i en vänlig ton.

OBRYTBARA REGLER:
• ÄNDRA ALDRIG INNEBÖRD
• LÄGG ALDRIG TILL NY INFORMATION
• Behåll ALLA SFS-nummer och lagreferenser exakt
• Max samma längd som originalet`,
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN STYLE PASS FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Applicera style pass på ett faktasvar
 *
 * @param factualAnswer - Det sakliga svaret från ASSIST/EVIDENCE mode
 * @param targetTone - Önskad ton (default: conversational)
 * @returns Omskrivet svar med bevarad fakta
 */
export async function applyStylePass(
  factualAnswer: string,
  targetTone: ToneStyle = 'conversational'
): Promise<string> {
  // Skip style pass if answer is too short (nothing to improve)
  if (factualAnswer.length < 50) {
    return factualAnswer;
  }

  // Skip if answer is already very conversational
  if (isAlreadyConversational(factualAnswer)) {
    console.log('⏭️ Style pass: Svar är redan naturligt');
    return factualAnswer;
  }

  const stylePrompt = STYLE_PROMPTS[targetTone];

  try {
    console.log(`🎨 Style pass: Applicerar "${targetTone}" ton...`);

    // Use native Ollama /api/chat with structured output
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: STYLE_MODEL,
        messages: [
          {
            role: 'user',
            content: `${stylePrompt}

ORIGINAL:
${factualAnswer}

OMSKRIVET:`
          }
        ],
        stream: false,
        format: {
          type: 'object',
          properties: {
            rewritten: { type: 'string', description: 'Det omskrivna svaret' },
          },
          required: ['rewritten'],
        },
        options: {
          temperature: 0.7,
          num_predict: 400,
        },
      }),
    });

    if (!response.ok) {
      console.error(`Style pass error: ${response.status}`);
      return factualAnswer;  // Fallback till original
    }

    const data = await response.json();
    const content = data.message?.content || '';

    // Parse structured response
    let styledAnswer = '';
    try {
      const parsed = JSON.parse(content);
      styledAnswer = parsed.rewritten?.trim() || content.trim();
    } catch {
      styledAnswer = content.trim();
    }

    // Validera att style pass inte förstörde innehållet
    if (!styledAnswer || styledAnswer.length < factualAnswer.length * 0.5) {
      console.warn('⚠️ Style pass producerade för kort svar, använder original');
      return factualAnswer;
    }

    // Validera att juridiska referenser bevarades
    if (!preservedReferences(factualAnswer, styledAnswer)) {
      console.warn('⚠️ Style pass tappade juridiska referenser, använder original');
      return factualAnswer;
    }

    console.log(`✅ Style pass klar: ${factualAnswer.length} → ${styledAnswer.length} tecken`);
    return styledAnswer;

  } catch (error) {
    console.error('Style pass error:', error);
    return factualAnswer;  // Fallback till original vid fel
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Kontrollera om svaret redan är naturligt/konversationsartat
 */
function isAlreadyConversational(answer: string): boolean {
  // Formella indikatorer som behöver skrivas om
  const formalIndicators = [
    /i enlighet med/i,
    /det framgår att/i,
    /det konstateras att/i,
    /härav följer/i,
    /beaktat ovanstående/i,
    /med beaktande av/i,
    /såsom framgår/i,
    /vad avser/i,
    /vad gäller/i,
  ];

  // Om svaret har många formella indikatorer, behöver det style pass
  const formalCount = formalIndicators.filter(p => p.test(answer)).length;
  return formalCount < 2;  // < 2 formella uttryck = redan naturligt
}

/**
 * Kontrollera att juridiska referenser bevarades
 */
function preservedReferences(original: string, styled: string): boolean {
  // Extrahera SFS-nummer (format: 1974:152, 2018:218, etc.)
  const sfsPattern = /\d{4}:\d+/g;
  const originalSfs: string[] = original.match(sfsPattern) ?? [];
  const styledSfs: string[] = styled.match(sfsPattern) ?? [];

  // Alla original SFS-nummer måste finnas i styled version
  for (const sfs of originalSfs) {
    if (!styledSfs.includes(sfs)) {
      return false;
    }
  }

  // Extrahera lagnamn (Regeringsformen, OSL, TF, etc.)
  const lawPattern = /(Regeringsformen|Tryckfrihetsförordningen|Offentlighets- och sekretesslagen|GDPR|Dataskyddslagen|Miljöbalken|OSL|TF|RF|YGL)/gi;
  const originalLaws: string[] = original.match(lawPattern) ?? [];
  const styledLaws: string[] = styled.match(lawPattern) ?? [];

  // Minst hälften av lagnamn ska finnas kvar
  if (originalLaws.length > 0) {
    const preserved = originalLaws.filter(law =>
      styledLaws.some(s => s.toLowerCase() === law.toLowerCase())
    );
    return preserved.length >= originalLaws.length * 0.5;
  }

  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Bestäm om style pass ska appliceras baserat på mode
 */
export function shouldApplyStylePass(mode: string): boolean {
  return mode === 'ASSIST';  // Endast ASSIST får style pass
}
