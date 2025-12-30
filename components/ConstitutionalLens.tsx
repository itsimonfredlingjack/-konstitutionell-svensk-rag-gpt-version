"use client";

import { ShieldCheck, ArrowRight, BrainCircuit, Database, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

// Define the pipeline steps - Two-model architecture
const steps = [
    { id: "chromadb", name: "ChromaDB", role: "Vektordatabas", status: "complete" },
    { id: "gemma", name: "Gemma 3", role: "BRAIN (Faktasvar)", status: "complete" },
    { id: "gpt-sw3", name: "GPT-SW3", role: "VOICE (Svenska)", status: "active" }
];

export const ConstitutionalLens = () => {
    return (
        <div className="flex flex-col border-b border-white/10 bg-black/40 backdrop-blur-xl z-20 relative overflow-hidden group">
            {/* Frosted Noise Texture Overlay */}
            <div className="absolute inset-0 opacity-[0.15] pointer-events-none z-0"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
            />

            {/* Top Bar: Title & The Living Core */}
            <div className="flex items-center justify-between px-6 py-4 relative z-10">
                <div className="flex items-center gap-5">

                    {/* THE LIVING CORE EMBLEM */}
                    <div className="relative w-12 h-12 flex items-center justify-center">
                        {/* Outer Spinner */}
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                            className="absolute inset-0 rounded-full border border-cyan-500/30 border-t-transparent border-l-transparent shadow-[0_0_15px_rgba(6,182,212,0.2)]"
                        />
                        {/* Middle Counter-Spinner */}
                        <motion.div
                            animate={{ rotate: -360 }}
                            transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
                            className="absolute inset-2 rounded-full border border-cyan-400/20 border-b-transparent border-r-transparent"
                        />
                        {/* The Pulse Core */}
                        <div className="relative z-10 p-2 bg-cyan-500/10 rounded-full border border-cyan-400/40 backdrop-blur-sm">
                            <motion.div
                                animate={{ scale: [1, 1.2, 1], opacity: [0.8, 1, 0.8] }}
                                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                            >
                                <Cpu className="w-5 h-5 text-cyan-300" />
                            </motion.div>
                        </div>
                        {/* Glow Field */}
                        <div className="absolute inset-0 bg-cyan-500/5 blur-xl rounded-full animate-pulse" />
                    </div>

                    <div className="flex flex-col gap-1">
                        <h2 className="text-base font-bold text-cyan-50 tracking-wider text-shadow-md flex items-center gap-2">
                            CONSTITUTIONAL GPT
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-mono">
                                v0.01
                            </span>
                        </h2>

                        {/* Neural Resonance Bar */}
                        <div className="flex items-center gap-1 h-2">
                            <span className="text-[9px] font-mono text-cyan-500/60 uppercase tracking-widest mr-2">Kärnintegritet</span>
                            {[1, 0.4, 0.8, 0.3, 1, 0.5, 0.9, 0.2].map((opacity, i) => (
                                <motion.div
                                    key={i}
                                    animate={{ height: [4, 8, 4], opacity: [0.3, 1, 0.3] }}
                                    transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.1, ease: "easeInOut" }}
                                    className="w-1 bg-cyan-400/80 rounded-full shadow-[0_0_5px_rgba(34,211,238,0.5)]"
                                    style={{ opacity: 0.8 }}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Model Specs Pill */}
                <div className="flex flex-col items-end gap-1">
                    <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono text-white/40 shadow-inner backdrop-blur-md group-hover:border-cyan-500/30 transition-colors duration-500">
                        <Database size={12} className="text-white/20 group-hover:text-cyan-400 transition-colors" />
                        <span>KBLab/swe-bert</span>
                    </div>
                    <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono text-white/40 shadow-inner backdrop-blur-md group-hover:border-cyan-500/30 transition-colors duration-500">
                        <span>Powered by PaddleOCR</span>
                    </div>
                </div>
            </div>

            {/* Pipeline Visualization Strip */}
            <div className="flex items-center px-6 pb-4 gap-2 overflow-x-auto no-scrollbar">
                {steps.map((step, idx) => {
                    const isActive = step.status === "active";
                    const isComplete = step.status === "complete";

                    return (
                        <div key={step.id} className="flex items-center gap-2 shrink-0">
                            {/* Connector Line (skip first) */}
                            {idx > 0 && (
                                <ArrowRight size={12} className={cn(
                                    "mx-1 transition-colors",
                                    isComplete || isActive ? "text-cyan-400" : "text-white/10"
                                )} />
                            )}

                            {/* Step Node */}
                            <div className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-500",
                                isActive
                                    ? "bg-cyan-500/10 border-cyan-400/50 shadow-[0_0_15px_-3px_rgba(6,182,212,0.3)] min-w-[140px]"
                                    : isComplete
                                        ? "bg-emerald-500/10 border-emerald-500/30 opacity-80"
                                        : "bg-transparent border-transparent opacity-40 grayscale"
                            )}>
                                <BrainCircuit size={14} className={cn(
                                    isActive ? "text-cyan-400 animate-pulse" : isComplete ? "text-emerald-400" : "text-white/20"
                                )} />
                                <div className="flex flex-col">
                                    <span className={cn(
                                        "text-[10px] font-bold uppercase tracking-wider leading-none mb-0.5",
                                        isActive ? "text-cyan-200" : "text-white/60"
                                    )}>
                                        {step.name}
                                    </span>
                                    {isActive && (
                                        <span className="text-[9px] text-cyan-400 font-mono leading-none animate-pulse">
                                            {step.role} {">>"}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Decorative progress line */}
            <div className="h-[1px] w-full bg-gradient-to-r from-cyan-500/0 via-cyan-500/50 to-cyan-500/0 opacity-50" />
        </div>
    );
};
