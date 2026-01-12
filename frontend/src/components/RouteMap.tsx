"use client";
import { useEffect, useState } from "react";
import axios from "axios";
import { MapPin, Warehouse, Loader2 } from "lucide-react";

interface RouteData {
    customer: {
        city: string;
        zip: string;
        lat: number;
        lng: number;
    };
    warehouses: Array<{
        id: string;
        name: string;
        city: string;
        lat: number;
        lng: number;
        active: boolean;
    }>;
    routes: Array<{
        from: string;
        from_lat: number;
        from_lng: number;
        to_lat: number;
        to_lng: number;
        distance_miles: number;
        estimated_cost: number;
    }>;
}

export default function RouteMap({ customerZip }: { customerZip: string }) {
    const [routeData, setRouteData] = useState<RouteData | null>(null);
    const [loading, setLoading] = useState(false);
    const [MapComponent, setMapComponent] = useState<any>(null);

    // Dynamically import Leaflet (client-side only)
    useEffect(() => {
        if (typeof window !== "undefined") {
            import("react-leaflet").then((mod) => {
                setMapComponent(() => mod);
            });
            // Import leaflet CSS
            import("leaflet/dist/leaflet.css");
        }
    }, []);

    // Fetch route data when zip changes
    useEffect(() => {
        if (!customerZip || customerZip.length < 5) return;

        const fetchRouteData = async () => {
            setLoading(true);
            try {
                const res = await axios.post("http://localhost:8000/logistics-route-data", {
                    customer_zip: customerZip
                });
                setRouteData(res.data);
            } catch (e) {
                console.error("Route data error:", e);
            } finally {
                setLoading(false);
            }
        };

        const debounce = setTimeout(fetchRouteData, 500);
        return () => clearTimeout(debounce);
    }, [customerZip]);

    if (loading) {
        return (
            <div className="bg-fp-lightNavy rounded-xl border border-white/5 p-6 h-80 flex items-center justify-center">
                <Loader2 className="animate-spin text-fp-gold" size={24} />
                <span className="ml-2 text-fp-slate">Loading map...</span>
            </div>
        );
    }

    if (!routeData || !MapComponent) {
        return (
            <div className="bg-fp-lightNavy rounded-xl border border-white/5 p-6 h-80">
                <h3 className="text-fp-slate text-sm font-medium uppercase tracking-wider mb-4">Route Visualization</h3>
                <div className="h-64 flex items-center justify-center text-fp-slate border border-dashed border-fp-slate/30 rounded-lg">
                    Enter a ZIP code to see routes
                </div>
            </div>
        );
    }

    const { MapContainer, TileLayer, Marker, Popup, Polyline } = MapComponent;

    // Calculate center of map
    const centerLat = routeData.customer.lat;
    const centerLng = routeData.customer.lng;

    // Create custom icon data URLs (since we can't use Leaflet's default icons easily in Next.js)
    const warehouseIcon = typeof window !== "undefined" ?
        new (require("leaflet")).Icon({
            iconUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='%2322c55e' stroke='white' stroke-width='2'%3E%3Crect x='2' y='7' width='20' height='14' rx='2'/%3E%3Cpath d='M12 2L2 7h20L12 2z'/%3E%3C/svg%3E",
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        }) : null;

    const customerIcon = typeof window !== "undefined" ?
        new (require("leaflet")).Icon({
            iconUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='%23ef4444' stroke='white' stroke-width='2'%3E%3Cpath d='M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z'/%3E%3Ccircle cx='12' cy='9' r='2.5' fill='white'/%3E%3C/svg%3E",
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        }) : null;

    return (
        <div className="bg-fp-lightNavy rounded-xl border border-white/5 overflow-hidden">
            <div className="p-4 border-b border-white/10">
                <h3 className="text-fp-slate text-sm font-medium uppercase tracking-wider flex items-center gap-2">
                    <MapPin size={16} className="text-green-400" />
                    Route Visualization
                </h3>
            </div>

            <div className="h-80 relative">
                <MapContainer
                    center={[centerLat, centerLng]}
                    zoom={4}
                    style={{ height: "100%", width: "100%" }}
                    scrollWheelZoom={true}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    />

                    {/* Customer Marker */}
                    {customerIcon && (
                        <Marker position={[routeData.customer.lat, routeData.customer.lng]} icon={customerIcon}>
                            <Popup>
                                <div className="text-black font-bold">📍 Customer</div>
                                <div className="text-gray-600">{routeData.customer.city}</div>
                                <div className="text-gray-500 text-sm">ZIP: {routeData.customer.zip}</div>
                            </Popup>
                        </Marker>
                    )}

                    {/* Warehouse Markers */}
                    {warehouseIcon && routeData.warehouses.map((wh) => (
                        <Marker key={wh.id} position={[wh.lat, wh.lng]} icon={warehouseIcon}>
                            <Popup>
                                <div className="text-black font-bold">🏭 {wh.name}</div>
                                <div className="text-gray-600">{wh.city}</div>
                                <div className={`text-sm ${wh.active ? "text-green-600" : "text-gray-400"}`}>
                                    {wh.active ? "● Active" : "○ Inactive"}
                                </div>
                            </Popup>
                        </Marker>
                    ))}

                    {/* Route Lines */}
                    {routeData.routes.map((route, i) => (
                        <Polyline
                            key={i}
                            positions={[
                                [route.from_lat, route.from_lng],
                                [route.to_lat, route.to_lng]
                            ]}
                            pathOptions={{
                                color: "#22c55e",
                                weight: 3,
                                opacity: 0.8,
                                dashArray: "10, 5"
                            }}
                        />
                    ))}
                </MapContainer>
            </div>

            {/* Route Legend */}
            <div className="p-3 bg-black/30 flex flex-wrap gap-4 text-xs">
                {routeData.routes.map((route) => (
                    <div key={route.from} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                        <span className="text-fp-slate">{route.from}:</span>
                        <span className="text-white font-mono">{route.distance_miles} mi</span>
                        <span className="text-green-400">(~${route.estimated_cost})</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
