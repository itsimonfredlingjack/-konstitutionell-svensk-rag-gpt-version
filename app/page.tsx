"use client";

import { Background } from "@/components/Background";
import { MainLayout } from "@/components/MainLayout";
import { GlassPanel } from "@/components/GlassPanel";
import { ConstitutionalLens } from "@/components/ConstitutionalLens";
import { DocumentStack } from "@/components/DocumentStack";
import { SlimRail } from "@/components/SlimRail";
import { Send, User, Loader2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { useChat, type ChatMessage } from "@/lib/hooks";

const DecipherText = ({ text }: { text: string }) => {
    const [displayDescription, setDisplayDescription] = useState("");
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>/-_=+";

    useEffect(() => {
        let iteration = 0;
        const interval = setInterval(() => {
            setDisplayDescription(
                text
                    .split("")
                    .map((char, index) => {
                        if (char === " ") return " ";
                        if (index < iteration) return text[index];
                        return characters[Math.floor(Math.random() * characters.length)];
                    })
                    .join("")
            );

            if (iteration >= text.length) {
                clearInterval(interval);
            }
            iteration += 4;
        }, 40);

        return () => clearInterval(interval);
    }, [text]);

    return <span>{displayDescription}</span>;
};

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
                        "Kalibrerar konstitutionell anpassning...",
                        "Kärna online [v2.4.0]"
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
    const [isInputFocused, setIsInputFocused] = useState(false);
    const [showStartup, setShowStartup] = useState(true);
    const [inputValue, setInputValue] = useState("");
    const chatContainerRef = useRef<HTMLDivElement>(null);

    // Real chat hook connected to agentic-rag pipeline
    const { messages, loading: chatLoading, sendMessage } = useChat();

    useEffect(() => {
        const timer = setTimeout(() => setShowStartup(false), 4000);
        return () => clearTimeout(timer);
    }, []);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim() || chatLoading) return;
        const question = inputValue;
        setInputValue("");
        await sendMessage(question);
    };

    const toggleCitation = (id: number) => {
        setActiveDoc(prev => (prev === id ? null : id));
    };

    return (
        <>
            <AnimatePresence>
                {showStartup && <StartupOverlay key="startup" />}
            </AnimatePresence>

            <Background />
            <SlimRail /> {/* Fixed Position Rail */}

            <MainLayout>
                <div className="flex w-full h-full items-center justify-center gap-12 px-12">

                    {/* Left Side: The Document Stack - Flex Item */}
                    <div className="hidden 2xl:flex shrink-0 w-[450px] items-center justify-center">
                        <DocumentStack activeDocId={activeDoc} />
                    </div>

                    {/* Center: Main Chat Interface - Isolated Central Monolith */}
                    <div style={{ width: 'var(--chatW)' }} className="h-[95vh] flex items-center justify-center py-4">
                        <GlassPanel
                            className="h-full w-full flex flex-col z-10 shadow-[0_0_50px_rgba(0,0,0,0.5)] border-white/5 max-w-none"
                        >
                            <ConstitutionalLens />

                            {/* Chat Content Area */}
                            <div ref={chatContainerRef} className="flex-1 p-8 overflow-y-auto space-y-8 no-scrollbar">
                                {/* Welcome message when no messages */}
                                {messages.length === 0 && (
                                    <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                                        <div className="w-16 h-16 rounded-full bg-cyan-900/30 border border-cyan-500/20 flex items-center justify-center">
                                            <div className="w-4 h-4 bg-cyan-400 rounded-full animate-pulse shadow-[0_0_20px_rgba(8,145,178,0.8)]" />
                                        </div>
                                        <div className="space-y-2">
                                            <h2 className="text-lg text-white/90">Konstitutionell AI</h2>
                                            <p className="text-sm text-zinc-500 max-w-md">
                                                Ställ frågor om svensk lagstiftning, propositioner, och myndighetsdokument.
                                                Systemet söker i 535,000+ dokument med agentic RAG.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Real chat messages */}
                                {messages.map((msg) => (
                                    <div key={msg.id} className={clsx("flex gap-4", msg.role === 'assistant' && "flex-row-reverse")}>
                                        {/* Avatar */}
                                        {msg.role === 'user' ? (
                                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0 border border-white/5">
                                                <User size={14} className="text-white/60" />
                                            </div>
                                        ) : (
                                            <div className="w-8 h-8 rounded-full bg-cyan-900/50 border border-cyan-500/30 flex items-center justify-center shrink-0">
                                                {msg.loading ? (
                                                    <Loader2 size={14} className="text-cyan-400 animate-spin" />
                                                ) : (
                                                    <div className="w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_10px_rgba(8,145,178,0.8)]" />
                                                )}
                                            </div>
                                        )}

                                        {/* Message bubble */}
                                        <div className={clsx(
                                            "p-4 rounded-2xl text-lg leading-relaxed shadow-sm",
                                            msg.role === 'user'
                                                ? "rounded-tl-none bg-white/5 border border-white/10 text-white/90"
                                                : "rounded-tr-none bg-cyan-950/30 border border-cyan-500/20 text-cyan-50 shadow-[0_0_30px_-5px_rgba(8,145,178,0.1)] backdrop-blur-md"
                                        )}>
                                            <div className="max-w-[72ch]">
                                                {msg.loading ? (
                                                    <div className="flex items-center gap-2 text-cyan-400/60">
                                                        <span className="text-sm">Söker i dokumentbasen...</span>
                                                    </div>
                                                ) : (
                                                    <>
                                                        {msg.content}

                                                        {/* Sources from RAG */}
                                                        {msg.sources && msg.sources.length > 0 && (
                                                            <div className="mt-4 pt-3 border-t border-cyan-900/50 space-y-2">
                                                                <div className="text-[10px] text-cyan-400/60 uppercase tracking-widest">
                                                                    Källor ({msg.sources.length})
                                                                </div>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {msg.sources.slice(0, 3).map((source, idx) => (
                                                                        <span
                                                                            key={source.id}
                                                                            onClick={() => toggleCitation(idx + 1)}
                                                                            className={clsx(
                                                                                "text-xs px-2 py-1 rounded cursor-pointer transition-colors",
                                                                                activeDoc === idx + 1
                                                                                    ? "bg-cyan-900/40 text-cyan-300"
                                                                                    : "bg-white/5 text-zinc-400 hover:bg-cyan-900/20"
                                                                            )}
                                                                        >
                                                                            [{idx + 1}] {source.title.slice(0, 30)}...
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Verification badge */}
                                                        {msg.role === 'assistant' && !msg.loading && (
                                                            <div className="mt-3 text-[10px] font-mono text-cyan-400/60 uppercase tracking-widest border-t border-cyan-900/50 pt-2 flex items-center gap-2">
                                                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                                                                <span>Verifierad mot ChromaDB</span>
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Input Area */}
                            <div className="p-4 border-t border-white/10 bg-white/5">
                                <form onSubmit={handleSubmit}>
                                    <motion.div
                                        animate={{
                                            boxShadow: isInputFocused
                                                ? "0 0 20px rgba(6, 182, 212, 0.15)"
                                                : "0 0 0px rgba(6, 182, 212, 0)"
                                        }}
                                        className="relative group rounded-xl"
                                    >
                                        <input
                                            type="text"
                                            value={inputValue}
                                            onChange={(e) => setInputValue(e.target.value)}
                                            onFocus={() => setIsInputFocused(true)}
                                            onBlur={() => setIsInputFocused(false)}
                                            placeholder="Fråga om svensk lagstiftning..."
                                            disabled={chatLoading}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 pl-5 pr-12 text-base text-white placeholder-white/20 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all font-light shadow-inner disabled:opacity-50"
                                        />
                                        <button
                                            type="submit"
                                            disabled={chatLoading || !inputValue.trim()}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-white/10 rounded-lg transition-colors text-white/40 hover:text-cyan-400 group-focus-within:text-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            {chatLoading ? (
                                                <Loader2 size={18} className="animate-spin" />
                                            ) : (
                                                <Send size={18} />
                                            )}
                                        </button>
                                    </motion.div>
                                </form>
                            </div>
                        </GlassPanel>
                    </div>

                    {/* Right spacer to account for the fixed SlimRail and its expanding cards */}
                    <div className="w-[400px] shrink-0" />

                </div>
            </MainLayout>
        </>
    );
}
