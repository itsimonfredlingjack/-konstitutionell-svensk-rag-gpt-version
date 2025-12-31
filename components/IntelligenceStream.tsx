"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Database, Brain, Shield, Check, Activity } from "lucide-react";
import { useMemo } from "react";

interface IntelligenceStreamProps {
  steps: Array<{
    id: string;
    name: string;
    role: string;
    status: "idle" | "active" | "complete" | "error";
    latency?: number;
  }>;
  logs?: string[];
  isActive?: boolean;
  className?: string;
}

const stepIcons = {
  search: Database,
  analysis: Brain,
  verification: Shield,
};

const statusConfig = {
  idle: {
    color: "bg-gray-500/30",
    border: "border-gray-500/40",
    glow: "",
    text: "text-gray-400",
  },
  active: {
    color: "bg-cyan-500",
    border: "border-cyan-400",
    glow: "shadow-[0_0_20px_rgba(34,211,238,0.5)]",
    text: "text-cyan-300",
  },
  complete: {
    color: "bg-emerald-500",
    border: "border-emerald-400",
    glow: "shadow-[0_0_15px_rgba(16,185,129,0.3)]",
    text: "text-emerald-300",
  },
  error: {
    color: "bg-red-500",
    border: "border-red-400",
    glow: "shadow-[0_0_15px_rgba(239,68,68,0.3)]",
    text: "text-red-300",
  },
};

export default function IntelligenceStream({
  steps,
  logs = [],
  isActive = false,
  className = "",
}: IntelligenceStreamProps) {
  const getIcon = (stepId: string) => {
    if (stepId.includes("search") || stepId.includes("sökning")) {
      return stepIcons.search;
    }
    if (stepId.includes("analys") || stepId.includes("analysis")) {
      return stepIcons.analysis;
    }
    return stepIcons.verification;
  };

  const visibleLogs = useMemo(() => logs.slice(-5), [logs]);

  return (
    <div
      className={`relative rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-xl ${className}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <Activity className="h-4 w-4 text-cyan-400" />
        <span className="text-sm font-semibold tracking-wide text-white">
          ⚡ PROCESSTRÖM
        </span>
        {isActive && (
          <motion.div
            className="ml-auto h-2 w-2 rounded-full bg-cyan-400"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [1, 0.7, 1],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}
      </div>

      {/* Pipeline Steps */}
      <div className="relative px-6 py-8">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const Icon = getIcon(step.id);
            const config = statusConfig[step.status];
            const isLastStep = index === steps.length - 1;
            const prevStep = index > 0 ? steps[index - 1] : null;
            const showFlow =
              prevStep &&
              (prevStep.status === "complete" || prevStep.status === "active");

            return (
              <div key={step.id} className="relative flex flex-1 items-center">
                {/* Step Card */}
                <div className="flex flex-1 flex-col items-center">
                  {/* Icon Container */}
                  <motion.div
                    className={`relative flex h-16 w-16 items-center justify-center rounded-2xl border-2 ${config.border} ${config.color} ${config.glow} transition-all duration-300`}
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    {step.status === "complete" ? (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{
                          type: "spring",
                          stiffness: 500,
                          damping: 25,
                        }}
                      >
                        <Check className="h-8 w-8 text-emerald-300" />
                      </motion.div>
                    ) : (
                      <Icon
                        className={`h-8 w-8 ${config.text} ${
                          step.status === "active" ? "animate-pulse" : ""
                        }`}
                      />
                    )}

                    {/* Pulsing Ring for Active */}
                    {step.status === "active" && (
                      <motion.div
                        className="absolute inset-0 rounded-2xl border-2 border-cyan-400"
                        animate={{
                          scale: [1, 1.2, 1],
                          opacity: [0.8, 0, 0.8],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: "easeOut",
                        }}
                      />
                    )}
                  </motion.div>

                  {/* Step Name */}
                  <div className="mt-3 text-center">
                    <div className="text-sm font-medium text-white">
                      {step.name}
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      {step.role}
                    </div>

                    {/* Latency Badge */}
                    {step.status === "complete" && step.latency && (
                      <motion.div
                        className="mt-2 inline-block rounded-full bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-300"
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        ✓ {step.latency}ms
                      </motion.div>
                    )}

                    {/* Active Indicator */}
                    {step.status === "active" && (
                      <motion.div
                        className="mt-2 text-xs font-medium text-cyan-300"
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{
                          duration: 1.5,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                      >
                        aktiv
                      </motion.div>
                    )}

                    {/* Waiting Indicator */}
                    {step.status === "idle" &&
                      index > 0 &&
                      steps[index - 1].status !== "idle" && (
                        <div className="mt-2 text-xs text-gray-500">
                          väntar
                        </div>
                      )}
                  </div>
                </div>

                {/* Connecting Line */}
                {!isLastStep && (
                  <div className="relative mx-4 flex h-0.5 flex-1 items-center">
                    {/* Base Line */}
                    <div className="h-full w-full rounded-full bg-white/10" />

                    {/* Animated Flow Line */}
                    {showFlow && (
                      <>
                        {/* Static colored line when complete */}
                        {prevStep.status === "complete" && (
                          <motion.div
                            className="absolute inset-0 h-full rounded-full bg-gradient-to-r from-emerald-500/50 to-cyan-500/50"
                            initial={{ scaleX: 0, transformOrigin: "left" }}
                            animate={{ scaleX: 1 }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                          />
                        )}

                        {/* Flowing particles when active */}
                        {(prevStep.status === "active" ||
                          step.status === "active") && (
                          <>
                            <motion.div
                              className="absolute left-0 h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                              animate={{
                                x: ["0%", "100%"],
                              }}
                              transition={{
                                duration: 1.5,
                                repeat: Infinity,
                                ease: "linear",
                              }}
                            />
                            <motion.div
                              className="absolute left-0 h-1 w-1 rounded-full bg-cyan-300"
                              animate={{
                                x: ["0%", "100%"],
                              }}
                              transition={{
                                duration: 1.5,
                                delay: 0.5,
                                repeat: Infinity,
                                ease: "linear",
                              }}
                            />
                            {/* Glow trail */}
                            <motion.div
                              className="absolute inset-0 h-full rounded-full bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"
                              animate={{
                                x: ["-100%", "100%"],
                              }}
                              transition={{
                                duration: 1.5,
                                repeat: Infinity,
                                ease: "linear",
                              }}
                            />
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Live Log Feed */}
      {logs.length > 0 && (
        <div className="border-t border-white/10 px-4 py-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Resonemang
          </div>
          <div className="space-y-1.5 rounded-lg bg-black/20 p-3 font-mono text-xs">
            <AnimatePresence mode="popLayout">
              {visibleLogs.map((log, index) => (
                <motion.div
                  key={`${log}-${index}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-start gap-2 text-gray-300"
                >
                  <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-cyan-400" />
                  <span className="flex-1 leading-relaxed">{log}</span>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Empty State */}
            {visibleLogs.length === 0 && (
              <div className="text-center text-gray-500">
                Väntar på aktivitet...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Subtle Background Grid */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-5"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: "20px 20px",
        }}
      />
    </div>
  );
}
