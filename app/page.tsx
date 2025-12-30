"use client";

import { Background } from "@/components/Background";
import { MainLayout } from "@/components/MainLayout";
import { GlassPanel } from "@/components/GlassPanel";
import { ConstitutionalLens } from "@/components/ConstitutionalLens";
import { DocumentStack } from "@/components/DocumentStack";
import { SlimRail } from "@/components/SlimRail";
import { FloatingCapsule } from "@/components/FloatingCapsule";
import { IntelligenceHud } from "@/components/IntelligenceHud";
import { GlassTile } from "@/components/GlassTile";
import { User, Loader2, Sparkles, AlertCircle, ChevronDown, ChevronUp, FileText } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { useChat } from "@/lib/hooks";

// ═══════════════════════════════════════════════════════════════════════════
// SOURCES DISPLAY - Conditional based on mode
// ═══════════════════════════════════════════════════════════════════════════

interface SourcesDisplayProps {
    sources: { id: string; title: string; snippet?: string }[];
    mode?: 'CHAT' | 'ASSIST' | 'EVIDENCE';
    showCitations?: boolean;
}

const SourcesDisplay = ({ sources, mode, showCitations }: SourcesDisplayProps) => {
    const [expanded, setExpanded] = useState(false);

    // CHAT mode: Never show sources (they shouldn't exist anyway)
    if (mode === 'CHAT') {
        return null;
    }

    // EVIDENCE mode: Always show sources
    if (mode === 'EVIDENCE' || showCitations) {
        return (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2 w-full ml-auto">
                {sources.slice(0, 2).map((source) => (
                    <GlassTile
                        key={source.id}
                        title={source.title}
                        type={source.title.toLowerCase().includes('lag') ? 'law' : 'doc'}
                        className="border-white/5 bg-white/5 hover:bg-white/10"
                    >
                        <div className="line-clamp-2 text-xs opacity-70">
                            Citerat stöd för ovanstående resonemang.
                        </div>
                    </GlassTile>
                ))}
                {sources.length > 2 && (
                    <div className="col-span-2 text-[10px] text-center text-zinc-500 uppercase tracking-widest mt-2">
                        + {sources.length - 2} ytterligare källor i HUD
                    </div>
                )}
            </div>
        );
    }

    // ASSIST mode: Show "Visa källor" toggle
    return (
        <div className="mt-4 w-full">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2 text-xs text-cyan-400/70 hover:text-cyan-400 transition-colors group"
            >
                <FileText size={12} className="opacity-60 group-hover:opacity-100" />
                <span>{expanded ? 'Dölj källor' : `Visa källor (${sources.length})`}</span>
                {expanded ? (
                    <ChevronUp size={12} className="opacity-60" />
                ) : (
                    <ChevronDown size={12} className="opacity-60" />
                )}
            </button>

            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                            {sources.slice(0, 4).map((source) => (
                                <GlassTile
                                    key={source.id}
                                    title={source.title}
                                    type={source.title.toLowerCase().includes('lag') ? 'law' : 'doc'}
                                    className="border-white/5 bg-white/5 hover:bg-white/10"
                                >
                                    <div className="line-clamp-2 text-xs opacity-70">
                                        {source.snippet || 'Relaterat dokument'}
                                    </div>
                                </GlassTile>
                            ))}
                        </div>
                        {sources.length > 4 && (
                            <div className="text-[10px] text-center text-zinc-500 uppercase tracking-widest mt-2">
                                + {sources.length - 4} ytterligare källor
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// STARTUP OVERLAY
// ═══════════════════════════════════════════════════════════════════════════

const StartupOverlay = () => {
    return (
        <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 1, delay: 2.5, ease: "easeInOut" }}
            onAnimationComplete={() => document.body.style.overflow = "auto"}
            className="fixed inset-0 z-[100] bg-[#0A0A0B] flex flex-col items-center justify-center font-mono pointer-events-none"
        >
            <div className="space-y-4 text-center">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="text-cyan-500 text-xs tracking-[0.3em] uppercase mb-8"
                >
                    Systeminitiering
                </motion.div>
                <div className="flex flex-col gap-2 max-w-xs text-left text-[9px] text-zinc-600 uppercase">
                    {[
                        "Dekrypterar neurala partitioner...",
                        "Synkroniserar vektorvikter...",
                        "Konfigurerar Kinetic HUD...",
                        "Kärna online [Gemma 3 12B]"
                    ].map((text, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -5 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.5 + (i * 0.4) }}
                            className="flex items-center gap-3"
                        >
                            <span className="w-1 h-1 bg-cyan-900 rounded-full" />
                            {text}
                        </motion.div>
                    ))}
                </div>
            </div>
            <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 2, ease: "easeInOut" }}
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-500 to-transparent origin-center"
            />
        </motion.div>
    );
};

