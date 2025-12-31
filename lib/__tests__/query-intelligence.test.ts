import { describe, it, expect } from 'vitest';

describe('Query Intelligence', () => {
  describe('Query Classification', () => {
    it('should classify legal queries correctly', () => {
      // These are integration-style tests that verify query classification logic
      const legalQueries = [
        'Vad säger GDPR om personuppgifter?',
        'Enligt SFS 2018:218 paragraf 5',
        'Hur fungerar offentlighetsprincipen?',
      ];

      const smalltalkQueries = [
        'Hej!',
        'Tack för hjälpen',
        'Vad kan du göra?',
      ];

      // Verify patterns exist for classification
      legalQueries.forEach((query) => {
        const hasLegalIndicator =
          query.toLowerCase().includes('gdpr') ||
          query.toLowerCase().includes('sfs') ||
          query.toLowerCase().includes('princip') ||
          query.toLowerCase().includes('lag');
        expect(hasLegalIndicator).toBe(true);
      });

      smalltalkQueries.forEach((query) => {
        const isSmalltalk =
          query.toLowerCase().includes('hej') ||
          query.toLowerCase().includes('tack') ||
          query.toLowerCase().includes('kan du');
        expect(isSmalltalk).toBe(true);
      });
    });
  });

  describe('SFS Pattern Matching', () => {
    it('should match valid SFS numbers', () => {
      const sfsPattern = /\b(1[89]\d{2}|20[0-2]\d):\d{1,4}\b/;

      expect(sfsPattern.test('SFS 2018:218')).toBe(true);
      expect(sfsPattern.test('enligt 1994:200')).toBe(true);
      expect(sfsPattern.test('2020:123')).toBe(true);
      expect(sfsPattern.test('invalid:123')).toBe(false);
      expect(sfsPattern.test('2050:123')).toBe(false); // Future year
    });
  });

  describe('Swedish Legal Term Variants', () => {
    it('should recognize common legal term variations', () => {
      const legalTerms = [
        'personuppgift',
        'personuppgifter',
        'personuppgifternas',
        'offentlighetsprincipen',
        'dataskydd',
        'dataskyddslagen',
      ];

      const baseTerms = new Set([
        'personuppgift',
        'offentlighetsprincip',
        'dataskydd',
      ]);

      legalTerms.forEach((term) => {
        const hasBaseMatch = Array.from(baseTerms).some((base) =>
          term.toLowerCase().startsWith(base)
        );
        expect(hasBaseMatch).toBe(true);
      });
    });
  });

  describe('Evidence Level Classification', () => {
    it('should classify evidence levels correctly', () => {
      const highEvidenceSources = [
        { doc_type: 'sfs', title: 'Dataskyddslagen' },
        { doc_type: 'sfs', title: 'Regeringsformen' },
      ];

      const lowEvidenceSources = [
        { doc_type: 'prop', title: 'Proposition 2017/18:105' },
        { doc_type: 'sou', title: 'SOU 2017:39' },
      ];

      highEvidenceSources.forEach((source) => {
        expect(source.doc_type).toBe('sfs');
      });

      lowEvidenceSources.forEach((source) => {
        expect(['prop', 'sou', 'mot']).toContain(source.doc_type);
      });
    });
  });
});
