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


      </div>

      {/* Sidebar - Right Side */}
      <div className="z-20 h-full relative shadow-2xl">
        <Sidebar lat={selectedLocation?.lat ?? null} lng={selectedLocation?.lng ?? null} />
      </div>
    </main>
  );
}
