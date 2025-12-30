"use client";

import { motion, HTMLMotionProps } from "framer-motion";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface GlassPanelProps extends HTMLMotionProps<"div"> {
    children: ReactNode;
}

export const GlassPanel = ({ children, className, style, ...props }: GlassPanelProps) => {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className={cn(
                "relative rounded-3xl overflow-hidden",
                "backdrop-blur-xl bg-surface-primary border border-border-default",
                "shadow-glass",
                "transform-style-3d transition-all duration-500",
                className
            )}
            style={{
                transformStyle: "preserve-3d",
                ...style
            }}
            {...props}
        >
            {/* Glare effect container - could make this reactive to mouse later */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none" />

            {children}
        </motion.div>
    );
};
