"use client";
import { useState, useEffect } from "react";
import AgentTerminal from "@/components/AgentTerminal";
import { Palette, Play, X, Check, RefreshCw, ChevronLeft, ChevronRight, Printer, TrendingUp, Layers, Building2, Copy, CheckCircle } from "lucide-react";
import axios from "axios";

interface ColorPalette {
  palette: Array<{ rank: number; rgb: number[]; hex: string }>;
  color_count: number;
  primary_color?: string;
}

interface PrintTechnique {
  recommended_technique: string;
  reason: string;
  cost_per_print: number;
  setup_cost: number;
  total_print_cost: number;
  best_for: string;
}

interface Profitability {
  cost_per_unit: number;
  suggested_retail: number;
  profit_per_unit: number;
  margin_percent: number;
  total_profit: number;
  total_revenue: number;
  order_qty: number;
}

interface PendingDesign {
  status: string;
  image_url?: string;
  cost_report?: string;
  color_count?: number;
  print_technique_name?: string;
  profit_margin?: number;
  color_palette?: ColorPalette;
  print_technique?: PrintTechnique;
  profitability?: Profitability;
}

interface DesignHistory {
  url: string;
  style: string;
  timestamp: number;
}

export default function DesignerPage() {
  const [activeLeadId, setActiveLeadId] = useState<number | null>(null);
  const [vibe, setVibe] = useState("Modern minimalist with university colors");
  const [pendingDesign, setPendingDesign] = useState<PendingDesign | null>(null);
  const [approvedDesign, setApprovedDesign] = useState<PendingDesign | null>(null);
  const [isApproved, setIsApproved] = useState(false);
  const [rejectionFeedback, setRejectionFeedback] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [designHistory, setDesignHistory] = useState<DesignHistory[]>([]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(0);
  const [copiedColor, setCopiedColor] = useState<string | null>(null);
  const [selectedColorIndex, setSelectedColorIndex] = useState<number | null>(null);
  const [showCopyToast, setShowCopyToast] = useState(false);

  // State for Apparel Chair (Stage 2) approval - MUST be declared before useEffect that uses them
  const [artDirectorApproved, setArtDirectorApproved] = useState(false);
  const [customerEmail, setCustomerEmail] = useState("apparelchair@university.edu");
  const [customerName, setCustomerName] = useState("Apparel Chair");
  const [approvalToken, setApprovalToken] = useState<string | null>(null);
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const [rejectUrl, setRejectUrl] = useState<string | null>(null);
  const [customerApprovalStatus, setCustomerApprovalStatus] = useState<string | null>(null);
  const [processedRejectionId, setProcessedRejectionId] = useState<number | null>(null);

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
    // Reset Stage 2 state
    setArtDirectorApproved(false);
    setApprovalToken(null);
    setApprovalUrl(null);
    setCustomerApprovalStatus(null);
    // Keep design history across generations - don't clear it
    // setDesignHistory([]); // REMOVED: Now designs accumulate
    setSelectedColorIndex(null);

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

  // Poll for pending design approval AND check for final approval status
  useEffect(() => {
    if (!activeLeadId) return;

    const checkPending = async () => {
      try {
        // Check for final Apparel Chair approval in logs
        const logsRes = await axios.get(`http://localhost:8000/logs/${activeLeadId}`);
        const logs = logsRes.data.logs || [];

        // Find the MOST RECENT Apparel Chair action (approval or rejection)
        // Logs are typically ordered oldest first, so reverse to get most recent
        const reversedLogs = [...logs].reverse();

        let mostRecentApproval = null;
        let mostRecentRejection = null;

        for (const log of reversedLogs) {
          const msg = log.log_message || '';
          if (!mostRecentApproval && msg.includes('Apparel Chair') && msg.includes('Approved!')) {
            mostRecentApproval = log;
          }
          if (!mostRecentRejection && msg.includes('Apparel Chair') && msg.includes('Rejected:')) {
            mostRecentRejection = log;
          }
          // Only need the most recent of each
          if (mostRecentApproval && mostRecentRejection) break;
        }

        // Only consider approved if approval is MORE RECENT than rejection (or no rejection exists)
        const shouldBeApproved = mostRecentApproval && (
          !mostRecentRejection ||
          (mostRecentApproval.id > mostRecentRejection.id) // Higher ID = more recent
        );

        if (shouldBeApproved && artDirectorApproved) {
          console.log("Final approval detected (more recent than any rejection):", mostRecentApproval.log_message);
          setCustomerApprovalStatus('APPROVED');
          setIsApproved(true);
          setPendingDesign(null);
          return; // Stop polling
        }

        // Check if rejection is more recent than approval - reset state to allow new approval cycle
        // Check if rejection is more recent than approval - reset state to allow new approval cycle
        const shouldBeRejected = mostRecentRejection && (
          !mostRecentApproval ||
          (mostRecentRejection.id > mostRecentApproval.id) // Higher ID = more recent
        );

        // Only reset if this is a NEW rejection we haven't processed yet
        const isNewRejection = shouldBeRejected && mostRecentRejection.id !== processedRejectionId;

        // Reset state if rejection detected and we're in any Stage 2 state
        if (isNewRejection && (artDirectorApproved || approvalToken || isApproved)) {
          console.log("Rejection detected, resetting to Stage 1 for new design cycle");
          setProcessedRejectionId(mostRecentRejection.id);
          setIsApproved(false);
          setArtDirectorApproved(false);
          setCustomerApprovalStatus('REJECTED');
          setApprovalToken(null);
          setApprovalUrl(null);
          setRejectUrl(null);
          setApprovedDesign(null); // Clear the old approved design
        }

        // If not finally approved, check for pending design
        if (!shouldBeApproved) {
          const res = await axios.get(`http://localhost:8000/design-pending-review/${activeLeadId}`);
          if (res.data.status === "waiting_for_approval") {
            setPendingDesign(res.data);
            // Add to history if new design
            if (res.data.image_url && !designHistory.find(d => d.url === res.data.image_url)) {
              setDesignHistory(prev => [...prev, {
                url: res.data.image_url,
                style: vibe,
                timestamp: Date.now()
              }]);
            }
          }
        }
      } catch (e) {
        console.error("Poll error", e);
      }
    };

    const interval = setInterval(checkPending, 3000);
    return () => clearInterval(interval);
  }, [activeLeadId, isApproved, artDirectorApproved, vibe, designHistory, processedRejectionId]);

  // Approve design (Stage 1 - Art Director)
  const handleApprove = async () => {
    if (!activeLeadId) return;
    try {
      await axios.post(`http://localhost:8000/approve-design/${activeLeadId}`);
      setApprovedDesign(pendingDesign);
      setPendingDesign(null);
      setArtDirectorApproved(true); // Stage 1 complete
    } catch (e) {
      alert("Error approving design");
    }
  };

  // Send to Apparel Chair (Stage 2)
  const sendToCustomer = async () => {
    console.log("sendToCustomer called", { activeLeadId, customerEmail });
    if (!activeLeadId || !customerEmail.trim()) {
      console.log("Missing activeLeadId or email");
      alert("Missing lead ID or email");
      return;
    }
    try {
      const res = await axios.post(`http://localhost:8000/send-to-customer/${activeLeadId}`, {
        customer_email: customerEmail,
        customer_name: customerName
      });
      console.log("Response:", res.data);
      setApprovalToken(res.data.token);
      setApprovalUrl(res.data.approval_url);
      setRejectUrl(res.data.reject_url);
      setCustomerApprovalStatus("pending");
    } catch (e: any) {
      console.error("Error:", e);
      alert("Error: " + (e.response?.data?.error || e.message));
    }
  };

  // Note: Main polling at line 105 handles approval/rejection detection with timestamp comparison

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

  // Copy color to clipboard with toast
  const handleCopyColor = async (hex: string, index: number) => {
    try {
      await navigator.clipboard.writeText(hex);
      setCopiedColor(hex);
      setSelectedColorIndex(index);
      setShowCopyToast(true);
      setTimeout(() => {
        setCopiedColor(null);
        setShowCopyToast(false);
      }, 2000);
    } catch (e) {
      console.error("Failed to copy", e);
    }
  };

  // Sample vibes for quick selection
  const sampleVibes = [
    { label: "Retro 80s Neon", emoji: "🌆" },
    { label: "Modern Minimalist", emoji: "⬜" },
    { label: "Vintage Collegiate", emoji: "🎓" },
    { label: "Streetwear Urban", emoji: "🏙️" },
    { label: "Nature Earthy", emoji: "🌿" }
  ];

  // Style reference presets
  const stylePresets = [
    { id: "nike", label: "Athletic", icon: "⚡" },
    { id: "supreme", label: "Streetwear", icon: "🔥" },
    { id: "vintage_band", label: "Vintage", icon: "🎸" },
    { id: "sports_team", label: "Sports", icon: "🏆" },
    { id: "tech_startup", label: "Tech", icon: "💻" }
  ];

  const currentImage = pendingDesign?.image_url || approvedDesign?.image_url;
  const currentData = pendingDesign || approvedDesign;

  // Get color palette from API response or use defaults
  const colorPalette = currentData?.color_palette?.palette || [
    { rank: 1, hex: "#B22222", rgb: [178, 34, 34] },
    { rank: 2, hex: "#FFD700", rgb: [255, 215, 0] },
    { rank: 3, hex: "#FFFFFF", rgb: [255, 255, 255] },
    { rank: 4, hex: "#1E3A5F", rgb: [30, 58, 95] },
    { rank: 5, hex: "#333333", rgb: [51, 51, 51] },
    { rank: 6, hex: "#8B4513", rgb: [139, 69, 19] }
  ];

  // Get profitability from API or use defaults
  const profitability = currentData?.profitability || {
    cost_per_unit: 8.75,
    suggested_retail: 21.99,
    margin_percent: 60,
    total_profit: 1324,
    order_qty: 100
  };

  // Get print technique from API or use defaults  
  const printTechnique = currentData?.print_technique || {
    recommended_technique: currentData?.print_technique_name || "Screen Print",
    reason: "Recommended for medium color count",
    setup_cost: 125,
    cost_per_print: 2.00,
    total_print_cost: 325
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Design Studio Agent</h1>
          <p className="text-fp-slate mt-1">AI-Powered Apparel Design • Vision Compliance • Cost Analysis</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Building2 size={14} className="text-purple-400" />
          <span className="text-purple-400">11 Design Tools Active</span>
        </div>
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
              placeholder="e.g. Championship celebration, team mascot, vintage throwback..."
              className="w-full bg-black/30 border border-white/10 rounded-lg py-3 pl-12 pr-4 text-white placeholder-fp-slate/50 focus:outline-none focus:border-purple-500 transition-colors"
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
              key={v.label}
              onClick={() => setVibe(v.label)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-all ${vibe === v.label
                ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                : 'border-white/10 text-fp-slate hover:border-white/30'
                }`}
            >
              {v.emoji} {v.label}
            </button>
          ))}
        </div>

        {/* Style Reference Presets */}
        <div className="mt-4 pt-4 border-t border-white/10">
          <span className="text-fp-slate text-xs">Style Reference:</span>
          <div className="flex gap-2 mt-2">
            {stylePresets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => setVibe(`${vibe} in ${preset.label.toLowerCase()} style`)}
                className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-fp-slate hover:border-purple-500 hover:text-purple-300 transition-all"
              >
                {preset.icon} {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Col: Design Preview */}
        <div className="space-y-4">
          {/* Design Preview - Show the generated mockup directly */}
          <div className="bg-fp-lightNavy p-6 rounded-xl border border-white/5">
            <h3 className="text-fp-slate text-sm font-medium uppercase tracking-wider mb-4">Design Preview</h3>

            {currentImage ? (
              <div className="space-y-4">
                {approvedDesign && !pendingDesign && (
                  <div className="flex items-center gap-2 p-2 bg-green-500/20 rounded-lg border border-green-500/50">
                    <Check size={16} className="text-green-400" />
                    <span className="text-green-400 text-sm font-bold">APPROVED & SAVED</span>
                  </div>
                )}

                {/* Generated Design/Mockup - Show directly as DALL-E generates mockups */}
                <div className="relative">
                  <img
                    src={currentImage}
                    alt="Generated Design"
                    className="w-full rounded-lg border border-white/10 shadow-lg"
                  />
                  <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                    AI Generated Mockup
                  </div>
                </div>

                {/* Selected Color Indicator */}
                {selectedColorIndex !== null && (
                  <div className="flex items-center gap-2 p-2 bg-purple-500/20 rounded-lg border border-purple-500/50">
                    <div
                      className="w-6 h-6 rounded border border-white/30"
                      style={{ backgroundColor: colorPalette[selectedColorIndex]?.hex }}
                    />
                    <span className="text-purple-300 text-sm">
                      Selected: {colorPalette[selectedColorIndex]?.hex}
                    </span>
                    {copiedColor && <CheckCircle size={14} className="text-green-400 ml-auto" />}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-fp-slate border border-dashed border-fp-slate/30 rounded-lg">
                <div className="text-center">
                  <Palette size={48} className="mx-auto mb-2 opacity-30" />
                  {activeLeadId ? "Generating design..." : "No design yet"}
                </div>
              </div>
            )}
          </div>

          {/* Approval Actions - Stage 1: Art Director */}
          {pendingDesign?.status === "waiting_for_approval" && !artDirectorApproved && !isApproved && (
            <div className="flex gap-3">
              <button
                onClick={() => setShowRejectModal(true)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-all border border-red-500/30"
              >
                <X size={18} />
                Reject
              </button>
              <button
                onClick={handleApprove}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-500 text-white hover:bg-green-600 font-bold rounded-lg transition-all"
              >
                <Check size={18} />
                Approve (Art Director)
              </button>
            </div>
          )}

          {/* Stage 2: Send to Apparel Chair */}
          {artDirectorApproved && !approvalToken && (
            <div className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 p-4 rounded-xl border border-purple-500/50">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">📧</span>
                <h3 className="text-white font-bold">Send to Apparel Chair for Final Approval</h3>
              </div>
              <p className="text-fp-slate text-sm mb-3">Art Director approved. Now send to the customer for final sign-off.</p>

              <div className="space-y-3">
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="Apparel Chair Email"
                  className="w-full bg-black/30 border border-white/10 rounded-lg py-2 px-4 text-white placeholder-fp-slate/50 focus:outline-none focus:border-purple-500"
                />
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Customer Name"
                  className="w-full bg-black/30 border border-white/10 rounded-lg py-2 px-4 text-white placeholder-fp-slate/50 focus:outline-none focus:border-purple-500"
                />
                <button
                  onClick={sendToCustomer}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold rounded-lg"
                >
                  📧 Send Design for Approval
                </button>
              </div>
            </div>
          )}

          {/* Stage 2: Awaiting Customer Approval */}
          {approvalToken && !isApproved && (
            <div className="space-y-3">
              <div className="bg-yellow-500/20 p-4 rounded-xl border border-yellow-500/50">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg animate-pulse">⏳</span>
                  <h3 className="text-yellow-400 font-bold">Awaiting Apparel Chair Approval</h3>
                </div>
                <p className="text-fp-slate text-sm">Email sent to {customerEmail}. Waiting for their response...</p>
              </div>

              {/* Simulated Email Preview (for demo) */}
              <div className="bg-white rounded-lg p-4 text-sm">
                <div className="text-gray-500 text-xs mb-2">📧 EMAIL PREVIEW (Sent to {customerEmail})</div>
                <div className="border-b pb-2 mb-2">
                  <strong className="text-gray-900">Subject:</strong> Fresh Prints Design Ready for Approval
                </div>
                <div className="text-gray-700">
                  <p className="mb-2">Hi {customerName},</p>
                  <p className="mb-2">Your design is ready for review! Please click below to approve or request changes.</p>
                  <div className="flex gap-2 mt-3">
                    <a
                      href={approvalUrl || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-green-500 text-white rounded font-bold text-xs hover:bg-green-600"
                      onClick={(e) => {
                        // Simulate customer clicking approve (for demo)
                        e.preventDefault();
                        window.open(approvalUrl || "", "_blank");
                      }}
                    >
                      ✓ Approve Design
                    </a>
                    <a
                      href={rejectUrl || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-red-500 text-white rounded font-bold text-xs hover:bg-red-600"
                      onClick={(e) => {
                        e.preventDefault();
                        window.open(rejectUrl || "", "_blank");
                      }}
                    >
                      ✕ Request Changes
                    </a>
                  </div>
                </div>
              </div>

              <p className="text-xs text-fp-slate text-center">
                💡 Demo: Click "Approve Design" above to simulate customer approval
              </p>
            </div>
          )}

          {/* Stage 2 Complete: Customer Approved */}
          {isApproved && (
            <div className="bg-green-500/20 p-4 rounded-xl border border-green-500/50">
              <div className="flex items-center gap-2">
                <span className="text-lg">✅</span>
                <div>
                  <h3 className="text-green-400 font-bold">Design Fully Approved!</h3>
                  <p className="text-fp-slate text-sm">Both Art Director and Apparel Chair have approved. Ready for production.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Middle Col: Analytics */}
        <div className="space-y-4">
          {/* Color Palette - Interactive: Click to copy */}
          <div className="bg-fp-lightNavy p-4 rounded-xl border border-white/5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-fp-slate text-xs font-medium uppercase tracking-wider">Color Palette</h3>
              <span className="text-xs text-fp-slate">Click to copy</span>
            </div>
            <div className="grid grid-cols-6 gap-2">
              {colorPalette.slice(0, 6).map((color, i) => (
                <button
                  key={i}
                  onClick={() => handleCopyColor(color.hex, i)}
                  className={`group relative text-center transition-all ${selectedColorIndex === i ? 'scale-110' : 'hover:scale-105'}`}
                >
                  <div
                    className={`h-12 rounded-lg mb-1 border-2 transition-all ${selectedColorIndex === i
                      ? 'border-purple-500 ring-2 ring-purple-500/50'
                      : 'border-white/20 group-hover:border-white/50'}`}
                    style={{ backgroundColor: color.hex }}
                  >
                    {copiedColor === color.hex && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                        <Copy size={16} className="text-white" />
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-fp-slate font-mono group-hover:text-white transition-colors">
                    {color.hex}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-xs text-fp-slate mt-3 flex items-center gap-2">
              <Layers size={12} />
              {currentData?.color_palette?.color_count || colorPalette.length} colors extracted from design
            </p>
          </div>

          {/* Print Technique Recommendation */}
          <div className="bg-fp-lightNavy p-4 rounded-xl border border-white/5">
            <h3 className="text-fp-slate text-xs font-medium uppercase tracking-wider mb-3">Print Technique</h3>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-500/20 rounded-lg">
                <Printer size={24} className="text-purple-400" />
              </div>
              <div>
                <div className="text-white font-bold">{printTechnique.recommended_technique}</div>
                <div className="text-xs text-fp-slate">{printTechnique.reason}</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-black/20 rounded">
                <div className="text-xs text-fp-slate">Setup</div>
                <div className="text-white font-bold">${printTechnique.setup_cost}</div>
              </div>
              <div className="p-2 bg-black/20 rounded">
                <div className="text-xs text-fp-slate">Per Unit</div>
                <div className="text-white font-bold">${printTechnique.cost_per_print?.toFixed(2)}</div>
              </div>
              <div className="p-2 bg-black/20 rounded">
                <div className="text-xs text-fp-slate">Total</div>
                <div className="text-purple-400 font-bold">${printTechnique.total_print_cost?.toFixed(0)}</div>
              </div>
            </div>
          </div>

          {/* Profitability Score */}
          <div className="bg-fp-lightNavy p-4 rounded-xl border border-white/5">
            <h3 className="text-fp-slate text-xs font-medium uppercase tracking-wider mb-3">
              Profitability ({profitability.order_qty} units)
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-fp-slate text-xs">Cost/Unit</div>
                <div className="text-white text-xl font-bold">${profitability.cost_per_unit?.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-fp-slate text-xs">Suggested Retail</div>
                <div className="text-green-400 text-xl font-bold">${profitability.suggested_retail?.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-fp-slate text-xs">Margin</div>
                <div className="text-purple-400 text-xl font-bold">{profitability.margin_percent?.toFixed(0)}%</div>
              </div>
              <div>
                <div className="text-fp-slate text-xs">Total Profit</div>
                <div className="text-fp-gold text-xl font-bold">${profitability.total_profit?.toLocaleString()}</div>
              </div>
            </div>
            <div className="mt-3 w-full bg-white/10 h-2 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 h-full transition-all"
                style={{ width: `${Math.min(profitability.margin_percent || 60, 100)}%` }}
              ></div>
            </div>
            <p className="text-xs text-fp-slate mt-1 flex items-center gap-1">
              <TrendingUp size={12} className="text-green-400" />
              {(profitability.margin_percent || 60) >= 50 ? 'Above average margin' : 'Standard margin'} for this category
            </p>
          </div>

          {/* Design History Gallery - Show with 1+ designs */}
          {designHistory.length > 0 && (
            <div className="bg-fp-lightNavy p-4 rounded-xl border border-white/5">
              <h3 className="text-fp-slate text-xs font-medium uppercase tracking-wider mb-3">Design History ({designHistory.length})</h3>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {designHistory.map((design, i) => (
                  <div
                    key={i}
                    className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${i === currentHistoryIndex ? 'border-purple-500' : 'border-transparent hover:border-white/30'}`}
                    onClick={() => setCurrentHistoryIndex(i)}
                  >
                    <img src={design.url} alt={`Design ${i + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center mt-2">
                <button
                  onClick={() => setCurrentHistoryIndex(Math.max(0, currentHistoryIndex - 1))}
                  disabled={currentHistoryIndex === 0}
                  className="p-1 text-fp-slate hover:text-white disabled:opacity-30"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs text-fp-slate">{currentHistoryIndex + 1} / {designHistory.length}</span>
                <button
                  onClick={() => setCurrentHistoryIndex(Math.min(designHistory.length - 1, currentHistoryIndex + 1))}
                  disabled={currentHistoryIndex === designHistory.length - 1}
                  className="p-1 text-fp-slate hover:text-white disabled:opacity-30"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Col: Terminal */}
        <div className="space-y-4">
          <h3 className="text-fp-slate text-sm font-medium uppercase tracking-wider">Design Agent Activity</h3>
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

      {/* Toast Notification for Color Copy */}
      {showCopyToast && copiedColor && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-3 bg-fp-lightNavy border border-green-500/50 rounded-lg px-4 py-3 shadow-xl">
            <div
              className="w-8 h-8 rounded border border-white/30"
              style={{ backgroundColor: copiedColor }}
            />
            <div>
              <div className="text-white font-medium flex items-center gap-2">
                <CheckCircle size={16} className="text-green-400" />
                Color Copied!
              </div>
              <div className="text-fp-slate text-sm font-mono">{copiedColor}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}