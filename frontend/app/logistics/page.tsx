"use client";
import { useState, useEffect, Suspense } from "react";
import dynamic from "next/dynamic";
import AgentTerminal from "@/components/AgentTerminal";
import RateComparison from "@/components/RateComparison";
import { Truck, Play, X, Check, RefreshCw, Package, MapPin, Hash, DollarSign, Map, Leaf, Clock, AlertTriangle, CheckCircle, XCircle, Mail, TrendingUp, History, Calendar, Building2, BarChart3 } from "lucide-react";
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
  eta_days?: number;
  carbon_kg?: number;
}

interface OrderHistory {
  id: number;
  sku: string;
  destination: string;
  qty: number;
  cost: number;
  date: string;
  status: "delivered" | "in_transit" | "processing";
}

interface WarehouseStatus {
  name: string;
  code: string;
  stock: number;
  status: "IDLE" | "NORMAL" | "OVERLOADED";
  weather: "CLEAR" | "WARNING" | "CRITICAL";
  backlogDays: number;
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
  const [activeTab, setActiveTab] = useState<"terminal" | "rates" | "map" | "forecast">("terminal");
  const [orderHistory, setOrderHistory] = useState<OrderHistory[]>([
    { id: 1001, sku: "HOODIE-BLACK-L", destination: "94043", qty: 250, cost: 487.50, date: "Jan 10", status: "delivered" },
    { id: 1002, sku: "POLO-NAVY-S", destination: "78701", qty: 50, cost: 89.25, date: "Jan 11", status: "in_transit" },
    { id: 1003, sku: "TANK-TOP-RED-M", destination: "33101", qty: 200, cost: 312.00, date: "Jan 12", status: "processing" }
  ]);
  const [etaHours] = useState(Math.floor(Math.random() * 12) + 8); // Fixed on mount

  // Dynamic warehouse statuses - can be updated from agent logs
  const [warehouses, setWarehouses] = useState<WarehouseStatus[]>([
    { name: "New Jersey", code: "NJ", stock: 150, status: "IDLE", weather: "CLEAR", backlogDays: 0 },
    { name: "Texas", code: "TX", stock: 100, status: "NORMAL", weather: "CLEAR", backlogDays: 2 },
    { name: "California", code: "CA", stock: 50, status: "NORMAL", weather: "CLEAR", backlogDays: 1 }
  ]);

