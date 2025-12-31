import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock BACKEND_URL
vi.mock('../api', async () => {
  const actual = await vi.importActual('../api');
  return {
    ...actual,
    BACKEND_URL: 'http://localhost:8000',
  };
});

describe('API Module', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('searchDocuments', () => {
    it('should call the correct endpoint with query', async () => {
      const mockResponse = {
        results: [{ id: '1', title: 'Test', score: 0.95 }],
        total: 1,
        page: 1,
        limit: 10,
        query: 'test query',
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { searchDocuments } = await import('../api');
      const result = await searchDocuments('test query');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/constitutional/search'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
      expect(result.results).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should return empty results on network error', async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

      const { searchDocuments } = await import('../api');
      const result = await searchDocuments('test query');

      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('getSystemStats', () => {
    it('should fetch system statistics', async () => {
      const mockStats = {
        chromadb_connected: true,
        total_documents: 535000,
        collections: { sfs: 3000, riksdag: 230000 },
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockStats),
      });

      const { getSystemStats } = await import('../api');
      const result = await getSystemStats();

      expect(result?.chromadb_connected).toBe(true);
      expect(result?.total_documents).toBe(535000);
    });

    it('should return null on API failure', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { getSystemStats } = await import('../api');
      const result = await getSystemStats();

      expect(result).toBeNull();
    });
  });

  describe('Jail Warden corrections', () => {
    it('should correct datainspektionen to IMY', async () => {
      // This tests the Swedish law correction functionality
      const { applyJailWardenCorrections } = await import('../api');

      const testText = 'Kontakta Datainspektionen för mer information.';
      const { correctedText, corrections } = applyJailWardenCorrections(testText);

      expect(correctedText).toContain('Integritetsskyddsmyndigheten (IMY)');
      expect(corrections.length).toBeGreaterThan(0);
    });

    it('should correct personuppgiftslagen to GDPR', async () => {
      const { applyJailWardenCorrections } = await import('../api');

      const testText = 'Enligt personuppgiftslagen ska...';
      const { correctedText, corrections } = applyJailWardenCorrections(testText);

      expect(correctedText).toContain('GDPR');
      expect(correctedText).toContain('Dataskyddslagen');
    });
  });
});
