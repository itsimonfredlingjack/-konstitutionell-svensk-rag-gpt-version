"use client";

import { motion } from "framer-motion";
import { Copy, Scale, FileText, ChevronRight } from "lucide-react";
import clsx from "clsx";

interface GlassTileProps {
    title: string;
    type: "law" | "prop" | "doc";
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
}

export const GlassTile = ({ title, type, children, className, onClick }: GlassTileProps) => {
    const Icon = type === 'law' ? Scale : type === 'prop' ? FileText : FileText;
    const accentColor = type === 'law' ? "text-blue-400" : type === 'prop' ? "text-purple-400" : "text-emerald-400";
    const borderColor = type === 'law' ? "border-blue-500/20" : type === 'prop' ? "border-purple-500/20" : "border-emerald-500/20";

    return (
        <motion.div
            whileHover={{ scale: 1.01, backgroundColor: "rgba(255,255,255,0.05)" }}
            onClick={onClick}
            className={clsx(
                "group relative overflow-hidden rounded-xl border bg-black/20 backdrop-blur-md transition-colors cursor-pointer",
                borderColor,
                className
            )}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-white/5">
                <div className="flex items-center gap-2 overflow-hidden">
                    <Icon size={14} className={accentColor} />
                    <span className="text-xs font-medium text-zinc-300 truncate">{title}</span>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRight size={14} className="text-zinc-500" />
                </div>
            </div>

            {/* Content Body */}
            <div className="p-3 text-sm text-zinc-300 leading-relaxed font-light">
                {children}
            </div>

            {/* Hover Glow Effect */}
            <div className="absolute inset-0 rounded-xl bg-gradient-to-tr from-white/5 to-transparent opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-500" />
        </motion.div>
    );
};
