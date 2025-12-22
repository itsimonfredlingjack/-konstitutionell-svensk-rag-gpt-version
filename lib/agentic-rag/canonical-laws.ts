/**
 * Canonical Laws Module - Jail Warden v2
 *
 * This module contains the immutable source of truth for Swedish constitutional laws.
 * NEVER modify CANONICAL_LAWS - it represents legal facts that cannot be altered.
 */

export interface CanonicalLaw {
  shortName: string;      // TF, OSL, RF, YGL, SO
  fullName: string;       // Tryckfrihetsförordningen
  sfs: string;           // 1949:105
  type: 'grundlag' | 'lag' | 'förordning';
  riksdagenUrl: string;  // https://www.riksdagen.se/sv/dokument-och-lagar/...
  commonMisconceptions: string[];  // ['pressfrihetslagen', 'pressfrihetslag']
}

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ law: string; expected: string; found: string }>;
  warnings: string[];
}

/**
 * CANONICAL_LAWS - The immutable source of truth
 * DO NOT MODIFY - These are legal facts
 */
export const CANONICAL_LAWS: Record<string, CanonicalLaw> = {
  'TF': {
    shortName: 'TF',
    fullName: 'Tryckfrihetsförordningen',
    sfs: '1949:105',
    type: 'grundlag',
    riksdagenUrl: 'https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/tryckfrihetsforordning-1949105_sfs-1949-105/',
    commonMisconceptions: ['pressfrihetslagen', 'pressfrihetslag', 'tryckfrihetslagen']
  },
  'OSL': {
    shortName: 'OSL',
    fullName: 'Offentlighets- och sekretesslagen',
    sfs: '2009:400',
    type: 'lag',
    riksdagenUrl: 'https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/offentlighets-och-sekretesslag-2009400_sfs-2009-400/',
    commonMisconceptions: ['offentlighetslagen', 'sekretesslagen']
  },
  'RF': {
    shortName: 'RF',
    fullName: 'Regeringsformen',
    sfs: '1974:152',
    type: 'grundlag',
    riksdagenUrl: 'https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/kungorelse-1974152-om-beslutad-ny-regeringsform_sfs-1974-152/',
    commonMisconceptions: ['grundlagen', 'svenska grundlagen', 'konstitutionen', 'regeringslagen']
  },
  'YGL': {
    shortName: 'YGL',
    fullName: 'Yttrandefrihetsgrundlagen',
    sfs: '1991:1469',
    type: 'grundlag',
    riksdagenUrl: 'https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/yttrandefrihetsgrundlag-19911469_sfs-1991-1469/',
    commonMisconceptions: ['yttrandefrihetslagen', 'yttrandefrihetslag']
  },
  'SO': {
    shortName: 'SO',
    fullName: 'Successionsordningen',
    sfs: '1810:0926',
    type: 'grundlag',
    riksdagenUrl: 'https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/successionsordning-18100926_sfs-1810-0926/',
    commonMisconceptions: []
  }
};

/**
 * Extract SFS numbers from text
 * Matches patterns like "SFS 1949:105" or "1949:105"
 */
function extractSFSNumbers(text: string): string[] {
  const sfsPattern = /(?:SFS\s*)?(\d{4}):(\d+)/gi;
  const matches = Array.from(text.matchAll(sfsPattern));
  return matches.map(match => `${match[1]}:${match[2]}`);
}

/**
 * Detect which laws are mentioned in text
 * Checks for full names, short names, and common misconceptions
 */
function detectMentionedLaws(text: string): Set<string> {
  const mentioned = new Set<string>();
  const lowerText = text.toLowerCase();

  for (const [shortName, law] of Object.entries(CANONICAL_LAWS)) {
    // Check short name (case-insensitive)
    if (lowerText.includes(shortName.toLowerCase())) {
      mentioned.add(shortName);
      continue;
    }

    // Check full name (case-insensitive)
    if (lowerText.includes(law.fullName.toLowerCase())) {
      mentioned.add(shortName);
      continue;
    }

    // Check misconceptions
    for (const misconception of law.commonMisconceptions) {
      if (lowerText.includes(misconception.toLowerCase())) {
        mentioned.add(shortName);
        break;
      }
    }
  }

  return mentioned;
}

/**
 * Validate SFS numbers in text against canonical laws
 *
 * @param text - The text to validate
 * @returns ValidationResult with errors if SFS numbers don't match canonical laws
 *
 * @example
 * ```typescript
 * const result = validateSFSNumbers("TF har SFS 1950:100");
 * // Returns: { valid: false, errors: [{ law: 'TF', expected: '1949:105', found: '1950:100' }], warnings: [] }
 * ```
 */
