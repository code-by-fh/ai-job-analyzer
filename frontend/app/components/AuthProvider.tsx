"use client";
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { logger } from '../lib/logger';

interface User {
    id: number;
    username: string;
    is_admin: boolean;
    is_profile_complete?: boolean;
}

export interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (token: string) => void;
    logout: () => void;

    isAuthenticated: boolean;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    token: null,
    login: () => { },
    logout: () => { },

    isAuthenticated: false,
    refreshUser: async () => { }
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const router = useRouter();

    const logout = useCallback(() => {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
        router.push('/login');
    }, [router]);

    const fetchUserWithLogout = useCallback(async (authToken: string) => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/me`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (res.ok) {
                const userData = await res.json();

                let is_profile_complete = false;
                try {
                    const resSettings = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/settings`, {
                        headers: { 'Authorization': `Bearer ${authToken}` }
                    });
                    if (resSettings.ok) {
                        const settingsData = await resSettings.json();
                        if (settingsData.role && settingsData.role.trim().length > 0) {
                            is_profile_complete = true;
                        }
                    }
                } catch (e) {
                    logger.warn({ err: e }, "Failed to fetch settings for profile check");
                }

                setUser({ ...userData, is_profile_complete });
            } else {
                logger.error("Token invalid, logging out");
                logout();
            }
        } catch (e) {
            logger.error({ err: e }, "Fetch user failed");
            logout();
        }
    }, [logout]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const storedToken = localStorage.getItem('token');
            if (storedToken) {
                setToken(storedToken);
                fetchUserWithLogout(storedToken);
            }
        }
    }, [fetchUserWithLogout]);

    const login = useCallback((newToken: string) => {
        localStorage.setItem('token', newToken);
        setToken(newToken);
        fetchUserWithLogout(newToken);
        router.push('/');
    }, [fetchUserWithLogout, router]);

    const refreshUser = useCallback(async () => {
        if (token) {
            await fetchUserWithLogout(token);
        }
    }, [token, fetchUserWithLogout]);

    const contextValue = useMemo(() => ({
        user,
        token,
        login,
        logout,
        isAuthenticated: !!user,
        refreshUser
    }), [user, token, login, logout, refreshUser]);

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
