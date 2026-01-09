"use client";

import useSWR from "swr";
import { Shield, AlertTriangle, Zap, TrendingUp, LayoutDashboard, Loader2, MapPin } from "lucide-react";
import { useState } from "react";

interface SidebarProps {
    lat: number | null;
    lng: number | null;
}

type TabId = 'overview' | 'incidents' | 'alerts' | 'environment' | 'trends';

const fetcher = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`API Error: ${res.status}`);
    }
    return res.json();
};

export default function Sidebar({ lat, lng }: SidebarProps) {
    const [activeTab, setActiveTab] = useState<TabId>('overview');

    // Address State
    const [address, setAddress] = useState<string | null>(null);

    // Validate coords
    const validCoords = lat && lng && !isNaN(lat) && !isNaN(lng);

    // Reverse Geocoding Effect
    useSWR(
        validCoords ? `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}&types=address,poi` : null,
        fetcher,
        {
            onSuccess: (data) => {
                if (data?.features?.[0]) {
                    setAddress(data.features[0].place_name);
                } else {
                    setAddress("Selected Location");
                }
            },
            onError: () => setAddress("Location Unavailable")
        }
    );

    if (!lat || !lng) {
        return (
            <div className="h-full bg-white border-l border-gray-200 shadow-xl flex items-center justify-center p-6 text-gray-500 text-sm w-[400px]">
                Select a location on the map to view data.
            </div>
        );
    }

    return (
        <div className="h-full overflow-hidden bg-white border-l border-gray-200 shadow-xl flex flex-col w-[400px]">
            {/* Header / Address Bar */}
            <div className="bg-gray-900 px-4 py-3 flex items-start space-x-3 shadow-sm z-10">
                <MapPin className="w-4 h-4 text-indigo-400 mt-0.5" />
                <div>
                    <h1 className="text-xs font-bold text-white leading-tight">{address || "Loading address..."}</h1>
                    <span className="text-[10px] text-gray-400 font-mono mt-0.5 block">{lat.toFixed(4)}, {lng.toFixed(4)}</span>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center border-b border-gray-100 px-2 pt-2 bg-gray-50/50">
                <TabButton id="overview" label="Snapshot" icon={LayoutDashboard} active={activeTab} onClick={setActiveTab} />
                <TabButton id="incidents" label="Incidents" icon={Shield} active={activeTab} onClick={setActiveTab} />
                <TabButton id="alerts" label="Alerts" icon={AlertTriangle} active={activeTab} onClick={setActiveTab} />
                <TabButton id="environment" label="Context" icon={Zap} active={activeTab} onClick={setActiveTab} />
                <TabButton id="trends" label="Trends" icon={TrendingUp} active={activeTab} onClick={setActiveTab} />
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto relative">
                {activeTab === 'overview' && <OverviewView lat={lat} lng={lng} />}
                {activeTab === 'incidents' && <IncidentsView lat={lat} lng={lng} />}
                {activeTab === 'environment' && <EnvironmentView lat={lat} lng={lng} />}
                {activeTab === 'alerts' && <PlaceholderView title="Official Alerts" icon={AlertTriangle} desc="Active high-priority alerts from verified public agencies." />}
                {activeTab === 'trends' && <PlaceholderView title="Temporal Trends" icon={TrendingUp} desc="Analysis of safety signals over time (30d, 90d, 1y)." />}
            </div>
        </div>
    );
}

// --- Components ---

