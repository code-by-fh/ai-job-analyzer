"use client";
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface User {
    id: number;
    username: string;
    is_admin: boolean;
    is_profile_complete?: boolean;
}

interface AuthContextType {
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
    // Avoid running effect on server? It is use client, but better check window.
    const router = useRouter();

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const storedToken = localStorage.getItem('token');
            if (storedToken) {
                setToken(storedToken);
                fetchUser(storedToken);
            }
        }
    }, []);

    const fetchUser = async (authToken: string) => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/me`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (res.ok) {
                const userData = await res.json();

                // Check profile completeness
                let is_profile_complete = false;
                try {
                    const resSettings = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/settings`, {
                        headers: { 'Authorization': `Bearer ${authToken}` }
                    });
                    if (resSettings.ok) {
                        const settingsData = await resSettings.json();
                        // Profile is considered complete if a role is defined
                        if (settingsData.role && settingsData.role.trim().length > 0) {
                            is_profile_complete = true;
                        }
                    }
                } catch (e) {
                    console.warn("Failed to fetch settings for profile check", e);
                }

                setUser({ ...userData, is_profile_complete });
            } else {
                console.error("Token invalid, logging out");
                logout();
            }
        } catch (e) {
            console.error("Fetch user failed", e);
            logout();
        }
    };

    const login = (newToken: string) => {
        localStorage.setItem('token', newToken);
        setToken(newToken);
        fetchUser(newToken);
        router.push('/');
    };

    const logout = () => {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
        router.push('/login');
    };

    const refreshUser = async () => {
        if (token) {
            await fetchUser(token);
        }
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!user, refreshUser }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
