"use client";

import { useState, useEffect, useCallback } from 'react';
import {
  getSystemStats,
  getGPUStats,
  getLoadedModels,
  getHealth,
  searchDocuments,
  agentQuery,
  type SystemStats,
  type GPUStats,
  type SearchResult,
  type AgentResponse,
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

export function useSystemMetrics(refreshInterval: number = 5000) {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [stats, gpu, models, health] = await Promise.all([
        getSystemStats(),
        getGPUStats(),
        getLoadedModels(),
        getHealth(),
      ]);

      setMetrics({
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
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, refreshInterval);
    return () => clearInterval(interval);
  }, [refresh, refreshInterval]);

  return { metrics, loading, error, refresh };
}

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENT SEARCH HOOK
// ═══════════════════════════════════════════════════════════════════════════

export function useDocumentSearch() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const search = useCallback(
    async (query: string, options?: { limit?: number; doc_type?: string }) => {
      if (!query.trim()) {
        setResults([]);
        setTotal(0);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await searchDocuments(query, options);
        setResults(response.results);
        setTotal(response.total);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const clear = useCallback(() => {
    setResults([]);
    setTotal(0);
    setError(null);
  }, []);

  return { results, loading, error, total, search, clear };
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
    { id: 'gpt-oss', name: 'GPT-OSS', role: 'Svar (llama-server)', status: 'idle' },
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