function TabButton({ id, label, icon: Icon, active, onClick }: { id: TabId, label: string, icon: any, active: TabId, onClick: (id: TabId) => void }) {
    const isActive = active === id;
    return (
        <button
            onClick={() => onClick(id)}
            className={`flex flex-col items-center justify-center flex-1 py-3 px-1 transition-all duration-200 border-b-2 ${isActive ? 'border-indigo-500 text-indigo-600 bg-white' : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-100/50'}`}
        >
            <Icon className={`w-4 h-4 mb-1 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
            <span className="text-[10px] font-medium tracking-tight mb-0.5">{label}</span>
        </button>
    );
}

function OverviewView({ lat, lng }: { lat: number, lng: number }) {
    const { data, error, isLoading } = useSWR(
        `${process.env.NEXT_PUBLIC_API_URL}/safety/snapshot/?lat=${lat}&lng=${lng}&time=day`,
        fetcher
    );

    if (isLoading) return <LoadingState />;
    if (error || !data) return <ErrorState />;

    const { score, confidence, reasons, evidence } = data;

    // Config Logic
    const getScoreConfig = (s: number) => {
        if (s < 0) return { color: "text-gray-500", bg: "bg-gray-50", border: "border-gray-200", label: "Coverage Unavailable" };
        if (s >= 80) return { color: "text-emerald-800", bg: "bg-emerald-50", border: "border-emerald-200", label: "Strong Safety Context" };
        if (s >= 50) return { color: "text-amber-800", bg: "bg-amber-50", border: "border-amber-200", label: "Moderate Context" };
        return { color: "text-rose-900", bg: "bg-rose-50", border: "border-rose-200", label: "Elevated Risk Context" };
    };
    const config = getScoreConfig(score);

    // Risk Calc
    let crimeImpact = 0;
    let envImpact = 0;
    reasons.forEach((r: any) => {
        const impact = r.score_impact || 0;
        if (r.factor === 'crime_history') crimeImpact += impact;
        if (r.factor === 'environment') envImpact += impact;
    });
    const riskFromCrime = Math.abs(Math.min(crimeImpact, 0));
    const riskFromEnv = Math.abs(Math.min(envImpact, 0));
    const totalRisk = riskFromCrime + riskFromEnv || 1;
    const crimePct = Math.round((riskFromCrime / totalRisk) * 100);
    const envPct = Math.round((riskFromEnv / totalRisk) * 100);

    return (
        <div className="animate-in fade-in duration-300 pb-10">
            {/* Header */}
            <div className={`p-6 border-b border-gray-100 ${config.bg}`}>
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Safety Intelligence Snapshot</h2>
                <div className="flex items-baseline space-x-3">
                    <span className={`text-5xl font-bold tracking-tight ${config.color} tabular-nums`}>
                        {score < 0 ? "--" : score}
                    </span>
                    {score >= 0 && <span className="text-sm font-medium text-gray-500">/ 100</span>}
                </div>
                <div className="mt-4 flex items-center space-x-2">
                    <span className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${config.border} ${config.color} bg-white/50 backdrop-blur`}>
                        {config.label}
                    </span>
                    <span className="text-xs text-gray-500">Confidence: <strong className="text-gray-700 capitalize">{confidence}</strong></span>
                </div>

                {/* Risk Contribution */}
                {(riskFromCrime > 0 || riskFromEnv > 0) && (
                    <div className="mt-6">
                        <h4 className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-2">Risk Contribution</h4>
                        <div className="flex h-2 w-full rounded-full overflow-hidden bg-gray-200/50">
                            {riskFromCrime > 0 && <div style={{ width: `${crimePct}%` }} className="bg-indigo-400" />}
                            {riskFromEnv > 0 && <div style={{ width: `${envPct}%` }} className="bg-teal-400" />}
                        </div>
                        <div className="flex justify-between mt-1.5 text-[10px] text-gray-500 font-medium">
                            {riskFromCrime > 0 && <span className="flex items-center"><div className="w-1.5 h-1.5 bg-indigo-400 rounded-full mr-1.5" />Historical Reports</span>}
                            {riskFromEnv > 0 && <span className="flex items-center"><div className="w-1.5 h-1.5 bg-teal-400 rounded-full mr-1.5" />Env. Context</span>}
                        </div>
                    </div>
                )}
            </div>

            {/* Analysis */}
            <div className="p-6 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900 mb-5 flex items-center"><Shield className="w-4 h-4 mr-2 text-gray-400" />Contextual Analysis</h3>
                <div className="space-y-6">
                    {reasons.map((reason: any, idx: number) => (
                        <div key={idx} className="relative pl-4 border-l-2 border-gray-100">
                            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">{reason.factor.replace('_', ' ')}</h4>
                            <p className="text-sm text-gray-600 leading-relaxed">{reason.detail}</p>
                            <div className="mt-1 flex items-center text-[10px] font-medium">
                                <span className={`uppercase tracking-wider ${reason.impact === 'negative' ? 'text-rose-600' : reason.impact === 'positive' ? 'text-emerald-600' : 'text-gray-400'}`}>{reason.impact} Impact</span>
                            </div>
                        </div>
                    ))}
                </div>
                {/* Disclosure */}
                <div className="mt-8 pt-6 border-t border-gray-100">
                    <details className="group">
                        <summary className="flex items-center cursor-pointer text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors">
                            <span className="mr-2 group-open:rotate-90 transition-transform">▸</span>
                            Score Methodology & Disclosure
                        </summary>
                        <div className="mt-3 pl-4 text-xs text-gray-500 space-y-2 leading-relaxed">
                            <p>Scores start at 100. Deductions are applied based on aggregated incident density (1yr) and environmental penalties.</p>
                        </div>
                    </details>
                </div>
            </div>

            {/* Evidence Layers Summary */}
            <div className="p-6 bg-gray-50 border-t border-gray-200">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">Evidence Layers</h3>
                <div className="grid gap-2">
                    <EvidencePill icon={AlertTriangle} label="Official Alerts" type="LIVE_OFFICIAL" color="text-amber-500" date={evidence.alerts.last_updated} />
                    <EvidencePill icon={Shield} label="Incident Reports" type="HISTORICAL_ONLY" color="text-indigo-500" date={evidence.crime.last_updated} />
                    <EvidencePill icon={Zap} label="Environmental" type="SATELLITE_DERIVED" color="text-teal-500" date={evidence.environment.last_updated} />
                </div>
            </div>
        </div>
    );
}

