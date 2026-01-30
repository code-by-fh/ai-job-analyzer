"use client";
import React, { useState } from 'react';

export default function PasswordChangeForm({ token }: { token: string | null }) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [status, setStatus] = useState('');
    const [loading, setLoading] = useState(false);

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setStatus('');

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/change-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
            });

            if (res.ok) {
                setStatus('Passwort erfolgreich geändert! ✅');
                setCurrentPassword('');
                setNewPassword('');
            } else {
                const data = await res.json();
                setStatus(`Fehler: ${data.detail || 'Konnte Passwort nicht ändern'}`);
            }
        } catch (e) {
            setStatus('Netzwerkfehler');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleChangePassword} className="space-y-3 max-w-sm">
            <div>
                <input
                    type="password"
                    placeholder="Aktuelles Passwort"
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    className="w-full border border-slate-300 p-2 rounded text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                />
            </div>
            <div>
                <input
                    type="password"
                    placeholder="Neues Passwort"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full border border-slate-300 p-2 rounded text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                />
            </div>
            <button
                type="submit"
                disabled={loading || !currentPassword || !newPassword}
                className="bg-slate-800 text-white px-4 py-2 rounded text-sm font-bold hover:bg-black transition disabled:opacity-50"
            >
                {loading ? '...' : 'Passwort ändern'}
            </button>
            {status && <p className={`text-xs mt-2 ${status.includes('Fehler') ? 'text-red-500' : 'text-green-600'}`}>{status}</p>}
        </form>
    );
}
