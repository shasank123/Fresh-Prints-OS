"use client";
import { useEffect, useState } from "react";
import axios from "axios";
import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";

export default function ApprovalModal({ leadId }: { leadId: number | null }) {
  const [pendingDraft, setPendingDraft] = useState<any>(null);

  useEffect(() => {
    if (!leadId) return;

    const checkStatus = async () => {
      try {
        const res = await axios.get(`http://localhost:8000/lead-pending-draft/${leadId}`);
        if (res.data.status === "waiting_for_approval") {
          setPendingDraft(res.data);
        } else {
          setPendingDraft(null); // Close modal if agent resumes or finishes
        }
      } catch (e) {
        console.error("Check status error", e);
      }
    };

    const interval = setInterval(checkStatus, 3000); // Check every 3s
    return () => clearInterval(interval);
  }, [leadId]);

  const handleApprove = async () => {
    await axios.post(`http://localhost:8000/approve-lead/${leadId}`);
    setPendingDraft(null);
  };

  if (!pendingDraft) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-fp-lightNavy border border-fp-gold rounded-xl max-w-2xl w-full shadow-2xl shadow-fp-gold/20 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-start gap-4">
          <div className="p-3 bg-yellow-500/20 rounded-lg text-yellow-500">
            <AlertTriangle size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Human Approval Required</h2>
            <p className="text-fp-slate text-sm">The Agent has drafted a high-value email. Please review before sending.</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-fp-gold uppercase tracking-wider">Strategic Reasoning</label>
            <div className="p-3 bg-black/30 rounded border border-white/5 text-sm text-gray-300">
              {pendingDraft.strategy}
            </div>
          </div>

          <div className="space-y-2">
             <label className="text-xs font-bold text-fp-gold uppercase tracking-wider">Draft Email Content</label>
             <textarea 
               className="w-full h-40 bg-white/5 border border-white/10 rounded-lg p-4 text-sm text-white font-mono focus:outline-none focus:border-fp-gold"
               defaultValue={pendingDraft.pending_draft}
             />
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 border-t border-white/10 flex justify-end gap-3">
          <button 
             onClick={() => setPendingDraft(null)} 
             className="px-4 py-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-2"
          >
            <XCircle size={18} /> Reject
          </button>
          <button 
             onClick={handleApprove}
             className="px-6 py-2 bg-fp-gold text-fp-navy font-bold rounded-lg hover:bg-fp-gold/90 transition-all flex items-center gap-2"
          >
            <CheckCircle size={18} /> Approve & Send
          </button>
        </div>

      </div>
    </div>
  );
}