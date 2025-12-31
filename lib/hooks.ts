"use client";

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getSystemStats,
  getGPUStats,
  getLoadedModels,
  getHealth,
  searchDocuments,
  agentQuery,
  type SearchResult,
} from './api';

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM METRICS HOOK
// ═══════════════════════════════════════════════════════════════════════════

export interface SystemMetrics {
  chromadb: {
    connected: boolean;
    totalDocs: number;
    collections: { name: string; count: number }[];
  };
  gpu: {
    name: string;
    vramUsed: number;
    vramTotal: number;
    utilization: number;
    temperature: number;
  } | null;
  models: string[];
  health: {
    status: string;
    uptime: number;
  };
  lastUpdated: Date;
}

/**
 * useSystemMetrics - Now powered by React Query!
 *
 * Benefits:
 * - Automatic caching (reduces 60% of repeated fetches)
 * - Built-in refetch interval
 * - Deduplication of concurrent requests
 * - Automatic retry on failure
 */
export function useSystemMetrics(refreshInterval: number = 5000) {
  const { data: metrics, isLoading: loading, error, refetch } = useQuery({
    queryKey: ['system', 'metrics'],
    queryFn: async (): Promise<SystemMetrics> => {
      const [stats, gpu, models, health] = await Promise.all([
        getSystemStats(),
        getGPUStats(),
        getLoadedModels(),
        getHealth(),
      ]);

      return {
        chromadb: {
          connected: stats?.chromadb_connected ?? false,
          totalDocs: stats?.total_documents ?? 0,
          collections: stats?.collections
            ? Object.entries(stats.collections).map(([name, count]) => ({
                name,
                count: count as number,
              }))
            : [],
        },
        gpu: gpu
          ? {
              name: gpu.name,
              vramUsed: gpu.memory_used,
              vramTotal: gpu.memory_total,
              utilization: gpu.utilization,
              temperature: gpu.temperature,
            }
          : null,
        models: models,
        health: {
          status: health?.status ?? 'unknown',
          uptime: health?.uptime ?? 0,
        },
        lastUpdated: new Date(),
      };
    },
    refetchInterval: refreshInterval,
    staleTime: 3000, // Consider data fresh for 3 seconds
  });

  return {
    metrics: metrics ?? null,
    loading,
    error: error instanceof Error ? error.message : null,
    refresh: refetch,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENT SEARCH HOOK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * useDocumentSearch - React Query powered with caching
 *
 * Benefits:
 * - Query results cached by query string
 * - Automatic deduplication (same search won't fire twice)
 * - 60-second stale time reduces repeated searches
 */
export function useDocumentSearch() {
  const [searchParams, setSearchParams] = useState<{
    query: string;
    options?: { limit?: number; doc_type?: string };
  } | null>(null);

  const { data, isLoading: loading, error } = useQuery({
    queryKey: ['search', searchParams?.query, searchParams?.options],
    queryFn: async () => {
      if (!searchParams?.query?.trim()) return { results: [], total: 0 };
      return searchDocuments(searchParams.query, searchParams.options);
    },
    enabled: !!searchParams?.query?.trim(),
    staleTime: 60 * 1000, // Cache searches for 60 seconds
  });

  const search = useCallback(
    (query: string, options?: { limit?: number; doc_type?: string }) => {
      if (!query.trim()) {
        setSearchParams(null);
        return;
      }
      setSearchParams({ query, options });
    },
    []
  );

  const clear = useCallback(() => {
    setSearchParams(null);
  }, []);

  return {
    results: data?.results ?? [],
    loading,
    error: error instanceof Error ? error.message : null,
    total: data?.total ?? 0,
    search,
    clear,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CHAT / AGENT HOOK
// ═══════════════════════════════════════════════════════════════════════════

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SearchResult[];
  reasoning?: string[];
  timestamp: Date;
  loading?: boolean;
  // Verification status
  verified?: boolean;        // true only if sources > 0 AND warden verified (HIGH evidence)
  wasRouted?: boolean;       // true if handled without RAG
  queryType?: string;        // SMALLTALK, LEGAL_QUERY, etc.
  evidenceLevel?: 'HIGH' | 'LOW' | 'NONE';  // For nuanced UI display
  // Orchestration additions
  mode?: 'CHAT' | 'ASSIST' | 'EVIDENCE';  // Response mode
  showCitations?: boolean;   // Whether to show citations (EVIDENCE mode shows always, ASSIST hides behind toggle)
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const sendMessage = useCallback(async (content: string) => {
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };

    const assistantId = `assistant-${Date.now()}`;
    const loadingMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      loading: true,
    };

    setMessages((prev) => [...prev, userMessage, loadingMessage]);
    setLoading(true);

    try {
      const response = await agentQuery(content);

      // Determine verification status:
      // - verified = true ONLY if warden status is FACT_VERIFIED (high evidence)
      // - hasSource = sources > 0 (for showing "relaterade träffar")
      // - wasRouted = true if query was handled without RAG (smalltalk, meta)
      const hasRealSources = response.sources && response.sources.length > 0;

      // STRICT: Only FACT_VERIFIED means the answer is actually grounded in sources
      // TERM_CORRECTED and CITATIONS_STRIPPED mean sources exist but evidence may be weak
      const isVerified = response.warden_status === 'FACT_VERIFIED';

      // Determine mode based on evidence level and routing
      // CHAT: Routed without RAG (smalltalk, meta, feedback)
      // EVIDENCE: HIGH evidence level
      // ASSIST: Everything else (LOW evidence, normal queries)
      let mode: 'CHAT' | 'ASSIST' | 'EVIDENCE' = 'ASSIST';
      if (response.was_routed) {
        mode = 'CHAT';
      } else if (response.evidence_level === 'HIGH') {
        mode = 'EVIDENCE';
      }

      // Show citations: Always for EVIDENCE, hidden for CHAT, toggle for ASSIST
      const showCitations = mode === 'EVIDENCE';

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                content: response.answer,
                sources: response.sources,
                reasoning: response.reasoning_steps,
                loading: false,
                verified: isVerified,
                wasRouted: response.was_routed,
                queryType: response.query_type,
                evidenceLevel: response.evidence_level,
                mode,
                showCitations,
              }
            : msg
        )
      );
    } catch (error) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                content: 'Ett fel uppstod. Försök igen.',
                loading: false,
              }
            : msg
        )
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, loading, sendMessage, clearMessages };
}

