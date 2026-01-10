"use client";

import * as React from "react";
import Map, { Marker, NavigationControl, ViewState, Source, Layer, useMap } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { MapPin, Train, CloudRain, Megaphone, Shield, AlertTriangle, Search, X, Footprints, Navigation } from "lucide-react";
import useSWR from "swr";
import useSupercluster from "use-supercluster";
import { Logo } from "./Logo";
import { GeocoderInput } from "./GeocoderInput";

interface MapComponentProps {
    onLocationSelect: (lat: number, lng: number) => void;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const fetcher = (url: string) => fetch(url).then(res => res.json());

const getAlertIcon = (cat: string) => {
    const c = (cat || '').toLowerCase();
    if (c.includes('transit') || c.includes('mta')) return Train;
    if (c.includes('weather')) return CloudRain;
    if (c.includes('police') || c.includes('safety')) return Shield;
    return Megaphone;
};

import { useTheme } from "next-themes";

export default function MapComponent({ onLocationSelect }: MapComponentProps) {
    const { theme } = useTheme();
    const mapStyle = theme === 'dark' ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11";

    const [viewState, setViewState] = React.useState<ViewState>({
        latitude: 37.7749,
        longitude: -122.4194,
        zoom: 12,
        bearing: 0,
        pitch: 0,
        padding: { top: 0, bottom: 0, left: 0, right: 0 }
    });

    const [marker, setMarker] = React.useState<{ lat: number; lng: number } | null>(null);
    const [hoverInfo, setHoverInfo] = React.useState<{ score: number; x: number; y: number } | null>(null);

    // Search State
    const [searchQuery, setSearchQuery] = React.useState("");

    // Routing Walk-with-me State
    // Routing Walk-with-me State
    const [isRouting, setIsRouting] = React.useState(false);
    const [startLoc, setStartLoc] = React.useState<{ lat: number, lng: number, text: string } | null>(null);
    const [endLoc, setEndLoc] = React.useState<{ lat: number, lng: number, text: string } | null>(null);
    const [routePath, setRoutePath] = React.useState<any>(null);
    const [routeExplanation, setRouteExplanation] = React.useState<string[] | null>(null);
    const [isCalculating, setIsCalculating] = React.useState(false);

    // Fetch Alerts for Pins
    const { data: alertsData } = useSWR(`${process.env.NEXT_PUBLIC_API_URL}/safety/alerts/`, fetcher);
    const alerts = alertsData?.features || [];

    const isValidLocation = (loc: { lat: number; lng: number } | null) => {
        return loc && loc.lat !== 0 && loc.lng !== 0 && !isNaN(loc.lat) && !isNaN(loc.lng);
    };

    const calculateRoute = React.useCallback(async () => {
        if (!isValidLocation(startLoc) || !isValidLocation(endLoc)) return;

        setIsCalculating(true);
        try {
            // @ts-ignore
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/safety/routes/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    start_lat: startLoc!.lat,
                    start_lng: startLoc!.lng,
                    end_lat: endLoc!.lat,
                    end_lng: endLoc!.lng
                })
            });

            if (!res.ok) throw new Error("Route calculation failed");

