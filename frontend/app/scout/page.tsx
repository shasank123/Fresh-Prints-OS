"use client";
import { useState, useEffect } from "react";
import AgentTerminal from "@/components/AgentTerminal";
import { Play, Search, X, Check, RefreshCw, Mail, Database, TrendingUp, Building2 } from "lucide-react";
import axios from "axios";

interface PendingDraft {
    status: string;
    pending_draft?: string;
    strategy?: string;
    sentiment?: string;
    lead_score?: number;
}

export default function ScoutPage() {
    const [activeLeadId, setActiveLeadId] = useState<number | null>(null);
    const [leadTitle, setLeadTitle] = useState("MIT Robotics Team Wins National Championship");
    const [isRunning, setIsRunning] = useState(false);
    const [pendingDraft, setPendingDraft] = useState<PendingDraft | null>(null);
    const [isApproved, setIsApproved] = useState(false);
    const [approvedData, setApprovedData] = useState<PendingDraft | null>(null);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectionFeedback, setRejectionFeedback] = useState("");

    // Trigger the Scout Agent with custom lead title
    const triggerScout = async () => {
        if (!leadTitle.trim()) {
            alert("Please enter a lead/event title");
            return;
        }

        // Reset state for new analysis - allows running multiple without refresh
        setActiveLeadId(null);
        setPendingDraft(null);
        setApprovedData(null);
        setIsApproved(false);
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

    // Poll for pending draft approval
    useEffect(() => {
        if (!activeLeadId || isApproved) return;

        const checkPending = async () => {
            try {
                const res = await axios.get(`http://localhost:8000/lead-pending-draft/${activeLeadId}`);
                if (res.data.status === "waiting_for_approval") {
                    setPendingDraft(res.data);
                }
            } catch (e) {
                console.error("Poll error", e);
            }
        };

        const interval = setInterval(checkPending, 3000);
        return () => clearInterval(interval);
    }, [activeLeadId, isApproved]);

    // Approve draft
    const handleApprove = async () => {
        if (!activeLeadId) return;
        try {
            await axios.post(`http://localhost:8000/approve-lead/${activeLeadId}`);
            setApprovedData(pendingDraft);
            setPendingDraft(null);
            setIsApproved(true);
        } catch (e) {
            alert("Error approving draft");
        }
    };

    // Reject draft with feedback
    const handleReject = async () => {
        if (!activeLeadId || !rejectionFeedback.trim()) return;
        try {
            await axios.post(`http://localhost:8000/reject-lead/${activeLeadId}`, {
                feedback: rejectionFeedback
            });
            setPendingDraft(null);
            setShowRejectModal(false);
            setRejectionFeedback("");
        } catch (e) {
            alert("Error sending feedback");
        }
    };

    // Sample leads for quick selection
    const sampleLeads = [
        { title: "MIT Robotics Team Wins National Championship", emoji: "🤖" },
        { title: "Stanford Debate Club Regional Victory", emoji: "🎤" },
        { title: "UCLA Soccer Club Annual Fundraiser", emoji: "⚽" },
        { title: "Harvard Business Club Spring Conference", emoji: "💼" },
    ];

    // Get first letter of lead title for the avatar
    const getInitial = () => {
        const words = leadTitle.trim().split(' ');
        return words[0]?.[0]?.toUpperCase() || '?';
    };

    // Get sentiment color and emoji
    const getSentimentDisplay = (sentiment: string) => {
        switch (sentiment?.toUpperCase()) {
            case 'POSITIVE':
                return { color: 'text-green-400', bg: 'bg-green-500/20', emoji: '🟢' };
            case 'NEGATIVE':
                return { color: 'text-red-400', bg: 'bg-red-500/20', emoji: '🔴' };
            default:
                return { color: 'text-yellow-400', bg: 'bg-yellow-500/20', emoji: '🟡' };
        }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Sales Scout Agent</h1>
                    <p className="text-fp-slate mt-1">Autonomous Lead Research • Sentiment Analysis • Personalized Outreach</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                    <Building2 size={14} className="text-fp-gold" />
                    <span className="text-fp-gold">7 Intelligence Tools Active</span>
                </div>
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
                    💡 The agent will search news, analyze sentiment, check social presence, scope competitors, and draft a personalized email.
                </p>

                {/* Quick Lead Selection */}
                <div className="flex flex-wrap gap-2 mt-4">
                    {sampleLeads.map((lead) => (
                        <button
                            key={lead.title}
                            onClick={() => setLeadTitle(lead.title)}
                            className={`px-3 py-1.5 text-xs rounded-full border transition-all ${leadTitle === lead.title
                                ? 'bg-fp-gold/20 border-fp-gold text-fp-gold'
                                : 'border-white/10 text-fp-slate hover:border-white/30'
                                }`}
                        >
                            {lead.emoji} {lead.title}
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left Col: Status Cards + Email Preview */}
                <div className="space-y-6">
                    {/* Live Target Card */}
                    <div className="bg-fp-lightNavy p-6 rounded-xl border border-white/5">
                        <h3 className="text-fp-slate text-sm font-medium uppercase tracking-wider mb-4">Live Target</h3>
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-full bg-fp-gold/20 flex items-center justify-center text-fp-gold font-bold text-xl">
                                {getInitial()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-white font-bold truncate">{leadTitle || 'No target set'}</div>
                                <div className={`text-xs flex items-center gap-1 ${activeLeadId ? 'text-green-400' : 'text-fp-slate'}`}>
                                    ● {activeLeadId ? (pendingDraft ? 'Awaiting Approval' : (isApproved ? 'Saved to CRM' : 'Agent Active')) : 'Waiting for trigger'}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Agent Stats Card */}
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

                    {/* Email Preview Card (when pending or approved) */}
                    {(pendingDraft || approvedData) && (
                        <div className="bg-fp-lightNavy p-6 rounded-xl border border-white/5">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-fp-slate text-sm font-medium uppercase tracking-wider">
                                    {approvedData && !pendingDraft ? "✅ Saved Email" : "📧 Email Preview"}
                                </h3>
                                {(pendingDraft?.lead_score || approvedData?.lead_score) && (
                                    <div className="flex items-center gap-2">
                                        <TrendingUp size={14} className="text-fp-gold" />
                                        <span className="text-fp-gold text-sm font-bold">
                                            Score: {pendingDraft?.lead_score || approvedData?.lead_score}/100
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Sentiment Badge */}
                            {(pendingDraft?.sentiment || approvedData?.sentiment) && (
                                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold mb-4 ${getSentimentDisplay(pendingDraft?.sentiment || approvedData?.sentiment || '').bg}`}>
                                    <span>{getSentimentDisplay(pendingDraft?.sentiment || approvedData?.sentiment || '').emoji}</span>
                                    <span className={getSentimentDisplay(pendingDraft?.sentiment || approvedData?.sentiment || '').color}>
                                        {pendingDraft?.sentiment || approvedData?.sentiment} NEWS
                                    </span>
                                </div>
                            )}

                            {/* Visual Email Card */}
                            <div className="bg-white rounded-lg shadow-lg overflow-hidden text-black">
                                <div className="bg-gradient-to-r from-fp-navy to-fp-lightNavy p-3 flex items-center gap-3">
                                    <div className="h-8 w-8 bg-fp-gold rounded flex items-center justify-center text-fp-navy font-bold text-xs">FP</div>
                                    <div>
                                        <div className="text-white text-sm font-bold">Fresh Prints Sales Team</div>
                                        <div className="text-fp-slate text-xs">sales@freshprints.com</div>
                                    </div>
                                </div>
                                <div className="p-4 text-sm max-h-48 overflow-y-auto">
                                    <pre className="whitespace-pre-wrap font-sans text-gray-700 text-xs leading-relaxed">
                                        {pendingDraft?.pending_draft || approvedData?.pending_draft}
                                    </pre>
                                </div>
                            </div>

                            {/* Strategy Summary */}
                            {(pendingDraft?.strategy || approvedData?.strategy) && (
                                <div className="mt-4 p-3 bg-black/30 rounded-lg">
                                    <span className="text-xs text-fp-gold font-bold">STRATEGY</span>
                                    <p className="text-gray-300 text-xs mt-1">{pendingDraft?.strategy || approvedData?.strategy}</p>
                                </div>
                            )}

                            {/* Approval Actions */}
                            {pendingDraft?.status === "waiting_for_approval" && (
                                <div className="flex gap-3 mt-4">
                                    <button
                                        onClick={() => setShowRejectModal(true)}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-all border border-red-500/30"
                                    >
                                        <X size={16} />
                                        Reject
                                    </button>
                                    <button
                                        onClick={handleApprove}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 text-white hover:bg-green-600 font-bold rounded-lg transition-all"
                                    >
                                        <Check size={16} />
                                        Approve
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* CRM Save Visualization (after approval) */}
                    {isApproved && approvedData && (
                        <div className="bg-green-900/30 border border-green-500/50 rounded-xl p-4">
                            <div className="flex items-center gap-2 text-green-400 mb-3">
                                <Database size={18} />
                                <span className="font-bold">Saved to CRM</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <span className="text-gray-400 text-xs">Lead ID</span>
                                    <div className="text-white font-mono">{activeLeadId}</div>
                                </div>
                                <div>
                                    <span className="text-gray-400 text-xs">Status</span>
                                    <div className="text-green-400 font-bold">DRAFTED</div>
                                </div>
                                <div>
                                    <span className="text-gray-400 text-xs">Sentiment</span>
                                    <div className="text-white">{approvedData.sentiment}</div>
                                </div>
                                <div>
                                    <span className="text-gray-400 text-xs">Lead Score</span>
                                    <div className="text-fp-gold font-bold">{approvedData.lead_score}/100</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Col: The Terminal (Spans 2 cols) */}
                <div className="lg:col-span-2 space-y-4">
                    <h3 className="text-fp-slate text-sm font-medium uppercase tracking-wider">Real-Time Reasoning Engine</h3>
                    <AgentTerminal leadId={activeLeadId} />
                </div>

            </div>

            {/* Rejection Feedback Modal */}
            {showRejectModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-fp-lightNavy border border-red-500/50 rounded-xl max-w-lg w-full p-6 space-y-4 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-red-500/20 rounded-lg">
                                <RefreshCw size={20} className="text-red-400" />
                            </div>
                            <div>
                                <h3 className="text-white font-bold">Request Changes</h3>
                                <p className="text-fp-slate text-sm">Tell the AI what to improve in the email</p>
                            </div>
                        </div>

                        <textarea
                            value={rejectionFeedback}
                            onChange={(e) => setRejectionFeedback(e.target.value)}
                            placeholder="e.g. Make it more casual, add a specific reference to their championship, try a congratulatory tone instead..."
                            className="w-full h-32 bg-black/30 border border-white/10 rounded-lg p-4 text-white placeholder-fp-slate/50 focus:outline-none focus:border-red-500"
                        />

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowRejectModal(false)}
                                className="flex-1 px-4 py-2 text-fp-slate hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleReject}
                                disabled={!rejectionFeedback.trim()}
                                className="flex-1 px-4 py-2 bg-red-500 text-white font-bold rounded-lg hover:bg-red-600 transition-all disabled:opacity-50"
                            >
                                Send Feedback & Regenerate
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}