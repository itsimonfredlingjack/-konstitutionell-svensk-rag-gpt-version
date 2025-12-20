"use client";

import { Activity, Database, Cpu, ChevronRight, ChevronDown, AlertCircle, Zap } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const SystemMonitor = () => {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className={cn(
            "flex flex-col p-4 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-md transition-all duration-300 hover:bg-white/10",
            expanded ? "h-auto w-80" : "h-auto w-64"
        )}>
            {/* Header / Toggle */}
            <div
                onClick={() => setExpanded(!expanded)}
                className="flex items-center justify-between cursor-pointer group mb-4"
            >
                <div className="flex items-center gap-3">
                    <Activity size={16} className={cn("transition-colors", expanded ? "text-cyan-400" : "text-emerald-400")} />
                    <span className="text-xs font-mono tracking-widest text-white/60 group-hover:text-white uppercase transition-colors">
                        System Core
                    </span>
                </div>
                <div className="p-1 rounded-md bg-white/5 text-white/40 group-hover:text-white transition-colors">
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
            </div>

            {/* Backbone Status (Pre-attentive Signals) */}
            <div className="flex flex-col gap-3">
                {/* 1. Index Signal */}
                <div className="flex justify-between items-center group/item">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                        <span className="text-[11px] font-medium text-white/50 group-hover/item:text-white/80 transition-colors">Index</span>
                    </div>
                    <span className="text-[11px] font-mono text-emerald-400">ONLINE</span>
                </div>

                {/* 2. Latency Signal */}
                <div className="flex justify-between items-center group/item">
                    <div className="flex items-center gap-2">
                        <Zap size={10} className="text-amber-400" />
                        <span className="text-[11px] font-medium text-white/50 group-hover/item:text-white/80 transition-colors">Latency</span>
                    </div>
                    <span className="text-[11px] font-mono text-amber-300">42ms</span>
                </div>

                {/* 3. Error Signal */}
                <div className="flex justify-between items-center group/item">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                        <span className="text-[11px] font-medium text-white/50 group-hover/item:text-white/80 transition-colors">Errors</span>
                    </div>
                    <span className="text-[11px] font-mono text-white/30">0</span>
                </div>
            </div>

            {/* One-line Context Log (Always Visible) */}
            <div className="mt-4 pt-3 border-t border-white/5">
                <div className="flex items-center gap-2 opacity-60">
                    <span className="text-cyan-400 font-mono text-[9px]">{">>"}</span>
                    <span className="text-[10px] text-white/70 font-mono truncate">GPT-OSS: Streaming...</span>
                </div>
            </div>

            {/* Expanded Debugging Metrics */}
            {expanded && (
                <div className="flex flex-col gap-4 mt-2 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="h-[1px] w-full bg-white/10 mb-2" />

                    {/* Vector DB Module */}
                    <div className="flex flex-col gap-2 p-3 rounded-xl bg-black/20">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-medium text-white/60">Qdrant Vectors</span>
                            <Database size={12} className="text-emerald-400" />
                        </div>
                        <div className="text-xl font-mono font-bold text-white tracking-tight">
                            2.08M
                        </div>
                        <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden mt-1">
                            <div className="h-full w-[98%] bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
                        </div>
                    </div>

                    {/* VRAM / Hardware Module */}
                    <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-medium text-white/60">VRAM (RTX 4070)</span>
                            <Cpu size={12} className="text-purple-400" />
                        </div>

                        {/* Memory Bars for Models */}
                        <div className="space-y-3">
                            <div>
                                <div className="flex justify-between text-[9px] font-mono text-white/40 mb-1">
                                    <span>EuroLLM-22B</span>
                                    <span className="text-purple-300">Loading</span>
                                </div>
                                <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                                    <div className="h-full w-[0%] bg-purple-500 animate-[pulse_3s_infinite]" style={{ width: '85%' }} />
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between text-[9px] font-mono text-white/40 mb-1">
                                    <span>Hermes-3 (8B)</span>
                                    <span className="text-white/20">Cached</span>
                                </div>
                                <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                                    <div className="h-full w-[30%] bg-indigo-500/50" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
