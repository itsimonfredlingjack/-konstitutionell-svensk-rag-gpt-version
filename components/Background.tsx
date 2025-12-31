"use client";

import { memo } from "react";

/**
 * Ultra-lightweight background using pure CSS gradients.
 * Same aesthetic, zero GPU tears.
 *
 * Before: 4 blur divs × 60fps mouse tracking = 360 billion samples/sec
 * After: Static CSS gradients = basically free
 */
const BackgroundComponent = () => {
    return (
        <div className="fixed inset-0 z-[-1] overflow-hidden bg-[#0A0A15] pointer-events-none">
            {/* Main aurora gradient - pure CSS, no blur needed */}
            <div
                className="absolute inset-0"
                style={{
                    background: `
                        radial-gradient(ellipse 100% 80% at 10% 10%, rgba(0, 242, 255, 0.35) 0%, transparent 50%),
                        radial-gradient(ellipse 90% 100% at 90% 90%, rgba(123, 0, 255, 0.4) 0%, transparent 50%),
                        radial-gradient(ellipse 60% 60% at 50% 40%, rgba(59, 130, 246, 0.2) 0%, transparent 50%),
                        linear-gradient(to bottom, rgba(30, 27, 75, 0.3) 0%, #0A0A15 60%),
                        linear-gradient(180deg, rgba(10, 10, 21, 0) 0%, rgba(6, 182, 212, 0.05) 50%, rgba(10, 10, 21, 0) 100%)
                    `,
                }}
            />

            {/* Animated glow layer - CSS animation */}
            <div
                className="absolute inset-0 animate-aurora-pulse"
                style={{
                    background: `
                        radial-gradient(ellipse 80% 50% at 25% 25%, rgba(6, 182, 212, 0.25) 0%, transparent 50%),
                        radial-gradient(ellipse 70% 60% at 75% 75%, rgba(139, 92, 246, 0.25) 0%, transparent 50%)
                    `,
                }}
            />

            {/* Noise Texture Overlay - Gives it that "Digital" feel */}
            <div
                className="absolute inset-0 opacity-[0.05] pointer-events-none"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'repeat',
                }}
            />
        </div>
    );
};

// Memoize to prevent re-renders from parent state changes
export const Background = memo(BackgroundComponent);
