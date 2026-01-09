"use client";

import { useState } from "react";
import MapComponent from "../components/Map";
import Sidebar from "../components/Sidebar";

export default function Home() {
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-gray-50 text-gray-900 font-sans">
      {/* Map Container - Full Screen */}
      <div className="flex-1 relative">
        <MapComponent
          onLocationSelect={(lat, lng) => setSelectedLocation({ lat, lng })}
        />

        {/* Search Bar Overlay - Top Left */}
        <div className="absolute top-4 left-4 z-10 w-80 shadow-lg">
          {/* Use Mapbox Geocoder UI or simple input. For now simple visual placeholder or Mapbox built-in control */}
          <div className="bg-white rounded-md border border-gray-200 p-3 flex items-center shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search address (Coming Soon)..."
              className="w-full bg-transparent outline-none text-sm text-gray-700 placeholder-gray-400"
              disabled
            />
          </div>
        </div>
      </div>

      {/* Sidebar - Right Side */}
      <div className="z-20 h-full relative shadow-2xl">
        <Sidebar lat={selectedLocation?.lat ?? null} lng={selectedLocation?.lng ?? null} />
      </div>
    </main>
  );
}
