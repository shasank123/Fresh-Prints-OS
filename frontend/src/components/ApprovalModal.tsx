"use client";
import { useEffect, useState } from "react";
import axios from "axios";
import { AlertTriangle, CheckCircle, XCircle, RefreshCw, TrendingUp } from "lucide-react";

interface PendingDraft {
  status: string;
  pending_draft?: string;
  strategy?: string;
  sentiment?: string;
  lead_score?: number;
}

export default function ApprovalModal({ leadId }: { leadId: number | null }) {
  const [pendingDraft, setPendingDraft] = useState<PendingDraft | null>(null);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectionFeedback, setRejectionFeedback] = useState("");

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

  const handleReject = async () => {
    if (!rejectionFeedback.trim()) return;
    try {
      await axios.post(`http://localhost:8000/reject-lead/${leadId}`, {
        feedback: rejectionFeedback
      });
      setPendingDraft(null);
      setShowRejectInput(false);
      setRejectionFeedback("");
    } catch (e) {
      console.error("Error rejecting", e);
    }
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

  if (!pendingDraft) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-fp-lightNavy border border-fp-gold rounded-xl max-w-2xl w-full shadow-2xl shadow-fp-gold/20 animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-start gap-4">
          <div className="p-3 bg-yellow-500/20 rounded-lg text-yellow-500">
            <AlertTriangle size={24} />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white">Human Approval Required</h2>
            <p className="text-fp-slate text-sm">The Agent has drafted a high-value email. Please review before sending.</p>
          </div>
          {/* Lead Score Badge */}
          {pendingDraft.lead_score && (
            <div className="flex items-center gap-2 px-3 py-1 bg-fp-gold/20 rounded-full">
              <TrendingUp size={14} className="text-fp-gold" />
              <span className="text-fp-gold font-bold text-sm">{pendingDraft.lead_score}/100</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Sentiment Badge */}
          {pendingDraft.sentiment && (
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold ${getSentimentDisplay(pendingDraft.sentiment).bg}`}>
              <span>{getSentimentDisplay(pendingDraft.sentiment).emoji}</span>
              <span className={getSentimentDisplay(pendingDraft.sentiment).color}>
                {pendingDraft.sentiment} NEWS DETECTED
              </span>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold text-fp-gold uppercase tracking-wider">Strategic Reasoning</label>
            <div className="p-3 bg-black/30 rounded border border-white/5 text-sm text-gray-300">
              {pendingDraft.strategy}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-fp-gold uppercase tracking-wider">Draft Email Content</label>
            {/* Visual Email Preview */}
            <div className="bg-white rounded-lg shadow-lg overflow-hidden text-black">
              <div className="bg-gradient-to-r from-fp-navy to-fp-lightNavy p-3 flex items-center gap-3">
                <div className="h-8 w-8 bg-fp-gold rounded flex items-center justify-center text-fp-navy font-bold text-xs">FP</div>
                <div>
                  <div className="text-white text-sm font-bold">Fresh Prints Sales Team</div>
                  <div className="text-fp-slate text-xs">sales@freshprints.com</div>
                </div>
              </div>
              <textarea
                className="w-full h-40 p-4 text-sm text-gray-700 font-mono focus:outline-none resize-none"
                defaultValue={pendingDraft.pending_draft}
              />
            </div>
          </div>

          {/* Rejection Feedback Input (when reject clicked) */}
          {showRejectInput && (
            <div className="space-y-2 p-4 bg-red-500/10 rounded-lg border border-red-500/30">
              <div className="flex items-center gap-2 text-red-400">
                <RefreshCw size={16} />
                <label className="text-xs font-bold uppercase tracking-wider">Feedback for Regeneration</label>
              </div>
              <textarea
                value={rejectionFeedback}
                onChange={(e) => setRejectionFeedback(e.target.value)}
                placeholder="e.g. Make it more casual, add their championship reference, try a congratulatory tone..."
                className="w-full h-24 bg-black/30 border border-white/10 rounded-lg p-3 text-white placeholder-fp-slate/50 focus:outline-none focus:border-red-500 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowRejectInput(false)}
                  className="px-3 py-1.5 text-fp-slate hover:text-white text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={!rejectionFeedback.trim()}
                  className="px-4 py-1.5 bg-red-500 text-white font-bold rounded text-sm hover:bg-red-600 disabled:opacity-50"
                >
                  Send & Regenerate
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {!showRejectInput && (
          <div className="p-6 border-t border-white/10 flex justify-end gap-3">
            <button
              onClick={() => setShowRejectInput(true)}
              className="px-4 py-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-2"
            >
              <XCircle size={18} /> Reject & Give Feedback
            </button>
            <button
              onClick={handleApprove}
              className="px-6 py-2 bg-fp-gold text-fp-navy font-bold rounded-lg hover:bg-fp-gold/90 transition-all flex items-center gap-2"
            >
              <CheckCircle size={18} /> Approve & Send
            </button>
          </div>
        )}

      </div>
    </div>
  );
}