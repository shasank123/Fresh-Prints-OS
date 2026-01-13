"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';

// Role types
export type UserRole = 'campus_manager' | 'art_director' | 'ops_manager' | null;

// Role configuration
export const ROLE_CONFIG = {
    campus_manager: {
        name: 'Campus Manager',
        icon: '🏫',
        allowedRoutes: ['/', '/scout'],
        defaultRoute: '/scout',
        color: 'from-blue-500 to-cyan-500'
    },
    art_director: {
        name: 'Art Director',
        icon: '🎨',
        allowedRoutes: ['/', '/designer'],
        defaultRoute: '/designer',
        color: 'from-purple-500 to-pink-500'
    },
    ops_manager: {
        name: 'Operational Manager',
        icon: '📦',
        allowedRoutes: ['/', '/logistics'],
        defaultRoute: '/logistics',
        color: 'from-orange-500 to-amber-500'
    }
};

interface AuthContextType {
    currentRole: UserRole;
    login: (role: UserRole) => void;
    logout: () => void;
    isAuthorized: (route: string) => boolean;
    getRoleConfig: () => typeof ROLE_CONFIG[keyof typeof ROLE_CONFIG] | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [currentRole, setCurrentRole] = useState<UserRole>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();

    // Load role from localStorage on mount
    useEffect(() => {
        const savedRole = localStorage.getItem('fresh_prints_role') as UserRole;
        if (savedRole && ROLE_CONFIG[savedRole]) {
            setCurrentRole(savedRole);
        }
        setIsLoading(false);
    }, []);

    // Redirect to login if not authenticated
    useEffect(() => {
        if (isLoading) return;

        if (!currentRole && pathname !== '/login') {
            router.push('/login');
        }
    }, [currentRole, isLoading, pathname, router]);

    // Check route authorization
    useEffect(() => {
        if (isLoading || !currentRole || pathname === '/login') return;

        const config = ROLE_CONFIG[currentRole];
        if (!config.allowedRoutes.includes(pathname)) {
            router.push(config.defaultRoute);
        }
    }, [currentRole, pathname, isLoading, router]);

    const login = (role: UserRole) => {
        if (role && ROLE_CONFIG[role]) {
            setCurrentRole(role);
            localStorage.setItem('fresh_prints_role', role);
            router.push(ROLE_CONFIG[role].defaultRoute);
        }
    };

    const logout = () => {
        setCurrentRole(null);
        localStorage.removeItem('fresh_prints_role');
        router.push('/login');
    };

    const isAuthorized = (route: string): boolean => {
        if (!currentRole) return false;
        return ROLE_CONFIG[currentRole].allowedRoutes.includes(route);
    };

    const getRoleConfig = () => {
        if (!currentRole) return null;
        return ROLE_CONFIG[currentRole];
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-fp-dark flex items-center justify-center">
                <div className="text-white text-lg">Loading...</div>
            </div>
        );
    }

    return (
        <AuthContext.Provider value={{ currentRole, login, logout, isAuthorized, getRoleConfig }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
