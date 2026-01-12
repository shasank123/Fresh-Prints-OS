"use client";
import { useEffect, useState } from "react";
import axios from "axios";
import { TrendingUp, Truck, Clock, Loader2, Leaf } from "lucide-react";

interface Rate {
    carrier: string;
    service: string;
    price: number;
    days: number | string;
    carrier_logo: string;
}

interface RatesData {
    source: "LIVE_API" | "SIMULATED";
    rates: Rate[];
}

interface CarbonData {
    carbon_kg: number;
    distance_km: number;
    shipping_mode: string;
    trees_to_offset: number;
    eco_rating: string;
}

interface Props {
    originZip: string;
    destZip: string;
    weightLbs: number;
}

export default function RateComparison({ originZip, destZip, weightLbs }: Props) {
    const [rates, setRates] = useState<RatesData | null>(null);
    const [carbon, setCarbon] = useState<CarbonData | null>(null);
    const [loading, setLoading] = useState(false);
    const [selectedRate, setSelectedRate] = useState<number | null>(null);

    useEffect(() => {
        if (!originZip || !destZip || originZip.length < 5 || destZip.length < 5 || weightLbs <= 0) {
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch rates and carbon in parallel
                const [ratesRes, carbonRes] = await Promise.all([
                    axios.post("http://localhost:8000/logistics-rates", {
                        origin_zip: originZip,
                        dest_zip: destZip,
                        weight_lbs: weightLbs
                    }),
                    axios.post("http://localhost:8000/logistics-carbon", {
                        origin_zip: originZip,
                        dest_zip: destZip,
                        weight_lbs: weightLbs,
                        shipping_mode: "ground"
                    })
                ]);
                setRates(ratesRes.data);
                setCarbon(carbonRes.data);
            } catch (e) {
                console.error("Rates fetch error:", e);
            } finally {
                setLoading(false);
            }
        };

        const debounce = setTimeout(fetchData, 800);
        return () => clearTimeout(debounce);
    }, [originZip, destZip, weightLbs]);

    if (loading) {
        return (
            <div className="bg-fp-lightNavy rounded-xl border border-white/5 p-6">
                <div className="flex items-center justify-center gap-2 text-fp-slate">
                    <Loader2 className="animate-spin" size={20} />
                    Fetching carrier rates...
                </div>
            </div>
        );
    }

    if (!rates || rates.rates.length === 0) {
        return (
            <div className="bg-fp-lightNavy rounded-xl border border-white/5 p-6">
                <h3 className="text-fp-slate text-sm font-medium uppercase tracking-wider mb-4 flex items-center gap-2">
                    <TrendingUp size={16} className="text-blue-400" />
                    Carrier Comparison
                </h3>
                <div className="text-center text-fp-slate py-8 border border-dashed border-fp-slate/30 rounded-lg">
                    Enter valid ZIP codes to compare rates
                </div>
            </div>
        );
    }

    // Find cheapest and fastest
    const cheapest = rates.rates.reduce((a, b) => a.price < b.price ? a : b);
    const fastest = rates.rates.reduce((a, b) => {
        const daysA = typeof a.days === "number" ? a.days : 99;
        const daysB = typeof b.days === "number" ? b.days : 99;
        return daysA < daysB ? a : b;
    });

    return (
        <div className="space-y-4">
            {/* Carbon Footprint Badge */}
            {carbon && (
                <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-xl border border-green-500/30 p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-green-500/20 rounded-lg">
                                <Leaf size={20} className="text-green-400" />
                            </div>
                            <div>
                                <div className="text-xs text-green-400 font-medium uppercase tracking-wider">Carbon Footprint</div>
                                <div className="text-white font-bold text-lg">{carbon.carbon_kg} kg CO₂</div>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-2xl">{carbon.eco_rating.split(" ")[0]}</div>
                            <div className="text-xs text-fp-slate">{carbon.distance_km} km via {carbon.shipping_mode}</div>
                        </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-green-500/20 text-xs text-green-300">
                        🌳 Offset with {carbon.trees_to_offset} trees planted/year
                    </div>
                </div>
            )}

            {/* Rates Table */}
            <div className="bg-fp-lightNavy rounded-xl border border-white/5 overflow-hidden">
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                    <h3 className="text-fp-slate text-sm font-medium uppercase tracking-wider flex items-center gap-2">
                        <TrendingUp size={16} className="text-blue-400" />
                        Carrier Comparison
                    </h3>
                    <div className={`text-xs px-2 py-1 rounded-full ${rates.source === "LIVE_API" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                        {rates.source === "LIVE_API" ? "● Live API" : "◐ Simulated"}
                    </div>
                </div>

                <div className="divide-y divide-white/5">
                    {rates.rates.map((rate, i) => {
                        const isCheapest = rate.carrier === cheapest.carrier && rate.service === cheapest.service;
                        const isFastest = rate.carrier === fastest.carrier && rate.service === fastest.service && !isCheapest;

                        return (
                            <div
                                key={i}
                                onClick={() => setSelectedRate(i)}
                                className={`p-4 flex items-center justify-between cursor-pointer transition-all hover:bg-white/5 ${selectedRate === i ? "bg-blue-500/10 border-l-2 border-blue-500" : ""}`}
                            >
                                <div className="flex items-center gap-4">
                                    <div className="text-2xl">{rate.carrier_logo}</div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-white font-medium">{rate.carrier}</span>
                                            {isCheapest && (
                                                <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">CHEAPEST</span>
                                            )}
                                            {isFastest && (
                                                <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">FASTEST</span>
                                            )}
                                        </div>
                                        <div className="text-sm text-fp-slate">{rate.service}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-1 text-fp-slate">
                                        <Clock size={14} />
                                        <span className="text-white font-mono">{rate.days}</span>
                                        <span className="text-xs">days</span>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xl font-bold text-green-400 font-mono">
                                            ${rate.price.toFixed(2)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Savings Summary */}
                <div className="p-4 bg-black/30 flex items-center justify-between text-sm">
                    <span className="text-fp-slate">Potential savings vs highest rate:</span>
                    <span className="text-green-400 font-bold font-mono">
                        ${(rates.rates[rates.rates.length - 1].price - cheapest.price).toFixed(2)}
                    </span>
                </div>
            </div>
        </div>
    );
}
