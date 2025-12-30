"use client";

import { motion } from "framer-motion";
import { Send, Mic, Sparkles, Loader2, Paperclip } from "lucide-react";
import { useState, useRef } from "react";
import clsx from "clsx";

interface FloatingCapsuleProps {
    onSend: (message: string) => void;
    isLoading: boolean;
}

export const FloatingCapsule = ({ onSend, isLoading }: FloatingCapsuleProps) => {
    const [inputValue, setInputValue] = useState("");
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim() || isLoading) return;
        onSend(inputValue);
        setInputValue("");
    };

    return (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-[700px] px-4 flex flex-col items-center gap-3">
            <motion.form
                onSubmit={handleSubmit}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className={clsx(
                    "w-full relative flex items-center gap-2 p-2 rounded-full backdrop-blur-2xl transition-all duration-300",
                    isFocused
                        ? "bg-[#0A0A0B]/80 shadow-[0_0_40px_-10px_rgba(6,182,212,0.3)] border border-cyan-500/30"
                        : "bg-[#0A0A0B]/60 shadow-[0_0_20px_-5px_rgba(0,0,0,0.5)] border border-white/10"
                )}
            >
                {/* Gemini Nebula Glow Gradient (Visible on Focus) */}
                <div
                    className={clsx(
                        "absolute inset-0 rounded-full z-[-1] transition-opacity duration-500",
                        isFocused ? "opacity-100" : "opacity-0"
                    )}
                    style={{
                        background: "linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.1) 20%, rgba(124,58,237,0.1) 50%, rgba(6,182,212,0.1) 80%, transparent 100%)",
                    }}
                />

                {/* Left Action (Mode/Sparkles + Upload) */}
                <div className="pl-2 flex items-center gap-1">
                    <button
                        type="button"
                        className="p-2 rounded-full hover:bg-white/10 text-cyan-400 transition-colors"
                        title="Enhance Prompt"
                    >
                        <Sparkles size={18} />
                    </button>
                    <button
                        type="button"
                        className="p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-cyan-400 transition-colors"
                        title="Ladda upp dokument"
                    >
                        <Paperclip size={18} />
                    </button>
                </div>

                {/* Input Field */}
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    placeholder="Fråga Constitutional GPT..."
                    className="flex-1 bg-transparent border-none outline-none text-white text-base placeholder-zinc-500 font-light px-2"
                    disabled={isLoading}
                />

                {/* Right Actions */}
                <div className="flex items-center gap-1 pr-1">
                    {/* Voice Input (Visual only for now) */}
                    <button
                        type="button"
                        className="p-2 rounded-full text-zinc-500 hover:text-zinc-200 hover:bg-white/10 transition-colors"
                    >
                        <Mic size={18} />
                    </button>

                    {/* Send Button */}
                    <button
                        type="submit"
                        disabled={!inputValue.trim() || isLoading}
                        className={clsx(
                            "p-2 rounded-full transition-all duration-300 flex items-center justify-center",
                            inputValue.trim() && !isLoading
                                ? "bg-cyan-500 text-black hover:bg-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.5)]"
                                : "bg-white/5 text-zinc-600 cursor-not-allowed"
                        )}
                    >
                        {isLoading ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <Send size={18} className={clsx(inputValue.trim() && "ml-0.5")} />
                        )}
                    </button>
                </div>
            </motion.form>

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.6 }}
                transition={{ delay: 1 }}
                className="text-[10px] text-zinc-500 font-light tracking-wide text-center"
            >
                Constitutional GPT kan begå misstag, det är alltid viktigt med egen faktagranskning
            </motion.div>
        </div>
    );
};
