import useSWR from "swr";
import {
    MapPin, Info, ArrowRight, Shield, AlertTriangle, CloudLightning, Activity,
    ChevronDown, ChevronRight, X, TrendingUp, Link as LinkIcon, ExternalLink,
    LayoutDashboard, Zap, Train, CloudRain, Megaphone, Loader2, Moon, Sun
} from "lucide-react";
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";

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
    const { theme, setTheme } = useTheme();

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
            <div className="h-full bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 shadow-xl flex items-center justify-center p-6 text-gray-500 dark:text-gray-400 text-sm w-[400px]">
                Select a location on the map to view data.
            </div>
        );
    }

    return (
        <div className="h-full overflow-hidden bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 shadow-xl flex flex-col w-[400px]">
            {/* Header / Address Bar */}
            <div className="bg-gray-900 dark:bg-black px-4 py-3 flex items-start justify-between shadow-sm z-10 shrink-0">
                <div className="flex items-start space-x-3">
                    <MapPin className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
                    <div>
                        <h1 className="text-xs font-bold text-white leading-tight">{address || "Loading address..."}</h1>
                        <span className="text-[10px] text-gray-400 font-mono mt-0.5 block">{lat.toFixed(4)}, {lng.toFixed(4)}</span>
                    </div>
                </div>
                {/* Theme Toggle */}
                <button
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    className="text-gray-400 hover:text-white transition-colors"
                >
                    {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center border-b border-gray-100 dark:border-gray-800 px-2 pt-2 bg-gray-50/50 dark:bg-gray-900/50 shrink-0">
                <TabButton id="overview" label="Snapshot" icon={LayoutDashboard} active={activeTab} onClick={setActiveTab} />
                <TabButton id="incidents" label="Incidents" icon={Shield} active={activeTab} onClick={setActiveTab} />
                <TabButton id="alerts" label="Alerts" icon={AlertTriangle} active={activeTab} onClick={setActiveTab} />
                <TabButton id="environment" label="Context" icon={Zap} active={activeTab} onClick={setActiveTab} />
                <TabButton id="trends" label="Trends" icon={TrendingUp} active={activeTab} onClick={setActiveTab} />
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto relative">
                {activeTab === 'overview' && <OverviewView lat={lat} lng={lng} setActiveTab={setActiveTab} />}
                {activeTab === 'incidents' && <IncidentsView lat={lat} lng={lng} />}
                {activeTab === 'environment' && <EnvironmentView lat={lat} lng={lng} />}
                {activeTab === 'alerts' && <AlertsView lat={lat} lng={lng} />}
                {activeTab === 'trends' && <TrendsView lat={lat} lng={lng} />}
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
            className={`flex flex-col items-center justify-center flex-1 py-3 px-1 transition-all duration-200 border-b-2 ${isActive
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-gray-950'
                : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100/50 dark:hover:bg-gray-800'
                }`}
        >
            <Icon className={`w-4 h-4 mb-1 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
            <span className="text-[10px] font-medium tracking-tight mb-0.5">{label}</span>
        </button>
    );
}

function OverviewView({ lat, lng, setActiveTab }: { lat: number, lng: number, setActiveTab: (id: TabId) => void }) {
    const { data, error, isLoading } = useSWR(
        `${process.env.NEXT_PUBLIC_API_URL}/safety/snapshot/?lat=${lat}&lng=${lng}&time=day`,
        fetcher
    );

    if (isLoading) return <LoadingState />;
    if (error || !data) return <ErrorState />;

    const { score, confidence, reasons, evidence } = data;

    // Config Logic
    const getScoreConfig = (s: number) => {
        if (s < 0) return { color: "text-gray-500 dark:text-gray-400", bg: "bg-gray-50 dark:bg-gray-900", border: "border-gray-200 dark:border-gray-800", label: "Coverage Unavailable" };
        if (s >= 80) return { color: "text-emerald-800 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-200 dark:border-emerald-900", label: "Strong Safety Context" };
        if (s >= 50) return { color: "text-amber-800 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-900", label: "Moderate Context" };
        return { color: "text-rose-900 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-950/30", border: "border-rose-200 dark:border-rose-900", label: "Elevated Risk Context" };
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
            <div className={`p-6 border-b border-gray-100 dark:border-gray-800 ${config.bg}`}>
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">Safety Intelligence Snapshot</h2>
                <div className="flex items-baseline space-x-3">
                    <span className={`text-5xl font-bold tracking-tight ${config.color} tabular-nums`}>
                        {score < 0 ? "--" : score}
                    </span>
                    {score >= 0 && <span className="text-sm font-medium text-gray-500 dark:text-gray-400">/ 100</span>}
                </div>
                <div className="mt-4 flex items-center space-x-2">
                    <span className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${config.border} ${config.color} bg-white/50 dark:bg-black/20 backdrop-blur`}>
                        {config.label}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">Confidence: <strong className="text-gray-700 dark:text-gray-200 capitalize">{confidence}</strong></span>
                </div>

                {/* Risk Contribution */}
                {(riskFromCrime > 0 || riskFromEnv > 0) && (
                    <div className="mt-6">
                        <h4 className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 font-semibold mb-2">Risk Interactive Composition</h4>
                        <div className="flex h-6 w-full rounded-md overflow-hidden bg-gray-200/50 dark:bg-gray-800 cursor-pointer shadow-sm">
                            {riskFromCrime > 0 && (
                                <button
                                    onClick={() => setActiveTab('incidents')}
                                    style={{ width: `${crimePct}%` }}
                                    className="h-full bg-indigo-400 dark:bg-indigo-500 hover:bg-indigo-500 hover:opacity-90 transition-all group relative"
                                    title="View Historical Incidents"
                                >
                                    <span className="absolute inset-x-0 bottom-full mb-1 text-[9px] font-bold text-indigo-600 dark:text-indigo-300 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">View Incidents</span>
                                </button>
                            )}
                            {riskFromEnv > 0 && (
                                <button
                                    onClick={() => setActiveTab('environment')}
                                    style={{ width: `${envPct}%` }}
                                    className="h-full bg-teal-400 dark:bg-teal-500 hover:bg-teal-500 hover:opacity-90 transition-all group relative"
                                    title="View Environmental Context"
                                >
                                    <span className="absolute inset-x-0 bottom-full mb-1 text-[9px] font-bold text-teal-600 dark:text-teal-300 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">View Context</span>
                                </button>
                            )}
                        </div>
                        <div className="flex justify-between mt-1.5 text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                            {riskFromCrime > 0 && (
                                <button onClick={() => setActiveTab('incidents')} className="flex items-center hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                                    <div className="w-1.5 h-1.5 bg-indigo-400 dark:bg-indigo-500 rounded-full mr-1.5" />
                                    Historical Reports
                                </button>
                            )}
                            {riskFromEnv > 0 && (
                                <button onClick={() => setActiveTab('environment')} className="flex items-center hover:text-teal-600 dark:hover:text-teal-400 transition-colors">
                                    <div className="w-1.5 h-1.5 bg-teal-400 dark:bg-teal-500 rounded-full mr-1.5" />
                                    Env. Context
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Analysis */}
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-5 flex items-center"><Shield className="w-4 h-4 mr-2 text-gray-400" />Contextual Analysis</h3>
                <div className="space-y-6">
                    {reasons.map((reason: any, idx: number) => (
                        <div key={idx} className="relative pl-4 border-l-2 border-gray-100 dark:border-gray-800">
                            <h4 className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide mb-1">{reason.factor.replace('_', ' ')}</h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{reason.detail}</p>
                            <div className="mt-1 flex items-center text-[10px] font-medium">
                                <span className={`uppercase tracking-wider ${reason.impact === 'negative' ? 'text-rose-600 dark:text-rose-400' : reason.impact === 'positive' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>{reason.impact} Impact</span>
                            </div>
                        </div>
                    ))}
                </div>
                {/* Disclosure */}
                <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800">
                    <details className="group">
                        <summary className="flex items-center cursor-pointer text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors">
                            <span className="mr-2 group-open:rotate-90 transition-transform">▸</span>
                            Score Methodology & Disclosure
                        </summary>
                        <div className="mt-3 pl-4 text-xs text-gray-500 dark:text-gray-500 space-y-2 leading-relaxed">
                            <p>Scores start at 100. Deductions are applied based on aggregated incident density (1yr) and environmental penalties.</p>
                        </div>
                    </details>
                </div>
            </div>

            {/* Evidence Layers Summary */}
            <div className="p-6 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
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
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/50">
                <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-200">Historical Context</h3>
                <div className="flex space-x-1">
                    {[90, 180, 365].map(d => (
                        <button key={d} onClick={() => setDays(d)} className={`px-2 py-1 text-[10px] rounded border ${days === d ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm text-gray-800 dark:text-gray-100 font-medium' : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                            {d === 90 ? '90D' : d === 180 ? '6M' : '1Y'}
                        </button>
                    ))}
                </div>
            </div>
            <div className="px-6 py-3 bg-amber-50/50 dark:bg-amber-950/20 border-b border-amber-100/50 dark:border-amber-900/30 text-[10px] text-amber-800/70 dark:text-amber-400/80 leading-tight">
                <strong>Analysis Layer:</strong> Aggregated historical incident context — not live incidents.
            </div>
            <div className="p-6 border-b border-gray-100 dark:border-gray-800">
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

                            <div className="mt-2 pt-2 border-t border-gray-50 dark:border-gray-800 flex justify-between items-center text-[9px] text-gray-400 dark:text-gray-500">
                                <span>{m.source}</span>
                                <div className="flex items-center space-x-2">
                                    <span className="bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 px-1 rounded uppercase tracking-tighter text-[8px] font-bold">Satellite</span>
                                    <span>Res: {m.res}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="p-6 border-t border-gray-100 dark:border-gray-800">
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

function AlertsView({ lat, lng }: { lat: number, lng: number }) {
    const { data, isLoading } = useSWR(
        `${process.env.NEXT_PUBLIC_API_URL}/safety/context/alerts/?lat=${lat}&lng=${lng}`,
        fetcher
    );

    if (isLoading || !data) return <LoadingState />;

    const { alerts, meta } = data;

    const getIcon = (cat: string) => {
        const c = cat.toLowerCase();
        if (c.includes('transit') || c.includes('mta')) return Train;
        if (c.includes('weather')) return CloudRain;
        if (c.includes('police') || c.includes('safety')) return Shield;
        return Megaphone;
    };

    return (
        <div className="animate-in fade-in duration-300 pb-10">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/50">
                <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-200">Official Alerts</h3>
                <span className="text-[10px] bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">Live</span>
            </div>

            {alerts.length === 0 ? (
                <div className="p-8 text-center text-gray-400 dark:text-gray-500">
                    <div className="w-12 h-12 bg-gray-50 dark:bg-gray-800/50 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Zap className="w-5 h-5 text-gray-300 dark:text-gray-600" />
                    </div>
                    <p className="text-xs">No active alerts for this specific location.</p>
                </div>
            ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {alerts.map((a: any) => {
                        const Icon = getIcon(a.category);
                        return (
                            <div key={a.id} className="p-5 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors group">
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center space-x-2">
                                        <div className={`p-1.5 rounded-md ${a.severity > 5 ? 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400' : 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'}`}>
                                            <Icon className="w-4 h-4" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400 tracking-wider">{a.source}</span>
                                            <span className="text-xs font-semibold text-gray-900 dark:text-white max-w-[200px] truncate">{a.title}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <span className="text-[9px] text-gray-400 dark:text-gray-500 whitespace-nowrap">{new Date(a.published_at).toLocaleDateString()}</span>
                                        {a.url && (
                                            <a
                                                href={a.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-gray-400 hover:text-indigo-500 dark:text-gray-500 dark:hover:text-indigo-400 transition-colors"
                                                title="View External Source"
                                            >
                                                <ExternalLink className="w-3 h-3" />
                                            </a>
                                        )}
                                    </div>
                                </div>
                                <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed pl-8 line-clamp-3">
                                    {a.summary}
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 text-[10px] text-gray-400 dark:text-gray-500 leading-tight">
                <strong>Disclaimer:</strong> {meta.disclaimer}
            </div>
        </div>
    );
}



function TrendsView({ lat, lng }: { lat: number, lng: number }) {
    const { data, isLoading } = useSWR(
        `${process.env.NEXT_PUBLIC_API_URL}/safety/context/incidents/?lat=${lat}&lng=${lng}&days=365`,
        fetcher
    );

    // State for interactive tooltip & selection
    const [hoveredItem, setHoveredItem] = useState<any | null>(null);
    const [selectedItem, setSelectedItem] = useState<any | null>(null);

    // Effect: reset selection when coordinates change
    useEffect(() => setSelectedItem(null), [lat, lng]);

    if (isLoading || !data) return <LoadingState />;

    const { trend, meta } = data;

    // Aggregate Weekly -> Monthly with Category Breakdown
    const monthlyData = trend.reduce((acc: any[], curr: any) => {
        const date = new Date(curr.week);
        const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
        const label = date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

        const existing = acc.find(item => item.key === monthKey);
        if (existing) {
            existing.count += curr.count;
            existing.weeks += 1;
            // Merge breakdowns
            if (curr.breakdown) {
                Object.entries(curr.breakdown).forEach(([cat, count]) => {
                    existing.breakdown[cat] = (existing.breakdown[cat] || 0) + (count as number);
                });
            }
        } else {
            acc.push({
                key: monthKey,
                label: label,
                date: date,
                count: curr.count,
                weeks: 1,
                breakdown: { ...(curr.breakdown || {}) }
            });
        }
        return acc;
    }, []);

    const chartData = monthlyData;
    const maxCount = Math.max(...chartData.map((t: any) => t.count), 1);

    // Display Logic: Valid selection > Hover > Selection > Last Month
    const activeData = hoveredItem || selectedItem || chartData[chartData.length - 1];
    const isLocked = !!selectedItem; // Visual state for when a bar is clicked

    // Helper to get breakdown UI data
    const getBreakdownList = (bd: any) => {
        if (!bd) return [];
        const list = Object.entries(bd)
            .map(([cat, count]) => ({ cat, count: count as number, details: '' }))
            .sort((a, b) => b.count - a.count); // Descending

        if (list.length <= 4) return list;

        // If more than 4, aggregate the rest into "Others"
        const top3 = list.slice(0, 3);
        const othersList = list.slice(3);
        const othersCount = othersList.reduce((acc, curr) => acc + curr.count, 0);

        // Create a detail string: "Drugs: 2, Public Order: 1"
        const othersDetails = othersList
            .map(x => `${x.cat.replace(/_/g, ' ')}: ${x.count}`)
            .join(', ');

        return [...top3, { cat: 'Others', count: othersCount, details: othersDetails }];
    };

    const breakdownList = activeData ? getBreakdownList(activeData.breakdown) : [];

    return (
        <div className="animate-in fade-in duration-300 pb-10">
            {/* Header */}
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 sticky top-0 z-10 backdrop-blur-md bg-white/80 dark:bg-black/80">
                <div className="flex items-center justify-between mb-1">
                    <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-200">Safety Signal Trends (1 Year)</h3>
                    <div className="flex items-center space-x-2">
                        {isLocked && (
                            <button
                                onClick={() => setSelectedItem(null)}
                                className="text-[9px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded transition-colors"
                            >
                                <X className="w-3 h-3 mr-1" /> Clear
                            </button>
                        )}
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full transition-colors duration-200 ${isLocked ? 'bg-indigo-600 text-white shadow-sm' : 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50'}`}>
                            {activeData ? activeData.label : 'Select Month'}
                        </span>
                    </div>
                </div>
                <div className="flex items-baseline space-x-2">
                    <span className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                        {activeData ? activeData.count : '--'}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">signals reported {isLocked ? '(Selected)' : ''}</span>
                </div>

                {/* Breakdown Panel (Inline) */}
                {breakdownList.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-2 animate-in slide-in-from-top-1 duration-200">
                        {breakdownList.map((item, i) => (
                            <div
                                key={i}
                                title={item.details || undefined}
                                className={`flex items-center justify-between px-2 py-1.5 rounded border shadow-sm transition-colors ${item.cat === 'Others' ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800/30 cursor-help' : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800'}`}
                            >
                                <span className={`text-[10px] font-medium capitalize truncate max-w-[80px] ${item.cat === 'Others' ? 'text-indigo-600 dark:text-indigo-300 italic' : 'text-gray-600 dark:text-gray-300'}`}>{item.cat.replace(/_/g, ' ')}</span>
                                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">{item.count}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="p-6 relative">
                {chartData.length === 0 ? (
                    <div className="text-center text-gray-400 dark:text-gray-500 py-20 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-800">
                        <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-20" />
                        <span className="text-xs">No historical trend data available.</span>
                    </div>
                ) : (
                    <div className="relative">
                        {/* Monthly Bar Chart */}
                        <div className="h-64 flex items-end justify-between space-x-2 pt-6">
                            {chartData.map((t: any, i: number) => {
                                const heightPct = (t.count / maxCount) * 100;
                                const isHovered = hoveredItem?.key === t.key;
                                const isSelected = selectedItem?.key === t.key;

                                const isActive = isHovered || isSelected;

                                return (
                                    <div
                                        key={i}
                                        className="flex-1 flex flex-col items-center group relative h-full justify-end cursor-pointer"
                                        onMouseEnter={() => setHoveredItem(t)}
                                        onMouseLeave={() => setHoveredItem(null)}
                                        onClick={() => setSelectedItem(isSelected ? null : t)}
                                    >
                                        <div className="absolute inset-x-0.5 bottom-0 top-0 z-20 cursor-crosshair"></div>

                                        {/* Solid, Rounded Bars */}
                                        <div
                                            className={`
                                                w-full mx-0.5 rounded-t-md transition-all duration-200 min-h-[6px] relative z-10
                                                ${isActive
                                                    ? 'bg-indigo-500 scale-y-105 shadow-md'
                                                    : 'bg-indigo-200 dark:bg-indigo-500/30 hover:bg-indigo-300 dark:hover:bg-indigo-500/50'
                                                }
                                                ${isSelected ? 'ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-gray-950' : ''}
                                            `}
                                            style={{ height: `${Math.max(heightPct, 3)}%` }}
                                        >
                                            {/* Tooltip on Hover */}
                                            {isHovered && (
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 text-[10px] font-bold text-white bg-gray-900 dark:bg-white dark:text-gray-900 px-2 py-1 rounded shadow-xl whitespace-nowrap z-30 pointer-events-none">
                                                    {t.count} Signals
                                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-white"></div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {/* Month Labels */}
                        <div className="flex justify-between mt-3 px-1 border-t border-gray-100 dark:border-gray-800 pt-2">
                            {chartData.map((t: any, i: number) => (
                                <span key={i} className={`text-[8px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider ${i % 2 !== 0 ? 'hidden' : 'block'}`}>
                                    {t.label.split(' ')[0]}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="px-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-gray-50/50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-800">
                        <div className="flex items-center space-x-2 mb-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-bold">Total Signals</span>
                        </div>
                        <span className="text-2xl font-bold text-gray-800 dark:text-white tracking-tight">{meta.total}</span>
                    </div>
                    <div className="p-4 bg-gray-50/50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-800">
                        <div className="flex items-center space-x-2 mb-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-bold">Avg / Month</span>
                        </div>
                        <span className="text-2xl font-bold text-gray-800 dark:text-white tracking-tight">{chartData.length ? Math.round(meta.total / chartData.length) : 0}</span>
                    </div>
                </div>

                <div className="bg-blue-50/30 dark:bg-blue-950/20 rounded-lg p-4 border border-blue-100/50 dark:border-blue-900/30">
                    <h4 className="text-[11px] font-semibold text-blue-900 dark:text-blue-200 mb-1 flex items-center">
                        <Info className="w-3.5 h-3.5 mr-1.5 text-blue-500 dark:text-blue-400" />
                        Analysis
                    </h4>
                    <p className="text-[11px] text-blue-900/60 dark:text-blue-200/60 leading-relaxed">
                        Data represents aggregated incident volume by month.
                        Tap any bar to lock the breakdown view for that specific period.
                    </p>
                </div>
            </div>
        </div>
    );
}

function EvidencePill({ icon: Icon, label, type, color, date }: any) {
    return (
        <div className="bg-white dark:bg-gray-950 px-3 py-2.5 rounded border border-gray-200 dark:border-gray-800 shadow-sm">
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center text-xs font-semibold text-gray-700 dark:text-gray-200"><Icon className={`w-3.5 h-3.5 mr-2 ${color}`} />{label}</div>
                <span className="text-[9px] font-mono text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-1 rounded uppercase tracking-tighter">{type}</span>
            </div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500 pl-5.5">Updated: {new Date(date).toLocaleDateString()}</div>
        </div>
    )
}
