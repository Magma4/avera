"use client";

import useSWR from "swr";
import { Shield, AlertTriangle, Zap, Thermometer, Loader2 } from "lucide-react";

interface SidebarProps {
    lat: number | null;
    lng: number | null;
}

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function Sidebar({ lat, lng }: SidebarProps) {
    const { data, error, isLoading } = useSWR(
        lat && lng
            ? `${process.env.NEXT_PUBLIC_API_URL}/safety/snapshot/?lat=${lat}&lng=${lng}&time=day`
            : null,
        fetcher
    );

    if (!lat || !lng) {
        return (
            <div className="p-6 text-gray-500 text-sm">
                Select a location on the map to view the Safety Snapshot.
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="p-6 flex items-center justify-center text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Analyzing safety layers...
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 text-red-500 text-sm">
                Failed to load safety data.
            </div>
        );
    }

    const { score, confidence, reasons, evidence } = data;

    // Color coding based on score (Calm tones)
    const getScoreColor = (s: number) => {
        if (s >= 80) return "text-emerald-700 bg-emerald-50 border-emerald-200";
        if (s >= 50) return "text-amber-700 bg-amber-50 border-amber-200";
        return "text-rose-700 bg-rose-50 border-rose-200";
    };

    const scoreColorClass = getScoreColor(score);

    return (
        <div className="h-full overflow-y-auto bg-white border-l border-gray-200 shadow-xl flex flex-col w-[400px]">
            {/* Header */}
            <div className={`p-6 border-b border-gray-100 ${score > 80 ? 'bg-emerald-50/30' : ''}`}>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                    Safety Snapshot
                </h2>
                <div className="flex items-baseline space-x-3">
                    <span className={`text-5xl font-bold tracking-tight ${scoreColorClass.split(' ')[0]}`}>
                        {score}
                    </span>
                    <span className="text-sm font-medium text-gray-500">
                        / 100
                    </span>
                </div>
                <div className="mt-3 flex items-center space-x-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium border ${scoreColorClass}`}>
                        {score >= 80 ? "High Safety" : score >= 50 ? "Moderate Safety" : "Low Safety"}
                    </span>
                    <span className="text-xs text-gray-400">
                        Confidence: <strong className="text-gray-600 capitalize">{confidence}</strong>
                    </span>
                </div>
            </div>

            {/* Reasons */}
            <div className="p-6 border-b border-gray-100">
                <h3 className="text-sm font-medium text-gray-900 mb-4 flex items-center">
                    <Shield className="w-4 h-4 mr-2 text-gray-400" />
                    Key Factors
                </h3>
                <div className="space-y-4">
                    {reasons.map((reason: any, idx: number) => (
                        <div key={idx} className="flex items-start space-x-3">
                            <div className="mt-0.5">
                                {reason.impact === "Positive" ? (
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                ) : reason.impact === "Negative" ? (
                                    <div className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                                ) : (
                                    <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                                )}
                            </div>
                            <div>
                                <p className="text-sm font-medium text-gray-800">
                                    {reason.factor}
                                </p>
                                <p className="text-xs text-gray-500 leading-relaxed mt-0.5">
                                    {reason.detail}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Evidence Sources */}
            <div className="p-6 bg-gray-50/50 flex-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">
                    Evidence Sources
                </h3>
                <div className="space-y-3">
                    {/* Official Alerts */}
                    <div className="bg-white p-3 rounded border border-gray-200">
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center text-sm font-medium text-gray-700">
                                <AlertTriangle className="w-3.5 h-3.5 mr-2 text-amber-500" />
                                Official Alerts
                            </div>
                            <span className="text-[10px] text-gray-400 uppercase">{evidence.alerts.coverage}</span>
                        </div>
                        <div className="text-[10px] text-gray-400">
                            Updated: {new Date(evidence.alerts.last_updated).toLocaleDateString()}
                        </div>
                    </div>

                    {/* Official Crime Data */}
                    <div className="bg-white p-3 rounded border border-gray-200">
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center text-sm font-medium text-gray-700">
                                <Shield className="w-3.5 h-3.5 mr-2 text-indigo-500" />
                                Crime Reports
                            </div>
                            <span className="text-[10px] text-gray-400 uppercase">{evidence.crime.coverage}</span>
                        </div>
                        <div className="text-[10px] text-gray-400">
                            Updated: {new Date(evidence.crime.last_updated).toLocaleDateString()}
                        </div>
                    </div>

                    {/* Environmental */}
                    <div className="bg-white p-3 rounded border border-gray-200">
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center text-sm font-medium text-gray-700">
                                <Zap className="w-3.5 h-3.5 mr-2 text-teal-500" />
                                Environmental
                            </div>
                            <span className="text-[10px] text-gray-400 uppercase">{evidence.environment.coverage}</span>
                        </div>
                        <div className="text-[10px] text-gray-400">
                            Updated: {new Date(evidence.environment.last_updated).toLocaleDateString()}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