            const data = await res.json();
            setRoutePath(data);
            if (data.properties && data.properties.explanation) {
                setRouteExplanation(data.properties.explanation);
            }
        } catch (e) {
            console.error(e);
            // Only alert if we actually tried and failed, not just debounce
            // But we can't easily distinguish. Let's suppress verbose alerts for now or use toast?
            // Users hate popups.
            // alert("Could not calculate a safer route in this area. Try closer points (< 5km).");
        } finally {
            setIsCalculating(false);
        }
    }, [startLoc, endLoc]);

    // Auto-calculate when start/end change
    React.useEffect(() => {
        if (isRouting && startLoc && endLoc && isValidLocation(startLoc) && isValidLocation(endLoc)) {
            calculateRoute();
        }
    }, [startLoc, endLoc, isRouting, calculateRoute]);

    const toggleRoutingMode = () => {
        const nextState = !isRouting;
        setIsRouting(nextState);
        if (nextState) {
            // Initialize Start with current location/marker
            if (marker) {
                setStartLoc({ lat: marker.lat, lng: marker.lng, text: "Selected Pin" });
            } else {
                setStartLoc({ lat: viewState.latitude, lng: viewState.longitude, text: "Current View Center" });
            }
            setEndLoc(null);
        } else {
            setRoutePath(null);
            setRouteExplanation(null);
            setStartLoc(null);
            setEndLoc(null);
        }
    };

    const handleSelectLocation = (feature: any, type: 'search' | 'start' | 'end') => {
        const [lng, lat] = feature.center;
        const text = feature.text;

        setViewState(prev => ({
            ...prev,
            longitude: lng,
            latitude: lat,
            zoom: 15,
            transitionDuration: 1000
        }));

        const loc = { lat, lng, text };

        if (type === 'search') {
            setMarker({ lat, lng });
            onLocationSelect(lat, lng);
            setSearchQuery(text);
        } else if (type === 'start') {
            setStartLoc(loc);
        } else if (type === 'end') {
            setEndLoc(loc);
        }
    };

    const handleClick = (event: mapboxgl.MapLayerMouseEvent) => {
        const { lat, lng } = event.lngLat;

        if (isRouting) {
            if (!endLoc) {
                setEndLoc({ lat, lng, text: "Custom Destination" });
            } else if (!startLoc) {
                setStartLoc({ lat, lng, text: "Custom Start" });
            } else {
                // Determine which one to update?
                // Currently defaults to Destination if both set
                setEndLoc({ lat, lng, text: "Custom Destination" });
            }
        } else {
            setMarker({ lat, lng });
            onLocationSelect(lat, lng);
        }
    };

    const onHover = React.useCallback((event: mapboxgl.MapLayerMouseEvent) => {
        const {
            features,
            point: { x, y }
        } = event;

        const hoveredFeature = features && features[0];

        // Ensure we only show tooltip for the heatmap layer
        if (hoveredFeature && hoveredFeature.layer && hoveredFeature.layer.id === 'heatmap-layer' && hoveredFeature.properties) {
            setHoverInfo({
                score: hoveredFeature.properties.score,
                x,
                y
            });
        } else {
            setHoverInfo(null);
        }
    }, []);

    if (!MAPBOX_TOKEN) return <div>Token Missing</div>;

    // Ideally we get real bounds from mapRef, but react-map-gl v7+ handles it differently.
    // Let's use a ref to get the map instance for bounds.
    const mapRef = React.useRef<mapboxgl.Map | null>(null);
    const [mapBounds, setMapBounds] = React.useState<any>(null);

    const onMapLoad = (e: any) => {
        setMapBounds(e.target.getBounds().toArray().flat());
    };

    const points = React.useMemo(() => alerts.map((alert: any) => ({
        type: "Feature",
        properties: {
            cluster: false,
            alertId: alert.id,
            category: alert.properties.category,
            severity: alert.properties.severity,
            // Pass other props needed for rendering
            ...alert.properties
        },
        geometry: {
            type: "Point",
            coordinates: alert.geometry.coordinates
        }
    })), [alerts]);

    const { clusters, supercluster } = useSupercluster({
        points,
        bounds: mapBounds,
        zoom: viewState.zoom,
        options: { radius: 75, maxZoom: 12 } // Cluster until zoom 12 (City level)
    });

    return (
        <div className="relative w-full h-full font-sans">
            {/* Top Left Panel */}
            <div className="absolute top-4 left-4 z-20 w-80 max-w-[calc(100vw-2rem)] flex flex-col space-y-2">
                <div className="pl-1">
                    <Logo className="h-10 w-auto drop-shadow-sm" />
                </div>

                {!isRouting ? (
                    /* Standard Search */
                    <GeocoderInput
                        value={searchQuery}
                        onChange={setSearchQuery}
                        onSelect={(f) => handleSelectLocation(f, 'search')}
                        mapBoxToken={MAPBOX_TOKEN}
                        className="shadow-xl"
                    />
                ) : (
                    /* Routing Inputs */
                    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl p-3 border border-gray-100 dark:border-gray-800 animate-in slide-in-from-left-2 space-y-2">
                        <div className="flex items-center space-x-2 mb-1">
                            <Footprints className="w-4 h-4 text-teal-600" />
                            <span className="text-xs font-bold text-gray-500 uppercase">Safety Route</span>
                        </div>

                        {/* Start */}
                        <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <GeocoderInput
                                value={startLoc?.text || ""}
                                onChange={(val) => setStartLoc(prev => ({ lat: prev?.lat || 0, lng: prev?.lng || 0, text: val }))}
                                onSelect={(f) => handleSelectLocation(f, 'start')}
                                placeholder="Start Location"
                                mapBoxToken={MAPBOX_TOKEN}
                                className="flex-1"
                                icon={<span />} // Hide default icon
                            />
                        </div>

                        {/* End */}
                        <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                            <GeocoderInput
                                value={endLoc?.text || ""}
                                onChange={(val) => setEndLoc(prev => ({ lat: prev?.lat || 0, lng: prev?.lng || 0, text: val }))}
                                onSelect={(f) => handleSelectLocation(f, 'end')}
                                placeholder="Destination"
                                mapBoxToken={MAPBOX_TOKEN}
                                className="flex-1"
                                icon={<span />}
                            />
                        </div>

                        <div className="flex justify-end pt-1">
                            <button
                                onClick={calculateRoute}
                                disabled={isCalculating || !startLoc || !endLoc}
                                className="bg-teal-600 text-white text-xs px-3 py-1.5 rounded hover:bg-teal-700 disabled:opacity-50"
                            >
                                {isCalculating ? 'Routing...' : 'Update Route'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Walk with Me Toggle */}
            <div className="absolute top-4 right-4 z-20 flex flex-col items-end space-y-2">
                <button
                    onClick={toggleRoutingMode}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-lg shadow-lg transition-all ${isRouting ? 'bg-teal-600 text-white ring-2 ring-teal-400' : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50'}`}
                >
                    {isRouting ? <X className="w-4 h-4" /> : <Footprints className="w-5 h-5" />}
                    <span className="font-medium text-sm">{isRouting ? 'Exit' : 'Walk with me'}</span>
                </button>
            </div>

            {/* Route Explanation Overlay */}
            {routePath && routeExplanation && (
                <div className="absolute top-20 right-4 z-20 w-72 bg-white/95 dark:bg-gray-900/95 backdrop-blur p-4 rounded-lg shadow-xl border border-teal-100 dark:border-teal-900 animate-in fade-in slide-in-from-right-2">
                    <div className="flex items-start justify-between mb-2">
                        <h4 className="text-sm font-bold text-teal-700 dark:text-teal-400 flex items-center">
                            <Shield className="w-4 h-4 mr-1.5" />
                            Safety-Aware Route
                        </h4>
                        <button onClick={() => setRoutePath(null)}><X className="w-4 h-4 text-gray-400" /></button>
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-300 space-y-2">
                        {routeExplanation.map((line: string, i: number) => (
                            <p key={i}>{line}</p>
                        ))}
                        <div className="mt-3 pt-2 border-t border-gray-100 flex items-center text-[10px] text-gray-400">
                            ⚠️ Advisory only. Not a safety guarantee.
                        </div>
                    </div>
                </div>
            )}

            <Map
                {...viewState}
                onMove={evt => {
                    setViewState(evt.viewState);
                    if (evt.target) {
                        setMapBounds(evt.target.getBounds().toArray().flat());
                    }
                }}
                onLoad={onMapLoad}
                style={{ width: "100%", height: "100%" }}
                mapStyle={mapStyle}
                mapboxAccessToken={MAPBOX_TOKEN}
                onClick={handleClick}
                onMouseMove={onHover}
                interactiveLayerIds={['heatmap-layer']}
            >
                <NavigationControl position="bottom-right" />

                {/* Normal Marker */}
                {!isRouting && marker && (
                    <Marker latitude={marker.lat} longitude={marker.lng} anchor="bottom">
                        <div className="relative flex items-center justify-center group">
                            <div className="absolute w-12 h-12 bg-white/30 rounded-full animate-pulse blur-sm"></div>
                            <div className="absolute w-8 h-8 bg-white rounded-full shadow-lg opacity-80"></div>
                            <MapPin className="relative z-10 text-rose-700 w-8 h-8 fill-rose-700/20 drop-shadow-md" />
                        </div>
                    </Marker>
                )}

                {/* Routing Markers */}
                {isRouting && startLoc && (
                    <Marker latitude={startLoc.lat} longitude={startLoc.lng} anchor="bottom">
                        <div className="w-4 h-4 bg-green-500 rounded-full border-2 border-white shadow-md animate-bounce"></div>
                    </Marker>
                )}
                {isRouting && endLoc && (
                    <Marker latitude={endLoc.lat} longitude={endLoc.lng} anchor="bottom">
                        <div className="relative">
                            <MapPin className="text-red-600 w-8 h-8 fill-red-100 drop-shadow-md" />
                        </div>
                    </Marker>
                )}

                {/* Route Layer */}
                {routePath && (
                    <Source id="route-source" type="geojson" data={routePath}>
                        <Layer
                            id="route-layer"
                            type="line"
                            layout={{
                                "line-join": "round",
                                "line-cap": "round"
                            }}
                            paint={{
                                "line-color": "#0d9488", // Teal 600
                                "line-width": 4,
                                "line-opacity": 0.9,
                                "line-dasharray": [1, 0] // Solid
                            }}
                        />
                        {/* Casing for visibility */}
                        <Layer
                            id="route-casing"
                            type="line"
                            beforeId="route-layer"
                            layout={{
                                "line-join": "round",
                                "line-cap": "round"
                            }}
                            paint={{
                                "line-color": "#ffffff",
                                "line-width": 6,
                                "line-opacity": 0.5
                            }}
                        />
                    </Source>
                )}

                {/* Clustered Alert Markers */}
                {clusters.map((cluster: any) => {
                    const [longitude, latitude] = cluster.geometry.coordinates;
                    const { cluster: isCluster, point_count: pointCount } = cluster.properties;

                    if (isCluster) {
                        return (
                            <Marker
                                key={`cluster-${cluster.id}`}
                                latitude={latitude}
                                longitude={longitude}
                            >
                                <div
                                    className="rounded-full bg-slate-800/80 text-white flex items-center justify-center shadow-lg border-2 border-slate-600 backdrop-blur-sm transition-all hover:scale-110"
                                    style={{
                                        width: `${25 + (pointCount / points.length) * 20}px`,
                                        height: `${25 + (pointCount / points.length) * 20}px`
                                    }}
                                    onClick={() => {
                                        const expansionZoom = Math.min(
                                            supercluster?.getClusterExpansionZoom(cluster.id as number) ?? 20,
                                            20
                                        );
                                        setViewState({
                                            ...viewState,
                                            latitude,
                                            longitude,
                                            zoom: expansionZoom,
                                            // @ts-ignore
                                            transitionDuration: 500
                                        });
                                    }}
                                >
                                    <span className="text-xs font-semibold">{pointCount}</span>
                                </div>
                            </Marker>
                        );
                    }

                    // Individual Alert Marker
                    const props = cluster.properties;
                    const Icon = getAlertIcon(props.category);
                    const isHighRisk = props.severity > 70;

                    return (
                        <Marker
                            key={`alert-${props.alertId}`}
                            longitude={longitude}
                            latitude={latitude}
                            anchor="bottom"
                        >
                            <div
                                className={`relative group cursor-pointer transition-transform hover:scale-110 z-20`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onLocationSelect(latitude, longitude);
                                    if (!isRouting) setMarker({ lat: latitude, lng: longitude });
                                }}
                            >
                                <div className={`w-8 h-8 rounded-full shadow-md flex items-center justify-center border-2 border-white ${isHighRisk ? 'bg-red-500 text-white' : 'bg-white text-indigo-600'}`}>
                                    <Icon className="w-4 h-4" />
                                </div>
                                {isHighRisk && <div className="absolute inset-0 rounded-full animate-ping bg-red-400 opacity-30"></div>}
                            </div>
                        </Marker>
                    );
                })}


                <Source
                    id="heatmap"
                    type="geojson"
                    data={`${process.env.NEXT_PUBLIC_API_URL}/safety/heatmap/`}
                >
                    <Layer
                        id="heatmap-layer"
                        type="fill"
                        paint={{
                            "fill-color": [
                                "interpolate",
                                ["linear"],
                                ["get", "score"],
                                0, "rgba(190, 18, 60, 0.35)",
                                50, "rgba(217, 119, 6, 0.3)",
                                100, "rgba(21, 128, 61, 0.25)"
                            ],
                            // Zoom-dependent opacity: faded at low zoom, distinct at high zoom
                            "fill-opacity": [
                                "interpolate",
                                ["linear"],
                                ["zoom"],
                                5, 0.2, // Country level: very faint
                                10, 0.5, // Metro level: visible
                                14, 0.7  // Street level: clear
                            ],
                            "fill-outline-color": "rgba(255,255,255,0.05)"
                        }}
                    />
                </Source>

                {hoverInfo && (
                    <div className="absolute z-10 pointers-events-none bg-white/90 backdrop-blur px-3 py-2 rounded shadow-lg border border-gray-100 text-xs text-gray-700 transform -translate-x-1/2 -translate-y-[120%]" style={{ left: hoverInfo.x, top: hoverInfo.y }}>
                        <strong>Aggregated Risk Context</strong>
                        <div className="text-[10px] text-gray-500 mt-0.5 max-w-[150px] leading-tight">
                            Combined historical, alert, and environmental signals.
                            <br />NOT live incident points.
                        </div>
                    </div>
                )}
            </Map>

            {/* Legend - Responsive & Updated Text */}
            <div className="absolute bottom-6 right-6 md:bottom-8 md:right-8 bg-white/95 dark:bg-gray-900/95 backdrop-blur p-4 rounded-lg shadow-sm border border-gray-100 dark:border-gray-800 w-[280px] transition-opacity duration-300 hidden sm:block">
                <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-2">Aggregated Context</h4>
                <div className="space-y-2">
                    <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                        <div className="w-3 h-3 rounded-full bg-green-700/30 mr-2"></div>
                        <span>Safe Context</span>
                    </div>
                    <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                        <div className="w-3 h-3 rounded-full bg-amber-600/40 mr-2"></div>
                        <span>Moderate Context</span>
                    </div>
                    <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                        <div className="w-3 h-3 rounded-full bg-red-700/50 mr-2"></div>
                        <span>Elevated Risk Context</span>
                    </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 text-[10px] text-gray-400 dark:text-gray-500 leading-tight">
                    Hex colors represent <strong>aggregated historical and environmental context</strong>. Only specific red pins or pulses indicate active high-priority alerts.
                </div>
            </div>

            <div className="absolute bottom-20 right-4 sm:hidden bg-white/90 dark:bg-gray-900/90 backdrop-blur p-2 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 text-[10px]">
                <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-red-700/50"></div>
                    <span className="text-gray-500">Elevated</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-600/40"></div>
                    <span className="text-gray-500">Moderate</span>
                </div>
            </div>

        </div>
    );
}
