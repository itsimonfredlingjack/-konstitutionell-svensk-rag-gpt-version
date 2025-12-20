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
                {/* Fake logs */}
                <div className="opacity-90"><span className="text-white/30">[17:24:01]</span> {">>"} [GEMMA-270M] Intent detected: "Recall Procedure"</div>
                <div className="opacity-80"><span className="text-white/30">[17:24:02]</span> {">>"} [HERMES-8B] Reasoning loop complete (3 steps)</div>
                <div className="opacity-70 text-emerald-400/80"><span className="text-white/30">[17:24:02]</span> {">>"} [QDRANT] Context retrieved & verified</div>
                <div className="opacity-60"><span className="text-white/30">[17:24:03]</span> {">>"} [HERMES-8B] Handoff payload prepared</div>
                <div className="opacity-50 text-cyan-400/80"><span className="text-white/30">[17:24:03]</span> {">>"} [GPT-OSS] Receiving context stream...</div>
                <div className="text-cyan-400 font-bold animate-pulse"><span className="text-white/30">[17:24:05]</span> {">>"} [GPT-OSS] GENERATING RESPONSE...</div>
            </div>

            {/* Overlay gradient for fade effect */}
            <div className="absolute bottom-0 left-0 w-full h-12 bg-gradient-to-t from-[#05050A]/40 to-transparent pointer-events-none" />
        </div>
    );
};
