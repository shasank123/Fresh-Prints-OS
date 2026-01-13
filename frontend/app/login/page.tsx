"use client";

import { useAuth, ROLE_CONFIG, UserRole } from '@/context/AuthContext';
import { LogIn } from 'lucide-react';

export default function LoginPage() {
    const { login } = useAuth();

    const roles: { key: UserRole; config: typeof ROLE_CONFIG[keyof typeof ROLE_CONFIG] }[] = [
        { key: 'campus_manager', config: ROLE_CONFIG.campus_manager },
        { key: 'art_director', config: ROLE_CONFIG.art_director },
        { key: 'ops_manager', config: ROLE_CONFIG.ops_manager }
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-fp-dark via-fp-navy to-fp-dark flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold">
                        <span className="text-green-400">FRESH</span>
                        <span className="text-white"> PRINTS</span>
                    </h1>
                    <p className="text-fp-slate mt-2">Autonomous Business Unit</p>
                </div>

                {/* Login Card */}
                <div className="bg-fp-lightNavy rounded-2xl p-8 border border-white/10 shadow-2xl">
                    <div className="flex items-center justify-center gap-2 mb-6">
                        <LogIn className="text-green-400" size={24} />
                        <h2 className="text-white text-xl font-bold">Select Your Role</h2>
                    </div>

                    <p className="text-fp-slate text-sm text-center mb-6">
                        Choose your role to access the relevant tools and dashboards.
                    </p>

                    <div className="space-y-3">
                        {roles.map(({ key, config }) => (
                            <button
                                key={key}
                                onClick={() => login(key)}
                                className={`w-full flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r ${config.color} hover:opacity-90 transition-all transform hover:scale-[1.02] text-white`}
                            >
                                <span className="text-3xl">{config.icon}</span>
                                <div className="text-left">
                                    <div className="font-bold text-lg">{config.name}</div>
                                    <div className="text-white/70 text-sm">
                                        {key === 'campus_manager' && 'Access Sales Scout Agent'}
                                        {key === 'art_director' && 'Access Design Studio Agent'}
                                        {key === 'ops_manager' && 'Access Logistics Agent'}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>

                    <div className="mt-6 pt-6 border-t border-white/10">
                        <p className="text-xs text-fp-slate text-center">
                            🔒 Role-based access control ensures you only see what you need.
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-fp-slate text-xs mt-6">
                    Fresh Prints OS v2.0 • Powered by AI Agents
                </p>
            </div>
        </div>
    );
}
