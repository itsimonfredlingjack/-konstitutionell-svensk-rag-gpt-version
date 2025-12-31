"use client";

import { motion, AnimatePresence } from "framer-motion";
import { FileText, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface Source {
  id: string;
  title: string;
  snippet?: string;
  score: number;
  doc_type?: string;
  source?: string;
}

interface EvidenceLensProps {
  sources: Source[];
  mode?: 'CHAT' | 'ASSIST' | 'EVIDENCE';
  onSourceClick?: (source: Source) => void;
  maxSources?: number;
}

const getConfidenceLevel = (score: number): { color: string; ring: string; bg: string; label: string } => {
  if (score > 0.7) {
    return {
      color: 'text-emerald-400',
      ring: 'stroke-emerald-400',
      bg: 'bg-emerald-500/10',
      label: 'HÖG'
    };
  } else if (score >= 0.4) {
    return {
      color: 'text-cyan-400',
      ring: 'stroke-cyan-400',
      bg: 'bg-cyan-500/10',
      label: 'MEDEL'
    };
  } else {
    return {
      color: 'text-amber-400',
      ring: 'stroke-amber-400',
      bg: 'bg-amber-500/10',
      label: 'LÅG'
    };
  }
};

const getDocTypeBadge = (docType?: string): { label: string; color: string } => {
  const type = docType?.toLowerCase() || 'dokument';

  if (type.includes('sfs')) {
    return { label: 'SFS', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' };
  } else if (type.includes('prop')) {
    return { label: 'Prop', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' };
  } else if (type.includes('sou')) {
    return { label: 'SOU', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' };
  } else if (type.includes('bet')) {
    return { label: 'Bet', color: 'bg-pink-500/20 text-pink-300 border-pink-500/30' };
  } else if (type.includes('mot')) {
    return { label: 'Mot', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' };
  } else {
    return { label: 'Dok', color: 'bg-gray-500/20 text-gray-300 border-gray-500/30' };
  }
};

const ConfidenceRing = ({ score }: { score: number }) => {
  const confidence = getConfidenceLevel(score);
  const percentage = Math.round(score * 100);
  const circumference = 2 * Math.PI * 36; // radius 36
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      {/* Background Circle */}
      <svg className="absolute inset-0 -rotate-90" width="100%" height="100%" viewBox="0 0 80 80">
        <circle
          cx="40"
          cy="40"
          r="36"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          className="text-white/10"
        />
        {/* Animated Confidence Ring */}
        <motion.circle
          cx="40"
          cy="40"
          r="36"
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          className={cn("drop-shadow-[0_0_8px_currentColor]", confidence.ring)}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }}
          strokeDasharray={circumference}
        />
      </svg>

      {/* Center Text */}
      <div className="relative z-10 flex flex-col items-center">
        <motion.span
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className={cn("text-2xl font-bold tabular-nums", confidence.color)}
        >
          {percentage}%
        </motion.span>
        <span className={cn("text-[9px] font-mono uppercase tracking-widest mt-0.5", confidence.color)}>
          {confidence.label}
        </span>
      </div>

      {/* Glow Effect */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 0.3, scale: 1 }}
        transition={{ duration: 1, delay: 0.3 }}
        className={cn("absolute inset-0 rounded-full blur-xl", confidence.bg)}
      />
    </div>
  );
};

const SourceCard = ({
  source,
  index,
  mode,
  onClick
}: {
  source: Source;
  index: number;
  mode?: string;
  onClick?: (source: Source) => void;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const confidence = getConfidenceLevel(source.score);
  const docBadge = getDocTypeBadge(source.doc_type);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      whileHover={{ scale: 1.02 }}
      onClick={() => onClick?.(source)}
      className={cn(
        "group relative overflow-hidden rounded-xl border backdrop-blur-md transition-all cursor-pointer",
        "bg-black/20 border-white/10 hover:border-white/20",
        mode === 'EVIDENCE' && "hover:shadow-[0_0_25px_-5px_rgba(6,182,212,0.3)]"
      )}
    >
      {/* Frosted Noise Texture */}
      <div
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
        }}
      />

      <div className="relative z-10 p-5">
        {/* Top Section: Confidence Ring + Title */}
        <div className="flex items-start gap-4 mb-4">
          <ConfidenceRing score={source.score} />

          <div className="flex-1 min-w-0">
            {/* Document Type Badge */}
            <div className="flex items-center gap-2 mb-2">
              <span className={cn(
                "text-[10px] font-mono px-2 py-0.5 rounded border uppercase tracking-wider",
                docBadge.color
              )}>
                {docBadge.label}
              </span>
              {mode === 'EVIDENCE' && (
                <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest">
                  ID: {source.id.slice(0, 8)}
                </span>
              )}
            </div>

            {/* Title */}
            <h3 className="text-sm font-semibold text-cyan-50 leading-snug line-clamp-2 group-hover:text-cyan-200 transition-colors">
              {source.title}
            </h3>

            {/* Source Path (Evidence Mode) */}
            {mode === 'EVIDENCE' && source.source && (
              <p className="text-[10px] font-mono text-white/30 mt-1 truncate">
                {source.source}
              </p>
            )}
          </div>
        </div>

        {/* Snippet Preview */}
        {source.snippet && (
          <div className="relative">
            <AnimatePresence>
              {isExpanded ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className={cn(
                    "text-xs text-zinc-300 leading-relaxed p-3 rounded-lg border",
                    "bg-white/5 border-white/10"
                  )}>
                    {source.snippet}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-zinc-400 leading-relaxed line-clamp-2"
                >
                  {source.snippet}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Expand/Collapse Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className={cn(
                "mt-2 flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest",
                "transition-colors hover:text-cyan-300",
                confidence.color
              )}
            >
              {isExpanded ? (
                <>
                  <ChevronUp size={12} />
                  Dölj
                </>
              ) : (
                <>
                  <ChevronDown size={12} />
                  Visa mer
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Hover Glow */}
      <div className={cn(
        "absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-500",
        "bg-gradient-to-br from-white/5 via-transparent to-transparent"
      )} />
    </motion.div>
  );
};

export const EvidenceLens = ({
  sources,
  mode = 'ASSIST',
  onSourceClick,
  maxSources = 6
}: EvidenceLensProps) => {
  const displaySources = sources.slice(0, maxSources);

  if (displaySources.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
            <FileText size={16} className="text-cyan-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-cyan-50 tracking-wide">
              EVIDENSBAS
            </h2>
            <p className="text-[10px] font-mono text-white/40 uppercase tracking-widest">
              {displaySources.length} käll{displaySources.length === 1 ? 'a' : 'or'}
            </p>
          </div>
        </div>

        {mode === 'EVIDENCE' && (
          <div className="ml-auto">
            <span className="text-[9px] px-2 py-1 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-mono uppercase tracking-wider">
              Fullständigt läge
            </span>
          </div>
        )}
      </div>

      {/* Source Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {displaySources.map((source, index) => (
          <SourceCard
            key={source.id}
            source={source}
            index={index}
            mode={mode}
            onClick={onSourceClick}
          />
        ))}
      </div>

      {/* Footer Note (Evidence Mode) */}
      {mode === 'EVIDENCE' && sources.length > maxSources && (
        <div className="mt-4 text-center">
          <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">
            + {sources.length - maxSources} fler källor tillgängliga
          </span>
        </div>
      )}
    </div>
  );
};
