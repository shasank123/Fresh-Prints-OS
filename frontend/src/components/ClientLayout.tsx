"use client";

import { usePathname } from 'next/navigation';
import { AuthProvider } from '@/context/AuthContext';
import Sidebar from '@/components/Sidebar';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLoginPage = pathname === '/login';

    return (
        <AuthProvider>
            {isLoginPage ? (
                // Full screen for login page
                <>{children}</>
            ) : (
                // Normal layout with sidebar
                <div className="flex">
                    <Sidebar />
                    <main className="flex-1 ml-64 min-h-screen bg-fp-navy p-8">
                        {children}
                    </main>
                </div>
            )}
        </AuthProvider>
    );
}