export function validateSFSNumbers(text: string): ValidationResult {
  const errors: Array<{ law: string; expected: string; found: string }> = [];
  const warnings: string[] = [];

  // Detect which laws are mentioned
  const mentionedLaws = detectMentionedLaws(text);

  // Extract SFS numbers from text
  const foundSFS = extractSFSNumbers(text);

  // If no laws mentioned but SFS numbers present, add warning
  if (mentionedLaws.size === 0 && foundSFS.length > 0) {
    warnings.push(`Found SFS numbers (${foundSFS.join(', ')}) but no law names mentioned`);
  }

  // Validate each mentioned law
  for (const shortName of mentionedLaws) {
    const law = CANONICAL_LAWS[shortName];
    const expectedSFS = law.sfs;

    // Check if the correct SFS is present
    const hasCorrectSFS = foundSFS.some(sfs => sfs === expectedSFS);

    if (!hasCorrectSFS && foundSFS.length > 0) {
      // Law mentioned but wrong/different SFS number found
      const incorrectSFS = foundSFS.filter(sfs => sfs !== expectedSFS);
      if (incorrectSFS.length > 0) {
        errors.push({
          law: shortName,
          expected: expectedSFS,
          found: incorrectSFS[0] // Report first incorrect SFS
        });
      } else {
        // Law mentioned but its SFS is missing
        warnings.push(`${shortName} (${law.fullName}) mentioned but SFS ${expectedSFS} not found in text`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Find the canonical law by a common misconception
 *
 * @param term - The misconception term to search for
 * @returns The canonical law if found, null otherwise
 *
 * @example
 * ```typescript
 * const law = getLawByMisconception("pressfrihetslagen");
 * // Returns: CANONICAL_LAWS['TF']
 * ```
 */
export function getLawByMisconception(term: string): CanonicalLaw | null {
  const lowerTerm = term.toLowerCase().trim();

  for (const law of Object.values(CANONICAL_LAWS)) {
    // Check if term matches any misconception
    const matchesMisconception = law.commonMisconceptions.some(
      misconception => misconception.toLowerCase() === lowerTerm
    );

    if (matchesMisconception) {
      return law;
    }

    // Also check full name (in case it's not a misconception but the actual name)
    if (law.fullName.toLowerCase() === lowerTerm) {
      return law;
    }

    // Check short name
    if (law.shortName.toLowerCase() === lowerTerm) {
      return law;
    }
  }

  return null;
}

/**
 * Get canonical citation for a law
 *
 * @param shortName - The short name of the law (TF, OSL, RF, YGL, SO)
 * @returns Formatted citation string
 *
 * @example
 * ```typescript
 * const citation = getCanonicalCitation("TF");
 * // Returns: "Tryckfrihetsförordningen (TF), SFS 1949:105"
 * ```
 */
export function getCanonicalCitation(shortName: string): string {
  const law = CANONICAL_LAWS[shortName.toUpperCase()];

  if (!law) {
    throw new Error(`Unknown law short name: ${shortName}`);
  }

  return `${law.fullName} (${law.shortName}), SFS ${law.sfs}`;
}

/**
 * Get all laws of a specific type
 *
 * @param type - The type to filter by
 * @returns Array of canonical laws matching the type
 */
export function getLawsByType(type: CanonicalLaw['type']): CanonicalLaw[] {
  return Object.values(CANONICAL_LAWS).filter(law => law.type === type);
}

/**
 * Get law by SFS number
 *
 * @param sfs - The SFS number to search for (e.g., "1949:105")
 * @returns The canonical law if found, null otherwise
 */
export function getLawBySFS(sfs: string): CanonicalLaw | null {
  return Object.values(CANONICAL_LAWS).find(law => law.sfs === sfs) || null;
}

/**
 * Check if a term is a known misconception
 *
 * @param term - The term to check
 * @returns Object with isMisconception flag and correct law if applicable
 */
export function checkMisconception(term: string): {
  isMisconception: boolean;
  correctLaw: CanonicalLaw | null;
  suggestion: string | null;
} {
  const lowerTerm = term.toLowerCase().trim();

  for (const law of Object.values(CANONICAL_LAWS)) {
    const matchesMisconception = law.commonMisconceptions.some(
      misconception => misconception.toLowerCase() === lowerTerm
    );

    if (matchesMisconception) {
      return {
        isMisconception: true,
        correctLaw: law,
        suggestion: `Did you mean ${law.fullName} (${law.shortName})?`
      };
    }
  }

  return {
    isMisconception: false,
    correctLaw: null,
    suggestion: null
  };
}
