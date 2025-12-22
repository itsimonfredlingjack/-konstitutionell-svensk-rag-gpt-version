"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Activity, Database, Radio, CheckCircle2 } from "lucide-react";
import { GlassTile } from "./GlassTile";
import clsx from "clsx";

interface IntelligenceHudProps {
    isVisible: boolean;
    isThinking: boolean;
    logs: string[];
    citations: any[]; // Using any for now, refine with ChatSource type later
}

export const IntelligenceHud = ({ isVisible, isThinking, logs, citations }: IntelligenceHudProps) => {
    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ x: 50, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 50, opacity: 0 }}
                    transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
                    className="h-full w-[400px] shrink-0 border-l border-white/5 bg-[#05050A]/50 backdrop-blur-xl flex flex-col"
                >
                    {/* Header: System Status */}
                    <div className="h-16 px-6 border-b border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Activity size={16} className={isThinking ? "text-cyan-400 animate-pulse" : "text-emerald-500"} />
                            <span className="text-xs font-mono uppercase tracking-widest text-zinc-400">
                                {isThinking ? "ANALYSERAR RESONEMANGSSTRÖM" : "SYSTEMET VÄNTAR"}
                            </span>
                        </div>
                    </div>

                    {/* Content Scroll Area */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">

                        {/* Section 1: Live Logs (Only when thinking) */}
                        <AnimatePresence>
                            {(isThinking || logs.length > 0) && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="space-y-3"
                                >
                                    <div className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase tracking-wider mb-2">
                                        <Radio size={12} />
                                        <span>Procesström</span>
                                    </div>
                                    <div className="font-mono text-xs space-y-1">
                                        {logs.slice(-5).map((log, i) => (
                                            <motion.div
                                                key={i}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                className="text-cyan-200/70 truncate border-l-2 border-cyan-500/20 pl-2"
                                            >
                                                {log}
                                            </motion.div>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Section 2: Evidence Pinboard */}
                        {citations.length > 0 && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase tracking-wider">
                                    <Database size={12} />
                                    <span>Verifierad Data ({citations.length})</span>
                                </div>
                                <div className="space-y-3">
                                    {citations.map((source, idx) => (
                                        <motion.div
                                            key={source.id}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: idx * 0.1 }}
                                        >
                                            <GlassTile
                                                title={source.title}
                                                type={source.title.toLowerCase().includes("lag") ? "law" : "doc"}
                                                className="border-white/5 bg-white/5"
                                            >
                                                <div className="line-clamp-3 opacity-80 italic">
                                                    "{source.text || "Ingen förhandstitt tillgänglig..."}"
                                                </div>
                                                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-400/80">
                                                    <CheckCircle2 size={10} />
                                                    <span>Relevans: {(source.score * 100).toFixed(0)}%</span>
                                                </div>
                                            </GlassTile>
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
