"use client";
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Terminal, Loader2, ChevronUp, ChevronDown, Pause, Play } from "lucide-react";

interface Log {
    id: number;
    agent_type: string;
    log_message: string;
    timestamp: string;
}

export default function AgentTerminal({ leadId }: { leadId: number | null }) {
    const [logs, setLogs] = useState<Log[]>([]);
    const [autoScroll, setAutoScroll] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!leadId) return;

        // Polling Function
        const fetchLogs = async () => {
            try {
                const res = await axios.get(`http://localhost:8000/logs/${leadId}`);
                setLogs(res.data.logs);
            } catch (e) {
                console.error("Polling error", e);
            }
        };

        const interval = setInterval(fetchLogs, 2000); // Poll every 2s
        return () => clearInterval(interval);
    }, [leadId]);

    // Auto-scroll to bottom (only if enabled)
    useEffect(() => {
        if (scrollRef.current && autoScroll) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs, autoScroll]);

    // Scroll controls
    const scrollToTop = () => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = 0;
            setAutoScroll(false);
        }
    };

    const scrollToBottom = () => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            setAutoScroll(true);
        }
    };

    if (!leadId) return (
        <div className="h-[500px] flex items-center justify-center text-fp-slate border border-dashed border-fp-slate/30 rounded-lg">
            Waiting for Event Trigger...
        </div>
    );

    return (
        <div className="bg-black rounded-lg border border-fp-slate/20 shadow-2xl overflow-hidden font-mono text-sm">
            {/* Header */}
            <div className="bg-fp-lightNavy px-4 py-2 flex items-center justify-between border-b border-fp-slate/20">
                <div className="flex items-center gap-2 text-fp-gold">
                    <Terminal size={16} />
                    <span className="font-bold">AGENT_LIVE_FEED :: PROCESS_ID_{leadId}</span>
                </div>
                <div className="flex items-center gap-3">
                    {/* Scroll Controls */}
                    <div className="flex items-center gap-1 border-r border-fp-slate/30 pr-3">
                        <button
                            onClick={scrollToTop}
                            className="p-1 text-fp-slate hover:text-white hover:bg-white/10 rounded transition-colors"
                            title="Scroll to top"
                        >
                            <ChevronUp size={14} />
                        </button>
                        <button
                            onClick={scrollToBottom}
                            className="p-1 text-fp-slate hover:text-white hover:bg-white/10 rounded transition-colors"
                            title="Scroll to bottom"
                        >
                            <ChevronDown size={14} />
                        </button>
                        <button
                            onClick={() => setAutoScroll(!autoScroll)}
                            className={`p-1 rounded transition-colors ${autoScroll ? 'text-green-400 bg-green-500/20' : 'text-fp-slate hover:text-white'}`}
                            title={autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
                        >
                            {autoScroll ? <Play size={14} /> : <Pause size={14} />}
                        </button>
                    </div>
                    {/* Online indicator */}
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                        </span>
                        <span className="text-xs text-green-500">ONLINE</span>
                    </div>
                </div>
            </div>

            {/* Log count indicator */}
            <div className="bg-fp-lightNavy/50 px-4 py-1 text-xs text-fp-slate border-b border-fp-slate/10 flex justify-between">
                <span>{logs.length} log entries</span>
                <span>{autoScroll ? "Auto-scrolling" : "Scroll paused - manual mode"}</span>
            </div>

            {/* Scrollable log area with visible scrollbar */}
            <div
                ref={scrollRef}
                className="h-[500px] overflow-y-scroll p-4 space-y-2"
                style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: '#6366f1 #1e293b'
                }}
                onScroll={() => {
                    // Disable auto-scroll if user manually scrolls up
                    if (scrollRef.current) {
                        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
                        const isAtBottom = scrollTop + clientHeight >= scrollHeight - 50;
                        if (!isAtBottom && autoScroll) {
                            setAutoScroll(false);
                        }
                    }
                }}
            >
                {logs.map((log) => (
                    <div key={log.id} className="animate-in fade-in slide-in-from-left-2 duration-300 hover:bg-white/5 p-1 rounded">
                        <span className="text-fp-slate opacity-50">[{new Date().toLocaleTimeString()}]</span>{" "}
                        <span className={
                            log.agent_type === "THOUGHT" ? "text-gray-400" :
                                log.agent_type === "TOOL" ? "text-green-400" :
                                    log.agent_type === "TOOL_RESULT" ? "text-blue-400" :
                                        log.agent_type === "SYSTEM" ? "text-fp-gold font-bold" :
                                            "text-green-400"
                        }>
                            {log.agent_type}:
                        </span>{" "}
                        <span className="text-gray-200">{log.log_message}</span>
                    </div>
                ))}
                {/* Only show Thinking if agent is still active (not finished, failed, or paused) */}
                {logs.length > 0 && (() => {
                    const lastLog = logs[logs.length - 1];
                    const msg = lastLog.log_message;
                    // Check for various completion conditions
                    const isFinished =
                        msg.includes('✅') ||
                        msg.includes('❌') ||
                        msg.includes('PAUSED') ||
                        msg.includes('📧') ||
                        msg.includes('Logistics Plan Saved') ||
                        msg.includes('Order Routed') ||
                        msg.includes('Notification sent') ||
                        msg.includes('Stock Shortage') ||
                        msg.includes('Plan Executed') ||
                        msg.includes('completed');
                    return !isFinished && (
                        <div className="flex items-center gap-2 text-fp-gold animate-pulse mt-4 p-2 bg-fp-gold/10 rounded">
                            <Loader2 size={14} className="animate-spin" />
                            <span>Thinking...</span>
                        </div>
                    );
                })()}
            </div>

            {/* Custom scrollbar styles */}
            <style jsx>{`
                div::-webkit-scrollbar {
                    width: 10px;
                }
                div::-webkit-scrollbar-track {
                    background: #1e293b;
                    border-radius: 5px;
                }
                div::-webkit-scrollbar-thumb {
                    background: #6366f1;
                    border-radius: 5px;
                }
                div::-webkit-scrollbar-thumb:hover {
                    background: #818cf8;
                }
            `}</style>
        </div>
    );
}