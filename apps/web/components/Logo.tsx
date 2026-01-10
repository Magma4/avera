
import React from 'react';

export const Logo = ({ className = "h-10" }: { className?: string }) => {
    return (
        <svg viewBox="0 0 300 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Symbol */}
            <g transform="translate(10, 10) scale(0.8)">
                <defs>
                    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" style={{ stopColor: '#3b82f6', stopOpacity: 1 }} />
                        <stop offset="100%" style={{ stopColor: '#0ea5e9', stopOpacity: 1 }} />
                    </linearGradient>
                    <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" style={{ stopColor: '#84cc16', stopOpacity: 1 }} />
                        <stop offset="100%" style={{ stopColor: '#22c55e', stopOpacity: 1 }} />
                    </linearGradient>
                    <linearGradient id="grad3" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style={{ stopColor: '#1e3a8a', stopOpacity: 1 }} />
                        <stop offset="100%" style={{ stopColor: '#172554', stopOpacity: 1 }} />
                    </linearGradient>
                </defs>

                {/* Top Blue Part */}
                <path d="M50 0 C22.4 0 0 22.4 0 50 C0 55 1 60 3 65 C10 60 25 55 50 55 C75 55 90 40 100 35 C95 15 75 0 50 0 Z" fill="url(#grad1)" />

                {/* Middle Green Part */}
                <path d="M3 65 C5 75 15 90 25 95 C30 90 45 80 60 80 C85 80 95 60 100 50 C100 45 95 50 90 52 C70 60 40 65 3 65 Z" fill="url(#grad2)" />

                {/* Bottom Dark Part */}
                <path d="M25 95 C35 105 45 110 50 110 C55 110 65 105 75 95 C65 90 55 85 50 85 C45 85 35 90 25 95 Z" fill="#31416d" />

                {/* White Circle Cutout */}
                <circle cx="50" cy="35" r="14" fill="white" />
            </g>

            {/* Text 'Avera' */}
            <text x="110" y="68" fontFamily="sans-serif" fontWeight="bold" fontSize="55" fill="#1e3a8a" className="dark:fill-white">
                Avera
            </text>
        </svg>
    );
};
