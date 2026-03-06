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
    login: () => void;
    logout: () => void;
    isAuthenticated: boolean;
    refreshUser: () => Promise<void>;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    token: null,
    login: () => { },
    logout: () => { },
    isAuthenticated: false,
    refreshUser: async () => { },
    isLoading: true,
});

// Wrapper around fetch that automatically retries after a /auth/refresh on 401
export async function fetchWithAuth(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
    const opts: RequestInit = { ...init, credentials: 'include' };
    let res = await fetch(input, opts);
    if (res.status === 401) {
        // Attempt token refresh
        const refreshRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
        });
        if (refreshRes.ok) {
            res = await fetch(input, opts);
        }
    }
    return res;
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    // token is used as an auth sentinel: null = not authenticated, "__session__" = authenticated
    // This preserves all existing `if (!token)` guard checks across the codebase without
    // changing hook signatures.
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    const logout = useCallback(async () => {
        try {
            await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/logout`, {
                method: 'POST',
                credentials: 'include',
            });
        } catch { }
        setToken(null);
        setUser(null);
        router.push('/login');
    }, [router]);

    const fetchUserData = useCallback(async (): Promise<boolean> => {
        setIsLoading(true);
        try {
            const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/me`);
            if (!res.ok) {
                setToken(null);
                setUser(null);
                setIsLoading(false);
                return false;
            }
            const userData = await res.json();

            let is_profile_complete = false;
            try {
                const resSettings = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/settings`);
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
            setToken("__session__");
            setIsLoading(false);
            return true;
        } catch (e) {
            logger.error({ err: e }, "Fetch user failed");
            setToken(null);
            setUser(null);
            setIsLoading(false);
            return false;
        }
    }, []);

    // On mount: probe /me to restore session from existing cookie
    useEffect(() => {
        fetchUserData();
    }, [fetchUserData]);

    const login = useCallback(() => {
        fetchUserData().then(ok => {
            if (ok) router.push('/');
        });
    }, [fetchUserData, router]);

    const refreshUser = useCallback(async () => {
        await fetchUserData();
    }, [fetchUserData]);

    const contextValue = useMemo(() => ({
        user,
        token,
        login,
        logout,
        isAuthenticated: !!user,
        refreshUser,
        isLoading
    }), [user, token, login, logout, refreshUser, isLoading]);

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
