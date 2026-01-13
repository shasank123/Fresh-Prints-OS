"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Binoculars, Palette, Truck, LogOut } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/context/AuthContext";

const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard, href: "/" },
    { name: "Sales Scout", icon: Binoculars, href: "/scout" },
    { name: "Design Studio", icon: Palette, href: "/designer" },
    { name: "Logistics", icon: Truck, href: "/logistics" },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { currentRole, isAuthorized, getRoleConfig, logout } = useAuth();
    const roleConfig = getRoleConfig();

    // Filter menu items based on role
    const filteredMenuItems = menuItems.filter(item => isAuthorized(item.href));

    return (
        <aside className="w-64 h-screen bg-fp-lightNavy border-r border-fp-navy/50 fixed left-0 top-0 flex flex-col">
            <div className="p-6 border-b border-white/10">
                <h1 className="text-2xl font-bold tracking-tighter text-fp-white">
                    FRESH <span className="text-fp-gold">PRINTS</span>
                </h1>
                <p className="text-xs text-fp-slate mt-1">Autonomous Business Unit</p>
            </div>

            {/* Current User */}
            {roleConfig && (
                <div className="px-4 py-4 border-b border-white/10">
                    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg bg-gradient-to-r ${roleConfig.color} bg-opacity-20`}>
                        <span className="text-2xl">{roleConfig.icon}</span>
                        <div>
                            <div className="text-white font-medium text-sm">{roleConfig.name}</div>
                            <div className="text-white/60 text-xs">Logged In</div>
                        </div>
                    </div>
                </div>
            )}

            <nav className="flex-1 px-4 py-6 space-y-2">
                {filteredMenuItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={clsx(
                                "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group",
                                isActive
                                    ? "bg-fp-gold/10 text-fp-gold"
                                    : "text-fp-slate hover:bg-white/5 hover:text-fp-white"
                            )}
                        >
                            <item.icon size={20} className={isActive ? "text-fp-gold" : "group-hover:text-fp-white"} />
                            <span className="font-medium">{item.name}</span>
                        </Link>
                    );
                })}
            </nav>

            <div className="p-4 border-t border-white/10">
                <button
                    onClick={logout}
                    className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                    <LogOut size={20} />
                    <span>Logout</span>
                </button>
            </div>
        </aside>
    );
}
