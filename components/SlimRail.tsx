"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import {
    Cpu,
    Database,
    Terminal,
    Settings,
    Shield,
    Activity,
    Server,
    Zap,
    Pin,
    PinOff,
    Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSystemMetrics, usePipelineStatus } from "@/lib/hooks";

// Types for our menu configuration
type ViewId = 'system' | 'index' | 'vram' | 'config';

const MENU_ITEMS = [
    { id: 'system', icon: Shield, label: 'Systemkärna' },
    { id: 'index', icon: Database, label: 'Kunskapsbas' },
    { id: 'vram', icon: Cpu, label: 'Minne / VRAM' },
    { id: 'config', icon: Settings, label: 'Konfiguration' },
];

const Sparkline = ({ color }: { color: string }) => {
    const points = [4, 8, 5, 12, 7, 10, 6];
    return (
        <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
            <svg width="24" height="12" className="overflow-visible">
                <motion.path
                    d={`M 0 ${points[0]} ${points.map((p, i) => `L ${i * 4} ${p}`).join(' ')}`}
                    fill="none"
                    stroke={color}
                    strokeWidth="1"
                    initial={{ pathLength: 0 }}
                    animate={{
                        pathLength: 1,
                        d: [
                            `M 0 6 L 4 8 L 8 4 L 12 10 L 16 6 L 20 8 L 24 4`,
                            `M 0 4 L 4 10 L 8 6 L 12 8 L 16 4 L 20 10 L 24 6`,
                            `M 0 6 L 4 8 L 8 4 L 12 10 L 16 6 L 20 8 L 24 4`
                        ]
                    }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                />
            </svg>
        </div>
    );
};

export const SlimRail = () => {
    // State
    const [activeView, setActiveView] = useState<ViewId | null>(null);
    const [isPinned, setIsPinned] = useState(false);

    // Real system metrics from backend
    const { metrics, loading: metricsLoading, error: metricsError } = useSystemMetrics(5000);
    const { steps: pipelineSteps } = usePipelineStatus();

    // Bottom Card State (Transient Logs)
    const [isProcessing, setIsProcessing] = useState(false);
    const [recentLogs, setRecentLogs] = useState<string[]>([
        "Systemet initierat",
        "Väntar på indata..."
    ]);

    // Helper function to format numbers with K/M suffix
    const formatNumber = (num: number): string => {
        if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
        if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
        return num.toString();
    };

    // Helper function to format bytes to GB
    const formatGB = (mb: number): string => {
        return `${(mb / 1024).toFixed(1)}GB`;
    };

    // Toggle Logic
    const handleIconClick = (id: ViewId) => {
        if (activeView === id && !isPinned) {
            setActiveView(null);
        } else {
            setActiveView(id);
        }
    };

    // Global Dismissal
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (isPinned) setIsPinned(false);
                setActiveView(null);
            }
        };

        const handleClickOutside = (e: MouseEvent) => {
            if (isPinned) return;

            const target = e.target as HTMLElement;
            const isRail = target.closest('#slim-rail');
            const isCard = target.closest('#primary-card');

            if (!isRail && !isCard) {
                setActiveView(null);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('mousedown', handleClickOutside);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isPinned]);

    // Mock Streaming/Log Logic
    useEffect(() => {
        const interval = setInterval(() => {
            setIsProcessing(true);
            setRecentLogs(prev => ["Frågar vektorindex...", ...prev.slice(0, 2)]);

            setTimeout(() => {
                setRecentLogs(prev => ["Hämtar fragment...", ...prev.slice(0, 2)]);
            }, 1000);

            setTimeout(() => {
                setRecentLogs(prev => ["Genererar svar...", ...prev.slice(0, 2)]);
            }, 2500);

            setTimeout(() => {
                setIsProcessing(false);
                setRecentLogs(prev => ["Vänteläge", ...prev.slice(0, 2)]);
            }, 4500);
        }, 12000); // Every 12s demo loop

        return () => clearInterval(interval);
    }, []);

    return (
        <>
            {/* 1. THE RAIL (Fixed Navigation) */}
            <div id="slim-rail" className="fixed right-0 top-0 h-full w-20 flex flex-col items-center py-8 z-50 bg-[#0A0A0B] border-l border-white/5">

                {/* Status Indicator */}
                <div className="mb-8 w-10 h-10 flex items-center justify-center">
                    <div className={cn("w-2 h-2 rounded-full transition-colors duration-500", isProcessing ? "bg-cyan-400 animate-pulse" : "bg-emerald-500")} />
                </div>

                {/* Icons */}
                <div className="flex flex-col gap-6 w-full items-center">
                    {MENU_ITEMS.map((item) => {
                        const isActive = activeView === item.id;
                        const Icon = item.icon;

                        return (
                            <button
                                key={item.id}
                                onClick={() => handleIconClick(item.id as ViewId)}
                                className={cn(
                                    "relative w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-300 group overflow-hidden",
                                    isActive
                                        ? "text-cyan-400 bg-cyan-950/30"
                                        : "text-zinc-500 hover:text-zinc-200 hover:bg-white/5"
                                )}
                            >
                                <Icon size={20} strokeWidth={1.5} className="relative z-10" />

                                {/* Telemetry Sparkline */}
                                <Sparkline color={isActive ? "#22d3ee" : "#3f3f46"} />

                                {/* Active Indicator Bar */}
                                {isActive && (
                                    <motion.div
                                        layoutId="active-rail-indicator"
                                        className={cn(
                                            "absolute -left-[18px] top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full shadow-[0_0_8px_rgba(6,182,212,0.6)]",
                                            isPinned ? "bg-cyan-400 h-8" : "bg-cyan-500/50"
                                        )}
                                    />
                                )}

                                {/* Hover Label */}
                                <div className="absolute right-14 px-3 py-1.5 bg-zinc-900 border border-white/10 text-xs text-zinc-300 rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
                                    {item.label}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 2. THE LEFT ZONE (Invisible Grid) */}
            {/* X-start: 80px (rail) + 24px = 104px */}
            <div className="fixed right-[104px] top-24 w-[360px] flex flex-col gap-4 z-40 pointer-events-none">

                {/* A. PRIMARY CARD (Pinned Top) */}
                <AnimatePresence>
                    {activeView && (
                        <motion.div
                            layout
                            id="primary-card"
                            initial={{ opacity: 0, x: 20, scale: 0.95 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 20, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                            className="pointer-events-auto bg-[#0F0F11]/90 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
                        >
                            {/* Header */}
                            <div className="h-10 px-4 border-b border-white/5 flex items-center justify-between bg-white/5">
                                <span className="text-[10px] font-bold text-zinc-400 tracking-widest uppercase">
                                    {MENU_ITEMS.find(i => i.id === activeView)?.label}
                                </span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsPinned(!isPinned);
                                    }}
                                    className={cn(
                                        "p-1.5 rounded transition-colors",
                                        isPinned ? "text-cyan-400 bg-cyan-400/10" : "text-zinc-600 hover:text-zinc-300"
                                    )}
                                >
                                    {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                                </button>
                            </div>

                            {/* Dynamic Content Surface */}
                            <div className="p-5 min-h-[180px]">
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={activeView}
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -5 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        {activeView === 'system' && (
                                            <div className="space-y-4">
                                                <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg border border-white/5">
                                                    <div className="flex items-center gap-3">
                                                        {metricsLoading ? (
                                                            <Loader2 size={16} className="text-zinc-500 animate-spin" />
                                                        ) : (
                                                            <Activity size={16} className={metrics?.health.status === 'healthy' ? 'text-emerald-500' : 'text-amber-500'} />
                                                        )}
                                                        <span className="text-xs text-zinc-300">Systemhälsa</span>
                                                    </div>
                                                    <span className={cn(
                                                        "text-xs font-mono",
                                                        metrics?.health.status === 'healthy' ? 'text-emerald-400' : 'text-amber-400'
                                                    )}>
                                                        {metricsLoading ? '...' : metrics?.health.status === 'healthy' ? 'OPTIMAL' : 'VARNING'}
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                                                        <div className="text-[10px] text-zinc-500 uppercase">Dokument</div>
                                                        <div className="text-lg font-mono text-zinc-200">
                                                            {metricsLoading ? '...' : formatNumber(metrics?.chromadb.totalDocs ?? 0)}
                                                        </div>
                                                    </div>
                                                    <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                                                        <div className="text-[10px] text-zinc-500 uppercase">Modeller</div>
                                                        <div className="text-lg font-mono text-zinc-200">
                                                            {metricsLoading ? '...' : metrics?.models.length ?? 0}
                                                        </div>
                                                    </div>
                                                </div>
                                                {metrics?.gpu && (
                                                    <div className="text-[10px] text-zinc-500 text-center">
                                                        GPU: {metrics.gpu.name} • {metrics.gpu.temperature}°C
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {activeView === 'index' && (
                                            <div className="space-y-4">
                                                <div className="flex flex-col gap-1 p-4 bg-emerald-950/10 border border-emerald-500/20 rounded-xl relative overflow-hidden">
                                                    <div className="absolute top-0 right-0 p-3 opacity-20">
                                                        <Database size={48} />
                                                    </div>
                                                    <span className="text-xs text-emerald-400/80 uppercase tracking-wider">ChromaDB</span>
                                                    <span className="text-2xl font-mono text-emerald-100">
                                                        {metricsLoading ? '...' : formatNumber(metrics?.chromadb.totalDocs ?? 0)}
                                                    </span>
                                                    <div className="h-1 w-full bg-emerald-900/50 rounded-full mt-2 overflow-hidden">
                                                        <div
                                                            className="h-full bg-emerald-500 transition-all duration-500"
                                                            style={{ width: metrics?.chromadb.connected ? '100%' : '0%' }}
                                                        />
                                                    </div>
                                                </div>
                                                {/* Collection breakdown */}
                                                {metrics?.chromadb.collections && metrics.chromadb.collections.length > 0 && (
                                                    <div className="space-y-1">
                                                        {metrics.chromadb.collections.slice(0, 3).map((col) => (
                                                            <div key={col.name} className="flex justify-between text-[10px] px-2">
                                                                <span className="text-zinc-500 truncate max-w-[180px]">{col.name}</span>
                                                                <span className="text-zinc-400 font-mono">{formatNumber(col.count)}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                <div className="text-[10px] text-zinc-500 text-center">
                                                    {metrics?.chromadb.connected ? '● Ansluten' : '○ Frånkopplad'} • KBLab Embeddings
                                                </div>
                                            </div>
                                        )}

                                        {activeView === 'vram' && (
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-xs text-zinc-400 px-1">
                                                    <span>VRAM-användning</span>
                                                    <span>
                                                        {metricsLoading ? '...' : metrics?.gpu
                                                            ? `${formatGB(metrics.gpu.vramUsed)} / ${formatGB(metrics.gpu.vramTotal)}`
                                                            : 'Ej tillgänglig'}
                                                    </span>
                                                </div>
                                                <div className="h-32 bg-zinc-900 rounded-lg border border-white/5 relative overflow-hidden">
                                                    {/* VRAM usage bar */}
                                                    {metrics?.gpu && (
                                                        <div className="absolute inset-0 flex items-end p-2">
                                                            <div
                                                                className="w-full bg-gradient-to-t from-purple-600 to-purple-400 rounded transition-all duration-500"
                                                                style={{
                                                                    height: `${(metrics.gpu.vramUsed / metrics.gpu.vramTotal) * 100}%`
                                                                }}
                                                            />
                                                        </div>
                                                    )}
                                                    {/* GPU utilization overlay */}
                                                    {metrics?.gpu && (
                                                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                                                            <span className="text-3xl font-mono text-white/90">{metrics.gpu.utilization}%</span>
                                                            <span className="text-[10px] text-zinc-400 uppercase tracking-wider">GPU Load</span>
                                                        </div>
                                                    )}
                                                    {!metrics?.gpu && !metricsLoading && (
                                                        <div className="absolute inset-0 flex items-center justify-center">
                                                            <span className="text-xs text-zinc-500">Ingen GPU data</span>
                                                        </div>
                                                    )}
                                                </div>
                                                {metrics?.gpu && (
                                                    <div className="flex justify-between text-[10px] text-zinc-500 px-1">
                                                        <span>{metrics.gpu.name}</span>
                                                        <span>{metrics.gpu.temperature}°C</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {activeView === 'config' && (
                                            <div className="space-y-2">
                                                {['Säkert läge', 'Auto-arkivering', 'Strömma utdata'].map((setting) => (
                                                    <div key={setting} className="flex items-center justify-between p-3 hover:bg-white/5 rounded-lg transition-colors cursor-pointer group">
                                                        <span className="text-xs text-zinc-300">{setting}</span>
                                                        <div className="w-8 h-4 bg-zinc-800 rounded-full relative border border-white/5 group-hover:border-zinc-600">
                                                            <div className="absolute right-0.5 top-0.5 h-3 w-3 bg-zinc-500 rounded-full" />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </motion.div>
                                </AnimatePresence>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* B. LIVE EVENTS (Transient, Auto-Bottom) */}
                <AnimatePresence>
                    {isProcessing && (
                        <motion.div
                            initial={{ opacity: 0, height: 0, y: -10 }}
                            animate={{ opacity: 1, height: 'auto', y: 0 }}
                            exit={{ opacity: 0, height: 0, y: -10 }}
                            className="pointer-events-auto bg-[#0F0F11]/80 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden"
                        >
                            <div className="p-3 space-y-2">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                                    <span className="text-[10px] font-bold text-cyan-500 uppercase tracking-wider">Liveström</span>
                                </div>
                                <div className="space-y-1 font-mono text-[10px]">
                                    {recentLogs.map((log, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, x: 5 }}
                                            animate={{ opacity: 1 - (i * 0.3), x: 0 }}
                                            className="text-zinc-300 truncate"
                                        >
                                            <span className="text-zinc-600 mr-2">{`>`}</span>
                                            {log}
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

            </div>
        </>
    );
};
