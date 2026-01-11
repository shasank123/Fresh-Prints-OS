"use client";
import { useState, useEffect } from "react";
import AgentTerminal from "@/components/AgentTerminal";
import { Palette, Play, X, Check, RefreshCw } from "lucide-react";
import axios from "axios";

interface PendingDesign {
  status: string;
  image_url?: string;
  cost_report?: string;
}

export default function DesignerPage() {
  const [activeLeadId, setActiveLeadId] = useState<number | null>(null);
  const [vibe, setVibe] = useState("Modern minimalist with university colors");
  const [pendingDesign, setPendingDesign] = useState<PendingDesign | null>(null);
  const [approvedDesign, setApprovedDesign] = useState<PendingDesign | null>(null);
  const [isApproved, setIsApproved] = useState(false);
  const [rejectionFeedback, setRejectionFeedback] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);

  // Trigger the Designer Agent
  const triggerDesigner = async () => {
    if (!vibe.trim()) {
      alert("Please enter a design vibe/style");
      return;
    }

    setActiveLeadId(null);
    setPendingDesign(null);
    setApprovedDesign(null);
    setIsApproved(false);

    try {
      const newLeadId = Date.now();
      await axios.post("http://localhost:8000/run-designer", {
        lead_id: newLeadId,
        vibe: vibe.trim()
      });
      setActiveLeadId(newLeadId);
    } catch (e) {
      alert("Ensure Backend is running on Port 8000!");
    }
  };

  // Poll for pending design approval
  useEffect(() => {
    if (!activeLeadId || isApproved) return;

    const checkPending = async () => {
      try {
        const res = await axios.get(`http://localhost:8000/design-pending-review/${activeLeadId}`);
        if (res.data.status === "waiting_for_approval") {
          setPendingDesign(res.data);
        }
      } catch (e) {
        console.error("Poll error", e);
      }
    };

    const interval = setInterval(checkPending, 3000);
    return () => clearInterval(interval);
  }, [activeLeadId, isApproved]);

  // Approve design
  const handleApprove = async () => {
    if (!activeLeadId) return;
    try {
      await axios.post(`http://localhost:8000/approve-design/${activeLeadId}`);
      // Save the design to approved state before clearing pending
      setApprovedDesign(pendingDesign);
      setPendingDesign(null);
      setIsApproved(true);
    } catch (e) {
      alert("Error approving design");
    }
  };

  // Reject design with feedback
  const handleReject = async () => {
    if (!activeLeadId || !rejectionFeedback.trim()) return;
    try {
      await axios.post(`http://localhost:8000/reject-design/${activeLeadId}`, {
        feedback: rejectionFeedback
      });
      setPendingDesign(null);
      setShowRejectModal(false);
      setRejectionFeedback("");
    } catch (e) {
      alert("Error sending feedback");
    }
  };

  // Sample vibes for quick selection
  const sampleVibes = [
    "Retro 80s neon with bold typography",
    "Modern minimalist, clean lines",
    "Vintage collegiate classic",
    "Streetwear urban graffiti style",
    "Nature-inspired earthy tones"
  ];

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Design Studio Agent</h1>
        <p className="text-fp-slate mt-2">AI-Powered Apparel Design with Compliance Checks</p>
      </div>

      {/* Design Input Section */}
      <div className="bg-fp-lightNavy p-6 rounded-xl border border-white/5">
        <h3 className="text-fp-slate text-sm font-medium uppercase tracking-wider mb-4">Design Vibe / Style</h3>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Palette className="absolute left-4 top-1/2 -translate-y-1/2 text-fp-slate" size={18} />
            <input
              type="text"
              value={vibe}
              onChange={(e) => setVibe(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && triggerDesigner()}
              placeholder="e.g. Retro 80s neon, Modern minimalist, Vintage collegiate..."
              className="w-full bg-black/30 border border-white/10 rounded-lg py-3 pl-12 pr-4 text-white placeholder-fp-slate/50 focus:outline-none focus:border-fp-gold transition-colors"
            />
          </div>
          <button
            onClick={triggerDesigner}
            className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg shadow-lg shadow-purple-500/20 transition-all"
          >
            <Play size={18} fill="currentColor" />
            Generate Design
          </button>
        </div>

        {/* Quick Vibe Selection */}
        <div className="flex flex-wrap gap-2 mt-4">
          {sampleVibes.map((v) => (
            <button
              key={v}
              onClick={() => setVibe(v)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-all ${vibe === v
                ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                : 'border-white/10 text-fp-slate hover:border-white/30'
                }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Left Col: Design Preview */}
        <div className="space-y-6">
          <div className="bg-fp-lightNavy p-6 rounded-xl border border-white/5">
            <h3 className="text-fp-slate text-sm font-medium uppercase tracking-wider mb-4">Design Preview</h3>
            {(pendingDesign?.image_url || approvedDesign?.image_url) ? (
              <div className="space-y-4">
                {approvedDesign && !pendingDesign && (
                  <div className="flex items-center gap-2 p-2 bg-green-500/20 rounded-lg border border-green-500/50">
                    <Check size={16} className="text-green-400" />
                    <span className="text-green-400 text-sm font-bold">APPROVED & SAVED</span>
                  </div>
                )}
                <img
                  src={pendingDesign?.image_url || approvedDesign?.image_url}
                  alt="Generated Design"
                  className="w-full rounded-lg border border-white/10"
                />
                <div className="p-3 bg-black/30 rounded-lg">
                  <span className="text-xs text-fp-gold font-bold">COST ESTIMATE</span>
                  <p className="text-white text-sm mt-1">{pendingDesign?.cost_report || approvedDesign?.cost_report}</p>
                </div>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-fp-slate border border-dashed border-fp-slate/30 rounded-lg">
                {activeLeadId ? "Generating design..." : "No design yet"}
              </div>
            )}
          </div>

          {/* Approval Actions */}
          {pendingDesign?.status === "waiting_for_approval" && (
            <div className="flex gap-3">
              <button
                onClick={() => setShowRejectModal(true)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-all"
              >
                <X size={18} />
                Reject
              </button>
              <button
                onClick={handleApprove}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-500 text-white hover:bg-green-600 font-bold rounded-lg transition-all"
              >
                <Check size={18} />
                Approve
              </button>
            </div>
          )}
        </div>

        {/* Right Col: The Terminal (Spans 2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-fp-slate text-sm font-medium uppercase tracking-wider">Design Agent Activity</h3>
          <AgentTerminal leadId={activeLeadId} />
        </div>

      </div>

      {/* Rejection Feedback Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-fp-lightNavy border border-red-500/50 rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <RefreshCw size={20} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-white font-bold">Request Changes</h3>
                <p className="text-fp-slate text-sm">Tell the AI what to fix</p>
              </div>
            </div>

            <textarea
              value={rejectionFeedback}
              onChange={(e) => setRejectionFeedback(e.target.value)}
              placeholder="e.g. Make it bolder, use brighter colors, add the team mascot..."
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