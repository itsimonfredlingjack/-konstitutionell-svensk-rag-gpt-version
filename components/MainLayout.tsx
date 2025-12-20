"use client";

import React from "react";

export const MainLayout = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="relative w-full h-screen overflow-hidden flex items-center justify-center perspective-container">
            <style jsx global>{`
        .perspective-container {
          perspective: 1200px;
        }
      `}</style>
            {children}
        </div>
    );
};