  // Update warehouses when we detect inventory/factory data in logs
  useEffect(() => {
    if (!activeLeadId) return;

    const updateFromLogs = async () => {
      try {
        const res = await axios.get(`http://localhost:8000/logs/${activeLeadId}`);
        const logs = res.data.logs || [];

        // Parse inventory data from logs
        const inventoryLog = logs.find((l: any) => l.log_message?.includes("New Jersey (NJ)"));
        if (inventoryLog) {
          const msg = inventoryLog.log_message;
          // Extract stock values from log
          const njMatch = msg.match(/New Jersey \(NJ\)':\s*(\d+)/);
          const txMatch = msg.match(/Texas \(TX\)':\s*(\d+)/);
          const caMatch = msg.match(/California \(CA\)':\s*(\d+)/);

          if (njMatch || txMatch || caMatch) {
            setWarehouses(prev => prev.map(wh => {
              if (wh.code === 'NJ' && njMatch) return { ...wh, stock: parseInt(njMatch[1]) };
              if (wh.code === 'TX' && txMatch) return { ...wh, stock: parseInt(txMatch[1]) };
              if (wh.code === 'CA' && caMatch) return { ...wh, stock: parseInt(caMatch[1]) };
              return wh;
            }));
          }
        }

        // Parse weather alerts
        logs.forEach((l: any) => {
          if (l.log_message?.includes("CRITICAL: Weather Alert")) {
            setWarehouses(prev => prev.map(wh =>
              l.log_message.includes(wh.code) ? { ...wh, weather: "CRITICAL" } : wh
            ));
          }
        });

        // Parse factory load
        logs.forEach((l: any) => {
          if (l.log_message?.includes("day backlog")) {
            const match = l.log_message.match(/Factory (\w+):\s*(\d+)\s*day backlog \((\w+)\)/);
            if (match) {
              const code = match[1].replace('FACTORY_', '');
              const days = parseInt(match[2]);
              const status = match[3];
              setWarehouses(prev => prev.map(wh =>
                wh.code === code ? { ...wh, backlogDays: days, status: status as any } : wh
              ));
            }
          }
        });
      } catch (e) {
        console.error("Log parse error", e);
      }
    };

    const interval = setInterval(updateFromLogs, 3000);
    return () => clearInterval(interval);
  }, [activeLeadId]);

  // Demand forecast data - mutable, updated from logs
  const [forecast, setForecast] = useState({
    total: 315,
    avg: 45,
    peakDay: "Saturday",
    peakOrders: 58,
    recommendation: "NORMAL LEVELS" as "NORMAL LEVELS" | "STOCK UP",
    daily: [
      { day: "Mon", orders: 42, conf: 85 },
      { day: "Tue", orders: 38, conf: 88 },
      { day: "Wed", orders: 45, conf: 82 },
      { day: "Thu", orders: 41, conf: 90 },
      { day: "Fri", orders: 48, conf: 78 },
      { day: "Sat", orders: 58, conf: 75 },
      { day: "Sun", orders: 43, conf: 80 }
    ]
  });

  // Update forecast from agent logs
  useEffect(() => {
    if (!activeLeadId) return;

    const parseForecastFromLogs = async () => {
      try {
        const res = await axios.get(`http://localhost:8000/logs/${activeLeadId}`);
        const logs = res.data.logs || [];

        // Look for demand forecast result in logs
        const forecastLog = logs.find((l: any) =>
          l.log_message?.includes('total_predicted_orders') ||
          l.log_message?.includes('avg_daily')
        );

        if (forecastLog) {
          const msg = forecastLog.log_message;
          // Parse JSON-like data from log
          const totalMatch = msg.match(/total_predicted_orders['":\s]+(\d+)/);
          const avgMatch = msg.match(/avg_daily['":\s]+(\d+\.?\d*)/);
          const peakDayMatch = msg.match(/peak_day['":\s]+'?(\w+)'?/);
          const peakOrdersMatch = msg.match(/peak_orders['":\s]+(\d+)/);
          const recommendMatch = msg.match(/recommendation['":\s]+'?(STOCK UP|NORMAL LEVELS)'?/i);

          if (totalMatch || avgMatch) {
            setForecast(prev => ({
              ...prev,
              total: totalMatch ? parseInt(totalMatch[1]) : prev.total,
              avg: avgMatch ? parseFloat(avgMatch[1]) : prev.avg,
              peakDay: peakDayMatch ? peakDayMatch[1] : prev.peakDay,
              peakOrders: peakOrdersMatch ? parseInt(peakOrdersMatch[1]) : prev.peakOrders,
              recommendation: recommendMatch ? (recommendMatch[1].toUpperCase() as "NORMAL LEVELS" | "STOCK UP") : prev.recommendation
            }));
          }
        }
      } catch (e) {
        console.error("Forecast parse error", e);
      }
    };

    const interval = setInterval(parseForecastFromLogs, 3000);
    return () => clearInterval(interval);
  }, [activeLeadId]);

  // ETA calculation - stable values that don't change on re-render
  const getETA = () => {
    const days = pendingPlan?.eta_days || approvedPlan?.eta_days || 3;
    const eta = new Date();
    eta.setDate(eta.getDate() + days);
    return { days, hours: etaHours, date: eta.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) };
  };

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
      // Add to order history
      setOrderHistory(prev => [{
        id: activeLeadId,
        sku: sku,
        destination: customerZip,
        qty: parseInt(orderQty),
        cost: pendingPlan?.total_cost || 0,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        status: "processing"
      }, ...prev]);
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

  const eta = getETA();

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Logistics Command Agent</h1>
          <p className="text-fp-slate mt-1">Supply Chain Optimization • Carbon Tracking • Live Carrier Rates</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <Building2 size={14} className="text-green-400" />
            <span className="text-green-400">9 Tools Active</span>
          </div>
          <div className="flex items-center gap-2">
            <Leaf size={14} className="text-green-400" />
            <span className="text-green-400">ESG Tracking</span>
          </div>
        </div>
      </div>

      {/* Warehouse Health Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {warehouses.map((wh) => (
          <div key={wh.code} className={`bg-fp-lightNavy p-4 rounded-xl border ${wh.stock === 0 ? 'border-red-500/50' : wh.status === 'OVERLOADED' ? 'border-yellow-500/50' : 'border-green-500/50'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-bold">{wh.name} ({wh.code})</span>
              {wh.stock === 0 ? <XCircle size={16} className="text-red-400" /> :
                wh.status === 'OVERLOADED' ? <AlertTriangle size={16} className="text-yellow-400" /> :
                  <CheckCircle size={16} className="text-green-400" />}
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-fp-slate">Stock</div>
                <div className={`font-bold ${wh.stock === 0 ? 'text-red-400' : 'text-white'}`}>{wh.stock} units</div>
              </div>
              <div>
                <div className="text-fp-slate">Status</div>
                <div className={`font-bold ${wh.status === 'IDLE' ? 'text-green-400' : wh.status === 'OVERLOADED' ? 'text-yellow-400' : 'text-blue-400'}`}>
                  {wh.status}
                </div>
              </div>
              <div>
                <div className="text-fp-slate">Backlog</div>
                <div className={`font-bold ${wh.backlogDays > 3 ? 'text-red-400' : 'text-white'}`}>{wh.backlogDays}d</div>
              </div>
            </div>
            {wh.weather !== 'CLEAR' && (
              <div className={`mt-2 px-2 py-1 rounded text-xs ${wh.weather === 'WARNING' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>
                ⚠️ Weather Alert
              </div>
            )}
          </div>
        ))}
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
          {/* Route or Cancel Button */}
          {activeLeadId && !isApproved && !pendingPlan ? (
            <button
              onClick={() => {
                setActiveLeadId(null);
                setPendingPlan(null);
              }}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-red-500/80 hover:bg-red-500 text-white font-bold rounded-lg transition-all"
            >
              <X size={18} />
              Cancel
            </button>
          ) : (
            <button
              onClick={triggerLogistics}
              disabled={!!activeLeadId && !isApproved}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold rounded-lg shadow-lg shadow-green-500/20 transition-all disabled:opacity-50"
            >
              <Truck size={18} />
              Route Order
            </button>
          )}
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
        <div className="space-y-4">
          {/* ETA Countdown Timer */}
          {(pendingPlan || approvedPlan) && (
            <div className="bg-gradient-to-r from-green-600/20 to-emerald-600/20 p-4 rounded-xl border border-green-500/50">
              <div className="flex items-center gap-2 mb-2">
                <Clock size={18} className="text-green-400" />
                <span className="text-green-400 text-sm font-bold">ESTIMATED DELIVERY</span>
              </div>
              <div className="text-3xl font-bold text-white">
                {eta.days} days, {eta.hours} hours
              </div>
              <div className="text-fp-slate text-sm mt-1">
                Arrives {eta.date}
              </div>
            </div>
          )}

          {/* Order Status Card */}
          <div className="bg-fp-lightNavy p-4 rounded-xl border border-white/5">
            <h3 className="text-fp-slate text-sm font-medium uppercase tracking-wider mb-3">Active Order</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-fp-slate">Destination</span>
                <span className="text-white font-mono">{customerZip}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-fp-slate">Quantity</span>
                <span className="text-white font-mono">{orderQty} units</span>
              </div>
              <div className="flex justify-between">
                <span className="text-fp-slate">Product</span>
                <span className="text-white font-mono text-xs truncate max-w-[150px]">{sku}</span>
              </div>
              <div className="pt-2 border-t border-white/10">
                <div className="flex justify-between">
                  <span className="text-fp-slate">Status</span>
                  {(() => {
                    const isFailed = (pendingPlan?.plan_details || approvedPlan?.plan_details || '').toLowerCase().includes('insufficient');
                    if (!activeLeadId) return <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-gray-500/20 text-fp-slate">Ready</span>;
                    if (isFailed && isApproved) return <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">❌ Failed - Insufficient Stock</span>;
                    if (pendingPlan) return <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">⏸ Awaiting Approval</span>;
                    if (isApproved) return <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">✓ Routed</span>;
                    return <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">⏳ Processing</span>;
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* Delivery Notification Preview - Show different message for failed orders */}
          {(pendingPlan || approvedPlan) && (() => {
            const planDetails = pendingPlan?.plan_details || approvedPlan?.plan_details || '';
            const isFailed = planDetails.toLowerCase().includes('insufficient');

            return (
              <div className={`bg-fp-lightNavy p-4 rounded-xl border ${isFailed ? 'border-red-500/50' : 'border-white/5'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <Mail size={16} className={isFailed ? "text-red-400" : "text-purple-400"} />
                  <h3 className="text-fp-slate text-xs font-medium uppercase tracking-wider">
                    {isFailed ? 'Order Failed Notification' : 'Customer Notification Preview'}
                  </h3>
                </div>
                <div className={`rounded-lg p-3 text-sm ${isFailed ? 'bg-red-50' : 'bg-white'}`}>
                  <div className="text-xs text-gray-500 mb-2">To: customer@email.com</div>
                  {isFailed ? (
                    <>
                      <div className="font-bold text-red-700">⚠️ Order Issue - Action Required</div>
                      <div className="text-red-600 mt-2 text-xs">
                        <p><strong>Order:</strong> {orderQty}x {sku}</p>
                        <p className="mt-1">We're sorry, but we don't have enough stock to fulfill your order.</p>
                        <p className="mt-1"><strong>Available Stock:</strong> 300 units</p>
                        <p className="mt-1"><strong>Options:</strong></p>
                        <ul className="list-disc ml-4 mt-1">
                          <li>Reduce order quantity to 300 or less</li>
                          <li>Join waitlist for restock</li>
                          <li>Choose a different product</li>
                        </ul>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-bold text-gray-900">Your Fresh Prints Order is on its way! 🎉</div>
                      <div className="text-gray-700 mt-2 text-xs">
                        <p><strong>Order:</strong> {orderQty}x {sku}</p>
                        <p><strong>Destination:</strong> ZIP {customerZip}</p>
                        <p><strong>ETA:</strong> {eta.date}</p>
                        <p className="text-green-600 mt-1">🌱 Carbon Neutral Shipping</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })()}

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

          {/* Order History Panel */}
          <div className="bg-fp-lightNavy p-4 rounded-xl border border-white/5">
            <div className="flex items-center gap-2 mb-3">
              <History size={16} className="text-fp-gold" />
              <h3 className="text-fp-slate text-xs font-medium uppercase tracking-wider">Order History</h3>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {orderHistory.map((order) => (
                <div key={order.id} className="flex justify-between items-center p-2 bg-black/20 rounded text-xs">
                  <div>
                    <div className="text-white font-mono">{order.sku}</div>
                    <div className="text-fp-slate">{order.qty} → ZIP {order.destination}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-fp-gold font-bold">${order.cost.toFixed(2)}</div>
                    <div className={`${order.status === 'delivered' ? 'text-green-400' : order.status === 'in_transit' ? 'text-blue-400' : 'text-yellow-400'}`}>
                      {order.status === 'delivered' ? '✓ Delivered' : order.status === 'in_transit' ? '🚚 In Transit' : '⏳ Processing'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Tabbed Content (spans 2) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Tab Navigation */}
          <div className="flex gap-2 flex-wrap">
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
            <button
              onClick={() => setActiveTab("forecast")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "forecast"
                ? "bg-orange-600 text-white"
                : "bg-fp-lightNavy text-fp-slate hover:text-white"}`}
            >
              📈 Demand Forecast
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
            {activeTab === "forecast" && (
              <div className="bg-fp-lightNavy p-6 rounded-xl border border-white/5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white font-bold text-lg">7-Day Demand Forecast</h3>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={async () => {
                        try {
                          const res = await axios.get(`http://localhost:8000/demand-forecast/${encodeURIComponent(sku)}`);
                          const data = res.data;
                          // Update state with API response
                          setForecast(prev => ({
                            ...prev,
                            total: data.total_predicted_orders || prev.total,
                            avg: data.avg_daily || prev.avg,
                            peakDay: data.peak_day || prev.peakDay,
                            peakOrders: data.peak_orders || prev.peakOrders,
                            recommendation: (data.recommendation === 'STOCK UP' ? 'STOCK UP' : 'NORMAL LEVELS') as "STOCK UP" | "NORMAL LEVELS",
                            daily: data.daily_forecast?.map((d: any) => ({
                              day: d.day_name?.substring(0, 3) || '',
                              orders: d.predicted_orders || 0,
                              conf: d.confidence || 80
                            })) || prev.daily
                          }));
                        } catch (e) {
                          console.log("Using cached forecast data");
                        }
                      }}
                      className="px-3 py-1 text-xs bg-orange-500/20 border border-orange-500/50 rounded text-orange-400 hover:bg-orange-500/30"
                    >
                      🔄 Refresh
                    </button>
                    <div className="flex items-center gap-2">
                      <BarChart3 size={16} className="text-orange-400" />
                      <span className="text-orange-400 text-sm">{sku}</span>
                    </div>
                  </div>
                </div>

                {/* Summary Stats */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="bg-black/30 p-3 rounded-lg text-center">
                    <div className="text-2xl font-bold text-white">{forecast.total}</div>
                    <div className="text-xs text-fp-slate">Total Predicted</div>
                  </div>
                  <div className="bg-black/30 p-3 rounded-lg text-center">
                    <div className={`text-2xl font-bold ${forecast.recommendation === 'STOCK UP' ? 'text-yellow-400' : 'text-green-400'}`}>{forecast.avg}</div>
                    <div className="text-xs text-fp-slate">Avg Daily</div>
                  </div>
                  <div className="bg-black/30 p-3 rounded-lg text-center">
                    <div className={`text-2xl font-bold ${forecast.recommendation === 'STOCK UP' ? 'text-red-400' : 'text-orange-400'}`}>{forecast.peakOrders}</div>
                    <div className="text-xs text-fp-slate">Peak ({forecast.peakDay})</div>
                  </div>
                  <div className={`p-3 rounded-lg text-center ${forecast.recommendation === 'STOCK UP' ? 'bg-red-500/20 border border-red-500/50' : 'bg-black/30'}`}>
                    <div className={`text-lg font-bold ${forecast.recommendation === 'STOCK UP' ? 'text-red-400' : 'text-blue-400'}`}>
                      {forecast.recommendation === 'STOCK UP' ? '⚠️ STOCK UP' : '✓ NORMAL'}
                    </div>
                    <div className="text-xs text-fp-slate">Stock Status</div>
                  </div>
                </div>

                {/* Fixed Bar Chart - colors based on recommendation */}
                <div className="bg-black/20 rounded-lg p-4 mb-4">
                  <div className="flex items-end justify-between gap-3" style={{ height: '160px' }}>
                    {forecast.daily.map((day) => {
                      const barHeight = Math.max(20, (day.orders / 60) * 140);
                      const isHighDemand = forecast.recommendation === 'STOCK UP';
                      return (
                        <div key={day.day} className="flex-1 flex flex-col items-center h-full justify-end">
                          <div className="text-xs text-white font-bold mb-1">{day.orders}</div>
                          <div
                            className={`w-full rounded-t transition-all ${isHighDemand
                              ? 'bg-gradient-to-t from-red-600 to-orange-400 hover:from-red-500 hover:to-orange-300'
                              : 'bg-gradient-to-t from-orange-600 to-orange-400 hover:from-orange-500 hover:to-orange-300'
                              }`}
                            style={{ height: `${barHeight}px` }}
                          />
                          <div className="text-xs text-fp-slate mt-2 font-medium">{day.day}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-fp-slate">
                  <span>📊 Confidence interval: 75-90%</span>
                  <span className="flex items-center gap-1">
                    <TrendingUp size={12} className="text-green-400" />
                    Weekend surge predicted
                  </span>
                </div>
              </div>
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