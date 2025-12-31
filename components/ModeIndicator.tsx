"use client";

import { MessageCircle, Brain, Scale } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ModeIndicatorProps {
  mode: "CHAT" | "ASSIST" | "EVIDENCE";
  evidenceLevel?: "HIGH" | "LOW" | "NONE";
  className?: string;
}

const modeConfig = {
  CHAT: {
    icon: MessageCircle,
    label: "Konversation",
    color: "zinc",
    glowColor: "rgba(161, 161, 170, 0.5)", // zinc-400 with opacity
    description: "Ingen källsökning",
  },
  ASSIST: {
    icon: Brain,
    label: "RAG Assistent",
    color: "cyan",
    glowColor: "rgba(34, 211, 238, 0.6)", // cyan-400 with opacity
    description: "RAG med källor",
  },
  EVIDENCE: {
    icon: Scale,
    label: "Verifierat Svar",
    color: "emerald",
    glowColor: "rgba(52, 211, 153, 0.6)", // emerald-400 with opacity
    description: "Hög bevisstyrka",
  },
};

export function ModeIndicator({
  mode,
  evidenceLevel,
  className,
}: ModeIndicatorProps) {
  const config = modeConfig[mode];
  const Icon = config.icon;

  // Determine if we should show the pulsing animation
  const shouldPulse = mode === "ASSIST" || mode === "EVIDENCE";

  // Adjust glow intensity based on evidence level
  const glowIntensity =
    mode === "EVIDENCE"
      ? evidenceLevel === "HIGH"
        ? 1
        : evidenceLevel === "LOW"
          ? 0.5
          : 0.3
      : 1;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "relative inline-flex items-center gap-2 px-3 py-1.5 rounded-full",
        "backdrop-blur-xl bg-black/20 border border-white/5",
        "shadow-lg",
        className
      )}
    >
      {/* Animated glow background */}
      {shouldPulse && (
        <motion.div
          className="absolute inset-0 rounded-full blur-xl"
          style={{
            background: config.glowColor,
            opacity: glowIntensity,
          }}
          animate={{
            opacity: [glowIntensity * 0.4, glowIntensity * 0.7, glowIntensity * 0.4],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      )}

      {/* Content container */}
      <div className="relative z-10 flex items-center gap-2">
        {/* Icon with subtle pulse */}
        <motion.div
          animate={
            shouldPulse
              ? {
                  scale: [1, 1.1, 1],
                }
              : {}
          }
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <Icon
            className={cn(
              "w-4 h-4",
              mode === "CHAT" && "text-zinc-400",
              mode === "ASSIST" && "text-cyan-400",
              mode === "EVIDENCE" && "text-emerald-400"
            )}
            strokeWidth={2.5}
          />
        </motion.div>

        {/* Label text */}
        <div className="flex flex-col">
          <span
            className={cn(
              "text-xs font-semibold tracking-wide",
              mode === "CHAT" && "text-zinc-300",
              mode === "ASSIST" && "text-cyan-300",
              mode === "EVIDENCE" && "text-emerald-300"
            )}
          >
            {config.label}
          </span>
        </div>

        {/* Evidence level indicator (only for EVIDENCE mode) */}
        {mode === "EVIDENCE" && evidenceLevel && evidenceLevel !== "NONE" && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className={cn(
              "ml-1 w-2 h-2 rounded-full",
              evidenceLevel === "HIGH" && "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]",
              evidenceLevel === "LOW" && "bg-emerald-400/50 shadow-[0_0_4px_rgba(52,211,153,0.4)]"
            )}
          />
        )}
      </div>

      {/* Sharp border accent */}
      <div
        className={cn(
          "absolute inset-0 rounded-full border pointer-events-none",
          mode === "CHAT" && "border-zinc-400/20",
          mode === "ASSIST" && "border-cyan-400/30",
          mode === "EVIDENCE" && "border-emerald-400/30"
        )}
      />
    </motion.div>
  );
}
