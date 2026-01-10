import * as React from "react";
import { Search, X, MapPin } from "lucide-react";

interface GeocoderInputProps {
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    onSelect: (feature: any) => void;
    className?: string;
    icon?: React.ReactNode;
    mapBoxToken: string;
}

export function GeocoderInput({
    value,
    onChange,
    placeholder = "Search address...",
    onSelect,
    className = "",
    icon,
    mapBoxToken
}: GeocoderInputProps) {
    const [results, setResults] = React.useState<any[]>([]);
    const [isSearching, setIsSearching] = React.useState(false);
    const [showResults, setShowResults] = React.useState(false);

    // Debounce Fetch
    React.useEffect(() => {
        const timer = setTimeout(async () => {
            if (value.length > 2 && showResults) {
                setIsSearching(true);
                try {
                    const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(value)}.json?access_token=${mapBoxToken}&country=us&types=address,poi,place,district,locality`);
                    const data = await res.json();
                    setResults(data.features || []);
                } catch (err) {
                    console.error("Geocoding failed", err);
                } finally {
                    setIsSearching(false);
                }
            } else {
                setResults([]);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [value, mapBoxToken, showResults]);

    const handleSelect = (feature: any) => {
        onSelect(feature);
        setResults([]);
        setShowResults(false);
    };

    return (
        <div className={`relative ${className}`}>
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm flex items-center p-2 transition-colors">
                {icon || <Search className="w-4 h-4 text-gray-400 mr-2" />}
                <input
                    type="text"
                    value={value}
                    onChange={(e) => {
                        onChange(e.target.value);
                        setShowResults(true);
                    }}
                    onFocus={() => setShowResults(true)}
                    // onBlur={() => setTimeout(() => setShowResults(false), 200)} // Delay to allow click
                    placeholder={placeholder}
                    className="w-full bg-transparent outline-none text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400"
                />
                {value && (
                    <button onClick={() => { onChange(""); setResults([]); }}>
                        <X className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors" />
                    </button>
                )}
            </div>

            {/* Dropdown */}
            {showResults && results.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800 shadow-xl overflow-hidden max-h-60 overflow-y-auto z-50 animate-in fade-in slide-in-from-top-1">
                    {results.map((result) => (
                        <button
                            key={result.id}
                            onClick={() => handleSelect(result)}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-50 dark:border-gray-800 last:border-none duration-150"
                        >
                            <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{result.text}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{result.place_name}</div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