function IncidentsView({ lat, lng }: { lat: number, lng: number }) {
    const [days, setDays] = useState(90);
    const { data, isLoading } = useSWR(`${process.env.NEXT_PUBLIC_API_URL}/safety/context/incidents/?lat=${lat}&lng=${lng}&days=${days}`, fetcher);

    if (isLoading || !data) return <LoadingState />;
    const { mix, trend, meta } = data;
    const maxTrend = Math.max(...trend.map((d: any) => d.count), 1);

    return (
        <div className="animate-in fade-in duration-300 pb-10">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <h3 className="text-xs font-semibold text-gray-700">Historical Context</h3>
                <div className="flex space-x-1">
                    {[90, 180, 365].map(d => (
                        <button key={d} onClick={() => setDays(d)} className={`px-2 py-1 text-[10px] rounded border ${days === d ? 'bg-white border-gray-200 shadow-sm text-gray-800 font-medium' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                            {d === 90 ? '90D' : d === 180 ? '6M' : '1Y'}
                        </button>
                    ))}
                </div>
            </div>
            <div className="px-6 py-3 bg-amber-50/50 border-b border-amber-100/50 text-[10px] text-amber-800/70 leading-tight">
                <strong>Analysis Layer:</strong> Aggregated historical incident context — not live incidents.
            </div>
            <div className="p-6 border-b border-gray-100">
                <div className="flex items-center justify-between mb-4">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Activity Trend (Weekly)</h4>
                    <span className="text-[10px] text-gray-400 tabular-nums">Total: {meta.total}</span>
                </div>
                <div className="h-24 w-full flex items-end justify-between space-x-[2px]">
                    {trend.map((t: any, idx: number) => {
                        const h = (t.count / maxTrend) * 100;
                        return <div key={idx} className={`flex-1 rounded-t-sm ${t.count === 0 ? 'bg-gray-100' : 'bg-indigo-300'}`} style={{ height: `${Math.max(h, 5)}%` }} title={`${t.week}: ${t.count}`} />
                    })}
                </div>
            </div>
            <div className="p-6">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">Incident Mix</h4>
                <div className="space-y-4">
                    {mix.map((m: any, idx: number) => {
                        const labels: Record<string, string> = {
                            'aggregated_index_crime': 'Serious Crimes (Aggregated)',
                            'burglary': 'Burglary',
                            'felony_assault': 'Felony Assault',
                            'grand_larceny': 'Grand Larceny',
                            'petit_larceny': 'Petit Larceny',
                            'robbery': 'Robbery'
                        };
                        const label = labels[m.category] || m.category.toLowerCase().replace(/_/g, ' ');

                        return (
                            <div key={idx}>
                                <div className="flex justify-between text-xs mb-1">
                                    <div className="flex flex-col">
                                        <span className="font-medium text-gray-600 capitalize">{label}</span>
                                        {m.category === 'aggregated_index_crime' && (
                                            <span className="text-[9px] text-gray-400 font-normal leading-tight mt-0.5 max-w-[200px]">
                                                (Murder, Rape, Robbery, Assault, Burglary, Larceny, MV Theft)
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-gray-400">{m.pct}%</span>
                                </div>
                                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden"><div style={{ width: `${m.pct}%` }} className="h-full bg-slate-500 rounded-full" /></div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    );
}

function EnvironmentView({ lat, lng }: { lat: number, lng: number }) {
    const [days, setDays] = useState(7); // Toggle 7d vs 24h
    const { data, isLoading } = useSWR(`${process.env.NEXT_PUBLIC_API_URL}/safety/context/environment/?lat=${lat}&lng=${lng}&days=${days}`, fetcher);

    if (isLoading || !data) return <LoadingState />;
    const { metrics, trend, meta } = data;

    return (
        <div className="animate-in fade-in duration-300 pb-10">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <h3 className="text-xs font-semibold text-gray-700">Environmental Context</h3>
                <div className="flex space-x-1">
                    {[1, 7].map(d => (
                        <button key={d} onClick={() => setDays(d)} className={`px-2 py-1 text-[10px] rounded border ${days === d ? 'bg-white border-gray-200 shadow-sm text-gray-800 font-medium' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                            {d === 1 ? '24H' : '7D'}
                        </button>
                    ))}
                </div>
            </div>
            <div className="px-6 py-3 bg-teal-50/50 border-b border-teal-100/50 text-[10px] text-teal-800/70 leading-tight">
                <strong>Context Layer:</strong> {meta.disclaimer}
            </div>
            <div className="p-6 grid gap-4">
                {metrics.map((m: any, idx: number) => {
                    const advice = getEnvAdvice(m.label, m.value, m.status);
                    return (
                        <div key={idx} className="bg-white border boundary-gray-200 rounded-lg p-3 shadow-sm relative overflow-hidden">
                            <div className="flex justify-between items-start mb-2"><span className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">{m.label}</span><Zap className="w-3 h-3 text-teal-400" /></div>
                            <div className="flex items-baseline space-x-2 mb-1"><span className="text-lg font-bold text-gray-800">{m.value}</span><span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${m.status === 'Good' || m.status === 'Clear' ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-600'}`}>{m.status}</span></div>

                            {/* Safety Recommendation */}
                            {advice && (
                                <div className="mt-2 text-[10px] text-gray-600 bg-teal-50/50 p-2 rounded leading-tight border border-teal-100/50 flex items-start">
                                    <span className="mr-1.5 text-teal-600">💡</span>
                                    {advice}
                                </div>
                            )}

                            <div className="mt-2 pt-2 border-t border-gray-50 flex justify-between items-center text-[9px] text-gray-400"><span>{m.source}</span><span>Res: {m.res}</span></div>
                        </div>
                    );
                })}
            </div>
            <div className="p-6 border-t border-gray-100">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">PM2.5 Trend ({days === 1 ? 'Last 24h' : 'Last 7 Days'})</h4>
                <div className="relative h-24 w-full flex items-end px-1 space-x-[2px]">
                    {trend.map((t: any, idx: number) => {
                        const h = (t.val / 50) * 100;
                        return <div key={idx} className="flex-1 bg-teal-100/50 hover:bg-teal-200 transition-colors rounded-t-sm" style={{ height: `${Math.max(h, 5)}%` }} title={`${t.day}: ${t.val}`} />
                    })}
                </div>
            </div>
        </div>
    );
}

function PlaceholderView({ title, icon: Icon, desc }: { title: string, icon: any, desc: string }) {
    return (
        <div className="p-8 text-center flex flex-col items-center justify-center h-full text-gray-400">
            <div className="bg-gray-50 p-4 rounded-full mb-4"><Icon className="w-8 h-8 text-gray-300" /></div>
            <h3 className="text-sm font-semibold text-gray-600 mb-1">{title}</h3>
            <p className="text-xs max-w-[200px] leading-relaxed">{desc}</p>
            <span className="mt-4 text-[10px] uppercase tracking-widest text-indigo-400 bg-indigo-50 px-2 py-1 rounded">Coming Soon</span>
        </div>
    );
}

function LoadingState() {
    return <div className="p-6 flex items-center justify-center text-gray-500"><Loader2 className="w-6 h-6 animate-spin mr-2" />Analyzing...</div>;
}
function ErrorState() {
    return <div className="p-6 text-red-500 text-sm">Failed to load data.</div>;
}

// --- Helpers ---

function getEnvAdvice(label: string, value: string | number, status: string) {
    const l = label.toLowerCase();

    if (l.includes('pm2.5')) {
        if (status === 'Moderate') return "Air quality is acceptable. Sensitive groups should limit prolonged outdoor exertion.";
        if (status === 'Unhealthy') return "High particulate matter detected. Wear a mask if outdoors for extended periods.";
        return "Air quality is good. No special precautions needed.";
    }

    if (l.includes('smoke')) {
        if (value === 'Detected' || status === 'Warning') return "Smoke/Haze detected from regional fires. Keep windows closed and avoid outdoor exercise.";
        return "No smoke detected.";
    }

    if (l.includes('lighting')) {
        if (String(value) === 'Low') return "Low ambient lighting detected (Satellite). Stick to main reads and avoid unlit parks at night.";
        if (String(value) === 'High') return "Well-lit urban area. Good visibility for night-time pedestrian activity.";
        return "Moderate lighting levels.";
    }

    return null;
}

function EvidencePill({ icon: Icon, label, type, color, date }: any) {
    return (
        <div className="bg-white px-3 py-2.5 rounded border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center text-xs font-semibold text-gray-700"><Icon className={`w-3.5 h-3.5 mr-2 ${color}`} />{label}</div>
                <span className="text-[9px] font-mono text-gray-400 bg-gray-100 px-1 rounded uppercase tracking-tighter">{type}</span>
            </div>
            <div className="text-[10px] text-gray-400 pl-5.5">Updated: {new Date(date).toLocaleDateString()}</div>
        </div>
    )
}