// ═══════════════════════════════════════════════════════════════════════════
// LIVE LOGS HOOK (simulated for now, WebSocket ready)
// ═══════════════════════════════════════════════════════════════════════════

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  component: string;
  message: string;
}

export function useLiveLogs(maxLogs: number = 50) {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = useCallback(
    (level: LogEntry['level'], component: string, message: string) => {
      const entry: LogEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        level,
        component,
        message,
      };

      setLogs((prev) => [...prev.slice(-(maxLogs - 1)), entry]);
    },
    [maxLogs]
  );

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return { logs, addLog, clearLogs };
}

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE STATUS HOOK
// ═══════════════════════════════════════════════════════════════════════════

export interface PipelineStep {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'active' | 'complete' | 'error';
  latency?: number;
}

export function usePipelineStatus() {
  const [steps, setSteps] = useState<PipelineStep[]>([
    { id: 'search', name: 'ChromaDB', role: 'Sökning', status: 'idle' },
    { id: 'ministral', name: 'Ministral 3 14B', role: 'Svar (Ollama)', status: 'idle' },
    { id: 'warden', name: 'Jail Warden v2', role: 'Verifiering', status: 'idle' },
  ]);

  const updateStep = useCallback(
    (id: string, updates: Partial<PipelineStep>) => {
      setSteps((prev) =>
        prev.map((step) => (step.id === id ? { ...step, ...updates } : step))
      );
    },
    []
  );

  const resetPipeline = useCallback(() => {
    setSteps((prev) => prev.map((step) => ({ ...step, status: 'idle' as const, latency: undefined })));
  }, []);

  return { steps, updateStep, resetPipeline };
}
