"use client";

import * as React from "react";
import Map, { Marker, NavigationControl, ViewState } from "react-map-gl/mapbox";
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

    const handleClick = (event: mapboxgl.MapLayerMouseEvent) => {
        const { lat, lng } = event.lngLat;
        setMarker({ lat, lng });
        onLocationSelect(lat, lng);
    };

    if (!MAPBOX_TOKEN) {
        return (
            <div className="flex items-center justify-center h-full bg-gray-100 text-gray-500">
                Mapbox Token Missing
            </div>
        );
    }

    return (
        <Map
            {...viewState}
            onMove={evt => setViewState(evt.viewState)}
            style={{ width: "100%", height: "100%" }}
            mapStyle="mapbox://styles/mapbox/light-v11" // Calm, serious style
            mapboxAccessToken={MAPBOX_TOKEN}
            onClick={handleClick}
        >
            <NavigationControl position="top-left" />

            {marker && (
                <Marker latitude={marker.lat} longitude={marker.lng} anchor="bottom">
                    <MapPin className="text-red-600 w-8 h-8 fill-red-600/20" />
                </Marker>
            )}
        </Map>
    );
}
