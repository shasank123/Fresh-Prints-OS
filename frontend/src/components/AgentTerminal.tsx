"use client";
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Terminal, Loader2 } from "lucide-react";

interface Log {
    id: number;
    agent_type: string;
    log_message: string;
    timestamp: string;
}

export default function AgentTerminal({ leadId }: { leadId: number | null }) {
    const [logs, setLogs] = useState<Log[]>([]);
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

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    if (!leadId) return (
        <div className="h-96 flex items-center justify-center text-fp-slate border border-dashed border-fp-slate/30 rounded-lg">
            Waiting for Event Trigger...
        </div>
    );

    return (
        <div className="bg-black rounded-lg border border-fp-slate/20 shadow-2xl overflow-hidden font-mono text-sm">
            <div className="bg-fp-lightNavy px-4 py-2 flex items-center justify-between border-b border-fp-slate/20">
                <div className="flex items-center gap-2 text-fp-gold">
                    <Terminal size={16} />
                    <span className="font-bold">AGENT_LIVE_FEED :: PROCESS_ID_{leadId}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                    <span className="text-xs text-green-500">ONLINE</span>
                </div>
            </div>

            <div ref={scrollRef} className="h-96 overflow-y-auto p-4 space-y-2 scrollbar-hide">
                {logs.map((log) => (
                    <div key={log.id} className="animate-in fade-in slide-in-from-left-2 duration-300">
                        <span className="text-fp-slate opacity-50">[{new Date().toLocaleTimeString()}]</span>{" "}
                        <span className={
                            log.agent_type === "THOUGHT" ? "text-gray-400" :
                                log.agent_type === "TOOL_RESULT" ? "text-blue-400" :
                                    log.agent_type === "SYSTEM" ? "text-fp-gold font-bold" :
                                        "text-green-400"
                        }>
                            {log.agent_type}:
                        </span>{" "}
                        <span className="text-gray-200">{log.log_message}</span>
                    </div>
                ))}
                {/* Only show Thinking if agent is still active (not finished or paused) */}
                {logs.length > 0 && (() => {
                    const lastLog = logs[logs.length - 1];
                    const isFinished = lastLog.log_message.includes('✅') || lastLog.log_message.includes('PAUSED');
                    return !isFinished && (
                        <div className="flex items-center gap-2 text-fp-gold animate-pulse mt-4">
                            <Loader2 size={14} className="animate-spin" />
                            <span>Thinking...</span>
                        </div>
                    );
                })()}
            </div>
        </div>
    );
}