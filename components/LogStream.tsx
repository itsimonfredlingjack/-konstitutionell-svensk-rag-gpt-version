"use client";

import { Terminal, Cpu } from "lucide-react";

export const LogStream = () => {
    return (
        <div className="flex flex-col gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md h-[40%] overflow-hidden relative">
            <div className="flex justify-between items-center mb-1 border-b border-white/5 pb-2">
                <div className="flex items-center gap-2">
                    <Terminal size={14} className="text-purple-400" />
                    <span className="text-xs font-medium text-white/60">Core Logs</span>
                </div>
                <Cpu size={14} className="text-white/20 animate-pulse" />
            </div>

            <div className="flex flex-col gap-2 font-mono text-[9px] text-purple-200/60 overflow-hidden">
                {/* Pipeline logs - Two-model architecture */}
                <div className="opacity-90"><span className="text-white/30">[17:24:01]</span> {">>"} [ORCHESTRATOR] Query analyzed → ASSIST mode</div>
                <div className="opacity-80"><span className="text-white/30">[17:24:02]</span> {">>"} [CHROMADB] Retrieving documents...</div>
                <div className="opacity-70 text-emerald-400/80"><span className="text-white/30">[17:24:02]</span> {">>"} [CHROMADB] Context retrieved (5 docs)</div>
                <div className="opacity-60"><span className="text-white/30">[17:24:03]</span> {">>"} [GEMMA-3] Pass A: Generating draft...</div>
                <div className="opacity-50 text-cyan-400/80"><span className="text-white/30">[17:24:04]</span> {">>"} [GPT-SW3] Pass B: Applying style...</div>
                <div className="text-cyan-400 font-bold animate-pulse"><span className="text-white/30">[17:24:05]</span> {">>"} [GPT-SW3] STREAMING RESPONSE...</div>
            </div>

            {/* Overlay gradient for fade effect */}
            <div className="absolute bottom-0 left-0 w-full h-12 bg-gradient-to-t from-[#05050A]/40 to-transparent pointer-events-none" />
        </div>
    );
};
