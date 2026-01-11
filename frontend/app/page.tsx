import Link from "next/link";

export default function HomePage() {
    return (
        <div className="space-y-8 max-w-6xl mx-auto">
            {/* Header */}
            <div>
                <h1 className="text-4xl font-bold text-white tracking-tight">
                    Welcome to Fresh Prints OS
                </h1>
                <p className="text-fp-slate mt-2 text-lg">
                    Your Autonomous Business Operating System
                </p>
            </div>

            {/* Agent Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Scout Agent Card */}
                <Link href="/scout" className="group">
                    <div className="bg-fp-lightNavy p-6 rounded-xl border border-white/5 hover:border-fp-gold/30 transition-all duration-300 hover:shadow-lg hover:shadow-fp-gold/5">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="h-12 w-12 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-xl">
                                🔍
                            </div>
                            <h3 className="text-white font-bold text-xl group-hover:text-fp-gold transition-colors">
                                Sales Scout
                            </h3>
                        </div>
                        <p className="text-fp-slate text-sm">
                            Autonomous lead generation & research. Discovers opportunities and drafts personalized outreach.
                        </p>
                        <div className="mt-4 flex items-center gap-2 text-fp-gold text-sm font-medium">
                            <span>Launch Agent</span>
                            <span className="group-hover:translate-x-1 transition-transform">→</span>
                        </div>
                    </div>
                </Link>

                {/* Designer Agent Card */}
                <Link href="/designer" className="group">
                    <div className="bg-fp-lightNavy p-6 rounded-xl border border-white/5 hover:border-fp-gold/30 transition-all duration-300 hover:shadow-lg hover:shadow-fp-gold/5">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="h-12 w-12 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-xl">
                                🎨
                            </div>
                            <h3 className="text-white font-bold text-xl group-hover:text-fp-gold transition-colors">
                                Designer
                            </h3>
                        </div>
                        <p className="text-fp-slate text-sm">
                            AI-powered design generation. Creates custom apparel mockups based on client preferences.
                        </p>
                        <div className="mt-4 flex items-center gap-2 text-fp-gold text-sm font-medium">
                            <span>Launch Agent</span>
                            <span className="group-hover:translate-x-1 transition-transform">→</span>
                        </div>
                    </div>
                </Link>

                {/* Logistics Agent Card */}
                <Link href="/logistics" className="group">
                    <div className="bg-fp-lightNavy p-6 rounded-xl border border-white/5 hover:border-fp-gold/30 transition-all duration-300 hover:shadow-lg hover:shadow-fp-gold/5">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="h-12 w-12 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-xl">
                                📦
                            </div>
                            <h3 className="text-white font-bold text-xl group-hover:text-fp-gold transition-colors">
                                Logistics
                            </h3>
                        </div>
                        <p className="text-fp-slate text-sm">
                            Order tracking & fulfillment management. Monitors production and delivery status.
                        </p>
                        <div className="mt-4 flex items-center gap-2 text-fp-gold text-sm font-medium">
                            <span>Launch Agent</span>
                            <span className="group-hover:translate-x-1 transition-transform">→</span>
                        </div>
                    </div>
                </Link>
            </div>

            {/* Quick Stats */}
            <div className="bg-fp-lightNavy p-6 rounded-xl border border-white/5">
                <h2 className="text-fp-slate text-sm font-medium uppercase tracking-wider mb-4">
                    System Overview
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div>
                        <div className="text-3xl font-bold text-white font-mono">3</div>
                        <div className="text-fp-slate text-sm">Active Agents</div>
                    </div>
                    <div>
                        <div className="text-3xl font-bold text-green-400 font-mono">●</div>
                        <div className="text-fp-slate text-sm">System Online</div>
                    </div>
                    <div>
                        <div className="text-3xl font-bold text-white font-mono">1.2k</div>
                        <div className="text-fp-slate text-sm">Tasks Completed</div>
                    </div>
                    <div>
                        <div className="text-3xl font-bold text-white font-mono">24/7</div>
                        <div className="text-fp-slate text-sm">Uptime</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
