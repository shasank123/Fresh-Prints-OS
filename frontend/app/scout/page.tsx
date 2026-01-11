"use client";
import { useState } from "react";
import AgentTerminal from "@/components/AgentTerminal";
import ApprovalModal from "@/components/ApprovalModal";
import { Play, Search } from "lucide-react";
import axios from "axios";

export default function ScoutPage() {
    const [activeLeadId, setActiveLeadId] = useState<number | null>(null);
    const [leadTitle, setLeadTitle] = useState("MIT Robotics Team Wins National Championship");
    const [isRunning, setIsRunning] = useState(false);

    // Trigger the Scout Agent with custom lead title
    const triggerScout = async () => {
        if (!leadTitle.trim()) {
            alert("Please enter a lead/event title");
            return;
        }

        // Reset state for new analysis - allows running multiple without refresh
        setActiveLeadId(null);
        setIsRunning(true);

        try {
            const res = await axios.post("http://localhost:8000/run-scout", {
                lead_id: Date.now(),
                title: leadTitle.trim()
            });
            setActiveLeadId(res.data.lead_id);
        } catch (e) {
            alert("Ensure Backend is running on Port 8000!");
            setIsRunning(false);
        }
    };

    // Get first letter of lead title for the avatar
    const getInitial = () => {
        const words = leadTitle.trim().split(' ');
        return words[0]?.[0]?.toUpperCase() || '?';
    };

    return (
        <div className="space-y-8 max-w-6xl mx-auto">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-white tracking-tight">Sales Scout Agent</h1>
                <p className="text-fp-slate mt-2">Autonomous Lead Generation & Outreach</p>
            </div>

            {/* Lead Input Section */}
            <div className="bg-fp-lightNavy p-6 rounded-xl border border-white/5">
                <h3 className="text-fp-slate text-sm font-medium uppercase tracking-wider mb-4">Target Lead / Event</h3>
                <div className="flex gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-fp-slate" size={18} />
                        <input
                            type="text"
                            value={leadTitle}
                            onChange={(e) => setLeadTitle(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && triggerScout()}
                            placeholder="e.g. Stanford Debate Team wins championship, UCLA Soccer Club fundraiser..."
                            className="w-full bg-black/30 border border-white/10 rounded-lg py-3 pl-12 pr-4 text-white placeholder-fp-slate/50 focus:outline-none focus:border-fp-gold transition-colors"
                        />
                    </div>
                    <button
                        onClick={triggerScout}
                        className="flex items-center gap-2 px-6 py-3 bg-fp-gold hover:bg-fp-gold/90 text-fp-navy font-bold rounded-lg shadow-lg shadow-fp-gold/20 transition-all"
                    >
                        <Play size={18} fill="currentColor" />
                        Run Scout
                    </button>
                </div>
                <p className="text-fp-slate/70 text-xs mt-3">
                    💡 Tip: Enter any university club, sports team, or organization event. The agent will research and draft a personalized outreach email.
                </p>
            </div>

            {/* Grid Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Left Col: Status Cards */}
                <div className="space-y-6">
                    <div className="bg-fp-lightNavy p-6 rounded-xl border border-white/5">
                        <h3 className="text-fp-slate text-sm font-medium uppercase tracking-wider mb-4">Live Target</h3>
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-full bg-fp-gold/20 flex items-center justify-center text-fp-gold font-bold text-xl">
                                {getInitial()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-white font-bold truncate">{leadTitle || 'No target set'}</div>
                                <div className={`text-xs flex items-center gap-1 ${activeLeadId ? 'text-green-400' : 'text-fp-slate'}`}>
                                    ● {activeLeadId ? 'Agent Active' : 'Waiting for trigger'}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-fp-lightNavy p-6 rounded-xl border border-white/5">
                        <h3 className="text-fp-slate text-sm font-medium uppercase tracking-wider mb-4">Agent Stats</h3>
                        <div className="space-y-4">
                            <div className="flex justify-between text-sm">
                                <span className="text-fp-slate">Emails Drafted</span>
                                <span className="text-white font-mono">1,240</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-fp-slate">Reply Rate</span>
                                <span className="text-green-400 font-mono">24.8%</span>
                            </div>
                            <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden">
                                <div className="bg-fp-gold w-3/4 h-full"></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Col: The Terminal (Spans 2 cols) */}
                <div className="lg:col-span-2 space-y-4">
                    <h3 className="text-fp-slate text-sm font-medium uppercase tracking-wider">Real-Time Reasoning Engine</h3>
                    <AgentTerminal leadId={activeLeadId} />
                </div>

            </div>

            {/* The HITL Modal (Hidden until triggered) */}
            <ApprovalModal leadId={activeLeadId} />
        </div>
    );
}