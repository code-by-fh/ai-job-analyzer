"use client";
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../components/AuthProvider';
import { useRouter } from 'next/navigation';

export default function AdminUsersPage() {
    const { user, token, isAuthenticated } = useAuth();
    const router = useRouter();
    const [users, setUsers] = useState<any[]>([]);

    // Create Form
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');

    useEffect(() => {
        if (!isAuthenticated) return;
        if (user && !user.is_admin) {
            router.push('/');
            return;
        }
        if (token) fetchUsers();
    }, [isAuthenticated, user, token]);

    const fetchUsers = async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setUsers(data);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ username: newUsername, password: newPassword })
            });
            if (res.ok) {
                setNewUsername('');
                setNewPassword('');
                fetchUsers();
            } else {
                alert('Fehler beim Erstellen');
            }
        } catch (e) {
            alert('Fehler');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Wirklich löschen?')) return;
        try {
            await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            fetchUsers();
        } catch (e) { console.error(e); }
    };

    if (!user || !user.is_admin) return <div className="p-8 text-center">Checking Permissions...</div>;

    return (
        <div className="max-w-4xl mx-auto p-8 text-gray-800">
            <h1 className="text-2xl font-bold mb-6">User Management</h1>
            <button onClick={() => router.push('/')} className="mb-4 text-indigo-600 hover:underline">← Zurück zum Dashboard</button>

            <div className="bg-white p-6 rounded-xl shadow mb-8">
                <h2 className="font-bold mb-4">Neuen User anlegen</h2>
                <form onSubmit={handleCreate} className="flex gap-4">
                    <input
                        className="border p-2 rounded flex-1"
                        placeholder="Username"
                        value={newUsername} onChange={e => setNewUsername(e.target.value)}
                    />
                    <input
                        className="border p-2 rounded flex-1"
                        type="password"
                        placeholder="Password"
                        value={newPassword} onChange={e => setNewPassword(e.target.value)}
                    />
                    <button className="bg-indigo-600 text-white px-4 py-2 rounded">Anlegen</button>
                </form>
            </div>

            <div className="bg-white rounded-xl shadow overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gray-50 text-left text-gray-600">
                        <tr>
                            <th className="p-4">ID</th>
                            <th className="p-4">Username</th>
                            <th className="p-4">Role</th>
                            <th className="p-4">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(u => (
                            <tr key={u.id} className="border-t">
                                <td className="p-4">{u.id}</td>
                                <td className="p-4 font-bold">{u.username}</td>
                                <td className="p-4">
                                    {u.is_admin ? <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-bold">Admin</span> : <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs">User</span>}
                                </td>
                                <td className="p-4">
                                    {!u.is_admin && (
                                        <button onClick={() => handleDelete(u.id)} className="text-red-500 hover:text-red-700 font-medium text-sm">Löschen</button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
