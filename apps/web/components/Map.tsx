"use client";

import * as React from "react";
import Map, { Marker, NavigationControl, ViewState, Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { MapPin } from "lucide-react";

interface MapComponentProps {
    onLocationSelect: (lat: number, lng: number) => void;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export default function MapComponent({ onLocationSelect }: MapComponentProps) {
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

    const handleClick = (event: mapboxgl.MapLayerMouseEvent) => {
        const { lat, lng } = event.lngLat;
        setMarker({ lat, lng });
        onLocationSelect(lat, lng);
    };

    const onHover = React.useCallback((event: mapboxgl.MapLayerMouseEvent) => {
        const {
            features,
            point: { x, y }
        } = event;

        const hoveredFeature = features && features[0];

        // Ensure we only show tooltip for the heatmap layer
        if (hoveredFeature && hoveredFeature.layer.id === 'heatmap-layer' && hoveredFeature.properties) {
            setHoverInfo({
                score: hoveredFeature.properties.score,
                x,
                y
            });
        } else {
            setHoverInfo(null);
        }
    }, []);

    if (!MAPBOX_TOKEN) {
        return (
            <div className="flex items-center justify-center h-full bg-gray-100 text-gray-500">
                Mapbox Token Missing
            </div>
        );
    }

    return (
        <div className="relative w-full h-full">
            <Map
                {...viewState}
                onMove={evt => setViewState(evt.viewState)}
                style={{ width: "100%", height: "100%" }}
                mapStyle="mapbox://styles/mapbox/light-v11"
                mapboxAccessToken={MAPBOX_TOKEN}
                onClick={handleClick}
                onMouseMove={onHover}
                interactiveLayerIds={['heatmap-layer']}
            >
                <NavigationControl position="top-left" />

                {marker && (
                    <Marker latitude={marker.lat} longitude={marker.lng} anchor="bottom">
                        <div className="relative flex items-center justify-center group">
                            {/* Halo for visibility (Step 5/24) */}
                            <div className="absolute w-12 h-12 bg-white/30 rounded-full animate-pulse blur-sm"></div>
                            <div className="absolute w-8 h-8 bg-white rounded-full shadow-lg opacity-80"></div>
                            <MapPin className="relative z-10 text-rose-700 w-8 h-8 fill-rose-700/20 drop-shadow-md" />
                        </div>
                    </Marker>
                )}

                <Source
                    id="alerts"
                    type="geojson"
                    data={`${process.env.NEXT_PUBLIC_API_URL}/safety/alerts/`}
                >
                    <Layer
                        id="alerts-layer"
                        type="circle"
                        paint={{
                            "circle-radius": 8,
                            "circle-color": "#e11d48", // rose-600
                            "circle-stroke-width": 2,
                            "circle-stroke-color": "#ffffff",
                        }}
                    />
                </Source>

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
                                // Step 6/25: Normalized Saturation/Opacity
                                // Using a consistent opacity to avoid "fear gaps"
                                // Muted Earthy Tones.
                                0, "rgba(190, 18, 60, 0.35)",     // Rose-800 equivalent, muted. (Elevated Risk)
                                50, "rgba(217, 119, 6, 0.3)",   // Amber-600 (Moderate)
                                100, "rgba(21, 128, 61, 0.25)"   // Emerald-700 (Safe)
                            ],
                            "fill-outline-color": "rgba(255,255,255,0.1)" // Very subtle outline for definition
                        }}
                    />
                </Source>

                {hoverInfo && (
                    <div className="absolute z-10 pointers-events-none bg-white/90 backdrop-blur px-3 py-2 rounded shadow-lg border border-gray-100 text-xs text-gray-700 transform -translate-x-1/2 -translate-y-[120%]" style={{ left: hoverInfo.x, top: hoverInfo.y }}>
                        <strong>Aggregated Risk Context</strong>
                        <div className="text-[10px] text-gray-500 mt-0.5 max-w-[150px] leading-tight">
                            Combined historical, alert, and environmental signals.
                            <br />NOT live incidents.
                        </div>
                    </div>
                )}
            </Map>

            {/* Legend - Step 1/2 */}
            <div className="absolute bottom-6 right-6 bg-white/95 backdrop-blur p-4 rounded-lg shadow-sm border border-gray-100 max-w-xs transition-opacity duration-300">
                <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Aggregated Context</h4>
                <div className="space-y-2">
                    <div className="flex items-center text-xs text-gray-500">
                        <div className="w-3 h-3 rounded-full bg-green-700/30 mr-2"></div>
                        <span>Safe Context</span>
                    </div>
                    <div className="flex items-center text-xs text-gray-500">
                        <div className="w-3 h-3 rounded-full bg-amber-600/40 mr-2"></div>
                        <span>Moderate Context</span>
                    </div>
                    <div className="flex items-center text-xs text-gray-500">
                        <div className="w-3 h-3 rounded-full bg-red-700/50 mr-2"></div>
                        <span>Elevated Risk Context</span>
                    </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 text-[10px] text-gray-400 leading-tight">
                    Hex colors represent <strong>historical & environmental factors</strong>. Only specific red pins or pulses indicate active high-priority alerts.
                </div>
            </div>
        </div>
    );
}
