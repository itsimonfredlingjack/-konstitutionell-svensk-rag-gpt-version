"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { FileText } from "lucide-react";

const DOCUMENTS = [
    {
        id: 1,
        title: "Företagspolicy_v2.pdf",
        type: "Juridiskt dokument",
        date: "2024-03-12",
        confidence: 96,
        content: "Ansvars- och säkerhetsvillkor för högriskzoner. Innehåller obligatoriska evakueringsprotokoll.",
        label: "Juridisk analys"
    },
    {
        id: 2,
        title: "Säkerhetsprotokoll_WH.pdf",
        type: "Företagspolicy",
        date: "2024-01-15",
        confidence: 92,
        content: "Standardrutiner för lagerlogistik och hantering av farligt material.",
        label: "Policygranskning"
    },
    {
        id: 3,
        title: "Konstitution_v1.0.pdf",
        type: "Teknisk specifikation",
        date: "2024-04-02",
        confidence: 99,
        content: "Systemarkitektur och säkerhetskrav för Constitutional AI-integration.",
        label: "Säkerhetskontroll"
    },
];

export const DocumentStack = ({ activeDocId }: { activeDocId: number | null }) => {
    const [hovered, setHovered] = useState<number | null>(null);

    return (
        <div className="relative w-96 h-[600px] perspective-1000 pointer-events-none">
            {/* Using a layout that allows clicks to pass through except for the cards */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
                {DOCUMENTS.map((doc, index) => {
                    const offset = index * 8; // Wider spacing for bigger cards
                    const isActive = activeDocId === doc.id;

                    return (
                        <motion.div
                            key={doc.id}
                            style={{
                                zIndex: isActive ? 100 : index,
                                transformStyle: "preserve-3d",
                            }}
                            className={cn(
                                "absolute bg-glass-surface border border-glass-border rounded-xl shadow-glass flex flex-col p-8 backdrop-blur-xl cursor-pointer transition-colors overflow-hidden",
                                isActive
                                    ? "bg-black/95 border-cyan-500/50 shadow-[0_0_150px_rgba(0,0,0,0.9)]"
                                    : "w-80 h-[450px] hover:bg-white/5 p-6" // Huge base cards
                            )}
                            initial={{
                                y: offset,
                                x: offset,
                                scale: 1
                            }}
                            animate={{
                                y: isActive ? 0 : offset,
                                x: isActive ? 750 : offset, // Fly right to center screen
                                z: isActive ? 200 : (hovered === index ? 30 : 0),
                                rotateY: isActive ? 0 : 0,
                                scale: isActive ? 1.0 : 1, // No scale needed if base is big enough, or slight scale
                                width: isActive ? 900 : 320, // Super Massive active reading pane
                                height: isActive ? 850 : 450
                            }}
                            transition={{ type: "spring", stiffness: 100, damping: 20 }}
                            onMouseEnter={() => setHovered(index)}
                            onMouseLeave={() => setHovered(null)}
                        >
                            <div className="flex justify-between items-start mb-6">
                                <div className="flex items-center gap-3">
                                    <div className={cn("p-2 rounded-lg", isActive ? "bg-cyan-500/20" : "bg-white/5")}>
                                        <FileText size={isActive ? 24 : 20} className={isActive ? "text-cyan-400" : "text-white/40"} />
                                    </div>
                                    <span className={cn(
                                        "text-xs font-mono tracking-wider",
                                        isActive ? "text-cyan-400" : "text-white/40"
                                    )}>{doc.type}</span>
                                </div>
                                {isActive && <div className="w-3 h-3 bg-cyan-400 rounded-full shadow-[0_0_12px_rgba(34,211,238,0.8)] animate-pulse" />}
                            </div>

                            <div className={cn("font-medium leading-tight transition-colors mb-6", isActive ? "text-cyan-50 text-3xl" : "text-white/80 text-xl")}>
                                {doc.title}
                            </div>

                            {/* Content Revelation */}
                            {isActive ? (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.2 }}
                                    className="flex-1 overflow-y-auto pr-2 custom-scrollbar text-sm text-white/70 font-mono leading-relaxed whitespace-pre-wrap border-t border-white/10 pt-4"
                                >
                                    {doc.content}
                                </motion.div>
                            ) : (
                                /* Decorative Abstract Lines for non-active */
                                <div className="mt-4 space-y-2 opacity-20">
                                    <div className="h-1.5 w-full bg-current rounded-full" />
                                    <div className="h-1.5 w-3/4 bg-current rounded-full" />
                                    <div className="h-1.5 w-5/6 bg-current rounded-full" />
                                </div>
                            )}

                            {/* Confidence Indicator - Only show relevant info based on state */}
                            <div className={cn("absolute bottom-4 left-6 right-6 transition-opacity", isActive ? "opacity-100" : "opacity-50 group-hover:opacity-100")}>
                                <div className="flex items-center gap-2">
                                    <div className="h-1.5 flex-1 bg-white/10 rounded-full overflow-hidden">
                                        <div className="h-full bg-cyan-500" style={{ width: `${doc.confidence}%` }} />
                                    </div>
                                    <span className="text-[10px] font-mono text-cyan-500">{doc.confidence}%</span>
                                </div>
                                {isActive && (
                                    <div className="mt-4 flex items-center justify-between opacity-60">
                                        <span className="text-[9px] uppercase tracking-wide">Analys fullbordad</span>
                                        <span className="text-[8px] font-mono italic">Verifierad via Constitutional AI</span>
                                    </div>
                                )}
                                {!isActive && (
                                    <div className="mt-1 flex justify-between">
                                        <span className="text-white/20 text-[8px] uppercase tracking-widest">Efterlevnadspoäng</span>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            <div className="absolute bottom-[-10px] w-full text-center pointer-events-none">
                <span className="text-xs font-mono text-cyan-400/50 tracking-widest uppercase animate-pulse">
                    Källbank [Interaktiv]
                </span>
            </div>
        </div>
    );
};
