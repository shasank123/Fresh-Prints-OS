"use client";
import { useState, useEffect, Suspense } from "react";
import dynamic from "next/dynamic";
import AgentTerminal from "@/components/AgentTerminal";
import RateComparison from "@/components/RateComparison";
import { Truck, Play, X, Check, RefreshCw, Package, MapPin, Hash, DollarSign, Map, Leaf } from "lucide-react";
import axios from "axios";

// Dynamically import RouteMap (client-side only due to Leaflet)
const RouteMap = dynamic(() => import("@/components/RouteMap"), {
  ssr: false,
  loading: () => (
    <div className="bg-fp-lightNavy rounded-xl border border-white/5 p-6 h-80 flex items-center justify-center">
      <span className="text-fp-slate">Loading map...</span>
    </div>
  )
});

interface PendingPlan {
  status: string;
  plan_details?: string;
  total_cost?: number;
}

export default function LogisticsPage() {
  const [activeLeadId, setActiveLeadId] = useState<number | null>(null);
  const [customerZip, setCustomerZip] = useState("10001");
  const [orderQty, setOrderQty] = useState("100");
  const [sku, setSku] = useState("CREW-NECK-WHITE-M");
  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null);
  const [approvedPlan, setApprovedPlan] = useState<PendingPlan | null>(null);
  const [isApproved, setIsApproved] = useState(false);
  const [rejectionFeedback, setRejectionFeedback] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"terminal" | "rates" | "map">("terminal");

  // Trigger the Logistics Agent
  const triggerLogistics = async () => {
    if (!customerZip.trim() || !orderQty.trim() || !sku.trim()) {
      alert("Please fill in all fields");
      return;
    }

    setActiveLeadId(null);
    setPendingPlan(null);
    setApprovedPlan(null);
    setIsApproved(false);

    try {
      const newLeadId = Date.now();
      await axios.post("http://localhost:8000/run-logistics", {
        lead_id: newLeadId,
        customer_zip: customerZip.trim(),
        order_qty: parseInt(orderQty),
        sku: sku.trim()
      });
      setActiveLeadId(newLeadId);
    } catch (e) {
      alert("Ensure Backend is running on Port 8000!");
    }
  };

  // Poll for pending logistics plan approval
  useEffect(() => {
    if (!activeLeadId || isApproved) return;

    const checkPending = async () => {
      try {
        const res = await axios.get(`http://localhost:8000/logistics-pending-plan/${activeLeadId}`);
        if (res.data.status === "waiting_for_approval") {
          setPendingPlan(res.data);
        }
      } catch (e) {
        console.error("Poll error", e);
      }
    };

    const interval = setInterval(checkPending, 3000);
    return () => clearInterval(interval);
  }, [activeLeadId, isApproved]);

  // Approve plan
  const handleApprove = async () => {
    if (!activeLeadId) return;
    try {
      await axios.post(`http://localhost:8000/approve-logistics/${activeLeadId}`);
      setApprovedPlan(pendingPlan);
      setPendingPlan(null);
      setIsApproved(true);
    } catch (e) {
      alert("Error approving plan");
    }
  };

  // Reject plan with feedback
  const handleReject = async () => {
    if (!activeLeadId || !rejectionFeedback.trim()) return;
    try {
      await axios.post(`http://localhost:8000/reject-logistics/${activeLeadId}`, {
        feedback: rejectionFeedback
      });
      setPendingPlan(null);
      setShowRejectModal(false);
      setRejectionFeedback("");
    } catch (e) {
      alert("Error sending feedback");
    }
  };

  // Sample orders for quick selection
  const sampleOrders = [
    { zip: "10001", qty: 100, sku: "CREW-NECK-WHITE-M", label: "🗽 NYC - 100 White Tees" },
    { zip: "94043", qty: 250, sku: "HOODIE-BLACK-L", label: "🌉 Bay Area - 250 Hoodies" },
    { zip: "78701", qty: 50, sku: "POLO-NAVY-S", label: "🤠 Austin - 50 Polos" },
    { zip: "33101", qty: 200, sku: "TANK-TOP-RED-M", label: "🌴 Miami - 200 Tanks" },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Logistics Command Agent</h1>
          <p className="text-fp-slate mt-1">Supply Chain Optimization • Carbon Tracking • Live Carrier Rates</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Leaf size={14} className="text-green-400" />
          <span className="text-green-400">ESG Tracking Enabled</span>
        </div>
      </div>

      {/* Order Input Section */}
      <div className="bg-fp-lightNavy p-6 rounded-xl border border-white/5">
        <h3 className="text-fp-slate text-sm font-medium uppercase tracking-wider mb-4">Order Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="relative">
            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-fp-slate" size={18} />
            <input
              type="text"
              value={customerZip}
              onChange={(e) => setCustomerZip(e.target.value)}
              placeholder="Customer ZIP"
              className="w-full bg-black/30 border border-white/10 rounded-lg py-3 pl-12 pr-4 text-white placeholder-fp-slate/50 focus:outline-none focus:border-green-500 transition-colors"
            />
          </div>
          <div className="relative">
            <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-fp-slate" size={18} />
            <input
              type="number"
              value={orderQty}
              onChange={(e) => setOrderQty(e.target.value)}
              placeholder="Quantity"
              className="w-full bg-black/30 border border-white/10 rounded-lg py-3 pl-12 pr-4 text-white placeholder-fp-slate/50 focus:outline-none focus:border-green-500 transition-colors"
            />
          </div>
          <div className="relative md:col-span-2">
            <Package className="absolute left-4 top-1/2 -translate-y-1/2 text-fp-slate" size={18} />
            <input
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="SKU / Product"
              className="w-full bg-black/30 border border-white/10 rounded-lg py-3 pl-12 pr-4 text-white placeholder-fp-slate/50 focus:outline-none focus:border-green-500 transition-colors"
            />
          </div>
          <button
            onClick={triggerLogistics}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold rounded-lg shadow-lg shadow-green-500/20 transition-all"
          >
            <Truck size={18} />
            Route Order
          </button>
        </div>

        {/* Quick Order Selection */}
        <div className="flex flex-wrap gap-2 mt-4">
          {sampleOrders.map((order, i) => (
            <button
              key={i}
              onClick={() => {
                setCustomerZip(order.zip);
                setOrderQty(String(order.qty));
                setSku(order.sku);
              }}
              className={`px-3 py-1.5 text-xs rounded-full border transition-all ${customerZip === order.zip && sku === order.sku
                ? 'bg-green-600/20 border-green-500 text-green-300'
                : 'border-white/10 text-fp-slate hover:border-white/30'
                }`}
            >
              {order.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Column: Status & Plan */}
        <div className="space-y-6">
          {/* Order Status Card */}
          <div className="bg-fp-lightNavy p-6 rounded-xl border border-white/5">
            <h3 className="text-fp-slate text-sm font-medium uppercase tracking-wider mb-4">Active Order</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-fp-slate">Destination</span>
                <span className="text-white font-mono">{customerZip}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-fp-slate">Quantity</span>
                <span className="text-white font-mono">{orderQty} units</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-fp-slate">Product</span>
                <span className="text-white font-mono text-xs truncate max-w-[150px]">{sku}</span>
              </div>
              <div className="pt-2 border-t border-white/10">
                <div className="flex justify-between text-sm">
                  <span className="text-fp-slate">Status</span>
                  <span className={`font-mono text-xs px-2 py-0.5 rounded-full ${activeLeadId
                    ? (pendingPlan ? 'bg-yellow-500/20 text-yellow-400' : (isApproved ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'))
                    : 'bg-gray-500/20 text-fp-slate'}`}>
                    {activeLeadId
                      ? (pendingPlan ? '⏸ Awaiting Approval' : (isApproved ? '✓ Routed' : '⏳ Processing'))
                      : 'Ready'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Plan Preview Card */}
          {(pendingPlan || approvedPlan) && (
            <div className="bg-fp-lightNavy p-6 rounded-xl border border-white/5">
              <h3 className="text-fp-slate text-sm font-medium uppercase tracking-wider mb-4">
                {approvedPlan && !pendingPlan ? "✅ Approved Plan" : "📋 Pending Plan"}
              </h3>
              {approvedPlan && !pendingPlan && (
                <div className="flex items-center gap-2 p-2 bg-green-500/20 rounded-lg border border-green-500/50 mb-4">
                  <Check size={16} className="text-green-400" />
                  <span className="text-green-400 text-sm font-bold">SAVED TO DATABASE</span>
                </div>
              )}
              <div className="space-y-3">
                <div className="p-3 bg-black/30 rounded-lg">
                  <span className="text-xs text-green-400 font-bold">ROUTING PLAN</span>
                  <p className="text-white text-sm mt-1 font-mono leading-relaxed">
                    {pendingPlan?.plan_details || approvedPlan?.plan_details || "Processing..."}
                  </p>
                </div>
                <div className="flex items-center gap-2 p-3 bg-black/30 rounded-lg">
                  <DollarSign size={16} className="text-fp-gold" />
                  <div>
                    <span className="text-xs text-fp-gold font-bold">TOTAL COST</span>
                    <p className="text-white text-lg font-bold font-mono">
                      ${(pendingPlan?.total_cost || approvedPlan?.total_cost)?.toFixed(2) || "---"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Approval Actions */}
          {pendingPlan?.status === "waiting_for_approval" && (
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
                Approve
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Tabbed Content (spans 2) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Tab Navigation */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("terminal")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "terminal"
                ? "bg-green-600 text-white"
                : "bg-fp-lightNavy text-fp-slate hover:text-white"}`}
            >
              🤖 Agent Terminal
            </button>
            <button
              onClick={() => setActiveTab("rates")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "rates"
                ? "bg-blue-600 text-white"
                : "bg-fp-lightNavy text-fp-slate hover:text-white"}`}
            >
              📦 Carrier Rates
            </button>
            <button
              onClick={() => setActiveTab("map")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "map"
                ? "bg-purple-600 text-white"
                : "bg-fp-lightNavy text-fp-slate hover:text-white"}`}
            >
              🗺️ Route Map
            </button>
          </div>

          {/* Tab Content */}
          <div className="min-h-[400px]">
            {activeTab === "terminal" && (
              <AgentTerminal leadId={activeLeadId} />
            )}
            {activeTab === "rates" && (
              <RateComparison
                originZip="07001"
                destZip={customerZip}
                weightLbs={parseInt(orderQty) * 0.5}
              />
            )}
            {activeTab === "map" && (
              <RouteMap customerZip={customerZip} />
            )}
          </div>
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
                <h3 className="text-white font-bold">Request Plan Changes</h3>
                <p className="text-fp-slate text-sm">Tell the AI what to adjust in the routing</p>
              </div>
            </div>

            <textarea
              value={rejectionFeedback}
              onChange={(e) => setRejectionFeedback(e.target.value)}
              placeholder="e.g. Prioritize faster delivery over cost, avoid Texas warehouse, use air freight, optimize for lower carbon footprint..."
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
                Send Feedback & Re-Route
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}