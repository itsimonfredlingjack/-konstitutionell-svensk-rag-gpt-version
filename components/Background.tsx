"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export const Background = () => {
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            setMousePos({
                x: (e.clientX / window.innerWidth - 0.5) * 20, // Reduced movement for smoother feel
                y: (e.clientY / window.innerHeight - 0.5) * 20,
            });
        };

        window.addEventListener("mousemove", handleMouseMove);
        return () => window.removeEventListener("mousemove", handleMouseMove);
    }, []);

    return (
        <div className="fixed inset-0 z-[-1] overflow-hidden bg-[#030305] pointer-events-none">
            {/* Aurora Base Gradient - Deep & Atmospheric */}
            <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/20 via-[#05050A] to-[#05050A]" />

            {/* Aurora Wave 1 - Electric Cyan */}
            <motion.div
                animate={{
                    x: [0, 50 + mousePos.x, 0],
                    y: [0, -30 + mousePos.y, 0],
                    rotate: [0, 10, 0],
                    scale: [1, 1.1, 1],
                    opacity: [0.5, 0.8, 0.5], // Increased form 0.3
                }}
                transition={{
                    duration: 20,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
                className="absolute top-[-30%] left-[-10%] w-[80vw] h-[80vw] rounded-[100%] bg-[#00f2ff]/30 blur-[100px] mix-blend-screen" // Increased opacity
            />

            {/* Aurora Wave 2 - Majestic Purple */}
            <motion.div
                animate={{
                    x: [0, -40 + mousePos.x, 0],
                    y: [0, 40 + mousePos.y, 0],
                    rotate: [0, -15, 0],
                    scale: [1, 1.2, 1],
                    opacity: [0.4, 0.6, 0.4], // Increased
                }}
                transition={{
                    duration: 25,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
                className="absolute bottom-[-20%] right-[-20%] w-[90vw] h-[90vw] rounded-[100%] bg-[#7b00ff]/30 blur-[120px] mix-blend-screen" // Increased opacity
            />

            {/* Aurora Wave 3 - Deep Blue Core */}
            <motion.div
                animate={{
                    x: [0, 30 + mousePos.x, 0],
                    rotate: [0, 5, 0],
                    scale: [1, 1.1, 1],
                    opacity: [0.3, 0.5, 0.3], // Added opacity animation
                }}
                transition={{
                    duration: 18,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
                className="absolute top-[20%] left-[20%] w-[60vw] h-[60vw] rounded-[100%] bg-blue-600/20 blur-[80px] mix-blend-screen" // Increased opacity
            />

            {/* Aurora Wave 4 - Floating Highlight */}
            <motion.div
                animate={{
                    x: [-20 + mousePos.x, 20 + mousePos.x, -20 + mousePos.x],
                    y: [-10 + mousePos.y, 10 + mousePos.y, -10 + mousePos.y],
                    opacity: [0.3, 0.6, 0.3], // Increased opacity
                }}
                transition={{
                    duration: 15,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
                className="absolute top-[40%] left-[40%] w-[40vw] h-[40vw] rounded-full bg-indigo-500/20 blur-[90px] mix-blend-screen" // Increased opacity
            />

            {/* Noise Texture Overlay - Gives it that "Digital" feel */}
            <div
                className="absolute inset-0 opacity-[0.03] pointer-events-none"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'repeat',
                }}
            />
        </div>
    );
};
