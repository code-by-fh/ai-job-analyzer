"use client";
import React, { useState } from 'react';
import { useAuth } from '../components/AuthProvider';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const params = new URLSearchParams();
        params.append('username', username);
        params.append('password', password);

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params
            });

            if (res.ok) {
                const data = await res.json();
                login(data.access_token);
            } else {
                setError('Login fehlgeschlagen. Bitte prüfen Sie Ihre Daten.');
            }
        } catch (e) {
            setError('Login Server Fehler.');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
                <div className="flex justify-center mb-4">
                    <span className="text-4xl">🤖</span>
                </div>
                <h1 className="text-2xl font-bold mb-6 text-center text-gray-900">Willkommen zurück</h1>
                {error && <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm">{error}</div>}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            className="w-full mt-1 p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition text-black"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full mt-1 p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition text-black"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full bg-indigo-600 text-white py-2 rounded-lg font-bold hover:bg-indigo-700 transition"
                    >
                        Login
                    </button>
                    {/* HINT: Default Admin is admin/admin */}
                    <div className="text-center text-xs text-gray-400 mt-4">
                        (Default: admin / admin)
                    </div>
                </form>
            </div>
        </div>
    );
}