export default function Home() {
    const [activeDoc, setActiveDoc] = useState<number | null>(null);
    const [showStartup, setShowStartup] = useState(true);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    // Real chat hook
    const { messages, loading: chatLoading, sendMessage } = useChat();

    // HUD State Logic
    // We activate the HUD if we are thinking OR if the last message has citations
    const lastMessage = messages[messages.length - 1];
    const hasActiveCitations = lastMessage?.role === 'assistant' && (lastMessage.sources?.length ?? 0) > 0;
    const showHud = chatLoading || hasActiveCitations;

    useEffect(() => {
        const timer = setTimeout(() => setShowStartup(false), 4000);
        return () => clearTimeout(timer);
    }, []);

    // Auto-scroll
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages, showHud]);

    const handleSend = async (text: string) => {
        await sendMessage(text);
    };

    return (
        <>
            <AnimatePresence>
                {showStartup && <StartupOverlay key="startup" />}
            </AnimatePresence>

            <Background />
            <SlimRail />

            <MainLayout>
                <div className="flex w-full h-full items-center justify-center p-6 gap-6 overflow-hidden">

                    {/* Left Side: The Document Stack (Hidden when HUD is active on some screens if needed, but we keep it for now) */}
                    <motion.div
                        initial={{ opacity: 1, width: 450 }}
                        animate={{
                            width: showHud ? 0 : 450,
                            opacity: showHud ? 0 : 1
                        }}
                        transition={{ duration: 0.5, ease: "easeInOut" }}
                        className="hidden 2xl:flex shrink-0 items-center justify-center overflow-hidden"
                    >
                        <DocumentStack activeDocId={activeDoc} />
                    </motion.div>

                    {/* Center: The Monolith (Chat) */}
                    {/* We animate the width based on HUD state */}
                    <motion.div
                        layout
                        className="h-[90vh] flex flex-col relative transition-all duration-500 ease-in-out"
                        style={{
                            // If HUD is active, we shrink slightly to fit it; otherwise we are centered wide
                            width: showHud ? '60%' : 'var(--chatW)',
                            maxWidth: '1200px'
                        }}
                    >
                        <GlassPanel className="h-full w-full flex flex-col z-10 shadow-[0_0_50px_rgba(0,0,0,0.5)] border-white/5 relative">
                            <ConstitutionalLens />

                            {/* Scrollable Chat Area */}
                            {/* Added extra bottom padding for the floating capsule */}
                            <div ref={chatContainerRef} className="flex-1 p-8 pb-32 overflow-y-auto space-y-10 no-scrollbar">

                                {messages.length === 0 && (
                                    <div className="flex flex-col items-center justify-center h-full text-center space-y-6 opacity-80">
                                        <div className="relative">
                                            <div className="w-20 h-20 rounded-full bg-cyan-900/10 border border-cyan-500/20 flex items-center justify-center blur-sm absolute inset-0" />
                                            <Sparkles className="relative text-cyan-400 w-10 h-10" />
                                        </div>
                                        <div className="space-y-2">
                                            <h2 className="text-2xl font-light text-white tracking-tight">Constitutional Gemma 3 12B</h2>
                                            <p className="text-sm text-zinc-500 max-w-md mx-auto leading-relaxed">
                                                Agerar utifrån hundratusentals myndighetsdokument
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {messages.map((msg) => (
                                    <div key={msg.id} className={clsx("flex gap-6", msg.role === 'assistant' && "flex-row-reverse")}>
                                        {/* Avatar */}
                                        <div className="shrink-0 mt-2">
                                            {msg.role === 'user' ? (
                                                <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                                                    <User size={14} className="text-white/40" />
                                                </div>
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shadow-[0_0_15px_-3px_rgba(6,182,212,0.3)]">
                                                    {msg.loading ? (
                                                        <Loader2 size={14} className="text-cyan-400 animate-spin" />
                                                    ) : (
                                                        <div className="w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_10px_rgba(6,182,212,1)]" />
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Message Body */}
                                        <div className={clsx(
                                            "flex flex-col max-w-[85%]",
                                            msg.role === 'user' ? "items-start" : "items-end"
                                        )}>
                                            <div className={clsx(
                                                "py-3 px-5 text-lg leading-relaxed shadow-sm backdrop-blur-md",
                                                msg.role === 'user'
                                                    ? "bg-white/5 rounded-2xl rounded-tl-sm border border-white/5 text-zinc-100"
                                                    : "bg-transparent text-zinc-100" // Assistant text is cleaner now, less boxy
                                            )}>
                                                {msg.loading ? (
                                                    <span className="text-cyan-400/50 text-sm animate-pulse">Analyserar frågeställning...</span>
                                                ) : (
                                                    msg.content
                                                )}
                                            </div>

                                            {/* Sources with conditional display based on mode */}
                                            {msg.role === 'assistant' && !msg.loading && msg.sources && msg.sources.length > 0 && (
                                                <SourcesDisplay
                                                    sources={msg.sources}
                                                    mode={msg.mode}
                                                    showCitations={msg.showCitations}
                                                />
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Floating Capsule Input - Positioned Absolute Over Main Content */}
                            <FloatingCapsule
                                onSend={handleSend}
                                isLoading={chatLoading}
                            />

                        </GlassPanel>
                    </motion.div>

                    {/* Right Side: Intelligence HUD - Slides in */}
                    <IntelligenceHud
                        isVisible={showHud}
                        isThinking={chatLoading}
                        logs={["Initierar sökalgoritm...", "Viktar dokumentrelevans...", "Syntetiserar svar..."]} // TODO: Hook up to real stepping
                        citations={lastMessage?.sources || []}
                    />

                </div>
            </MainLayout>
        </>
    );
}
