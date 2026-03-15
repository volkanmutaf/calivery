'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useTenant } from '@/lib/tenant-context';
import { firebaseDb as db, firebaseFunctions as functions } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Bell, Send, AlertCircle, CheckCircle2 } from 'lucide-react';
import HistoryTable from './HistoryTable';

export default function NotificationsPage() {
    const { profile } = useAuth();
    const { tenant } = useTenant();
    
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [targetType, setTargetType] = useState('all_drivers');
    const [targetDriverId, setTargetDriverId] = useState('');
    const [drivers, setDrivers] = useState<{id: string, username: string}[]>([]);
    
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        // Fetch drivers for the specific_driver dropdown
        const fetchDrivers = async () => {
            try {
                const tenantId = tenant?.id === 'default' ? 'default' : tenant?.id;
                let q = query(
                    collection(db, 'profiles'),
                    where('role', '==', 'driver'),
                    where('is_active', '==', true)
                );
                
                if (tenantId && tenantId !== 'default') {
                    q = query(q, where('tenant_id', '==', tenantId));
                }
                
                const snap = await getDocs(q);
                const fetchedDrivers = snap.docs.map((doc: any) => ({
                    id: doc.id,
                    username: doc.data().username || 'Unknown Driver'
                }));
                setDrivers(fetchedDrivers);
            } catch (err) {
                console.error("Failed to load drivers", err);
            }
        };
        
        if (tenant?.id) {
            fetchDrivers();
        }
    }, [tenant?.id]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        setSuccessMsg('');

        if (!title.trim() || !body.trim()) {
            setErrorMsg('Title and message are required.');
            return;
        }

        if (targetType === 'specific_driver' && !targetDriverId) {
            setErrorMsg('Please select a driver.');
            return;
        }

        setLoading(true);

        try {
            const sendManualNotification = httpsCallable(functions, 'sendManualNotification');
            const result = await sendManualNotification({
                tenant_id: tenant?.id,
                title,
                body,
                target_type: targetType,
                target_driver_id: targetType === 'specific_driver' ? targetDriverId : undefined,
                sender_user_id: (profile as any)?.id || 'unknown'
            });

            const data = result.data as any;
            if (data.success) {
                setSuccessMsg(`Notification sent! (${data.total_success} delivered, ${data.total_failed} failed out of ${data.total_targeted} targets)`);
                setTitle('');
                setBody('');
                setTargetDriverId('');
            } else {
                setErrorMsg('Failed to send notification.');
            }
        } catch (err: any) {
            setErrorMsg(err.message || 'An error occurred while sending the notification.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Bell className="w-6 h-6 text-indigo-500" />
                        Push Notifications
                    </h1>
                    <p className="text-text-muted mt-1">Send operational alerts and messages to your drivers.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Composer Form */}
                <div className="lg:col-span-1 border border-divider rounded-xl p-5 bg-card shadow-sm h-fit">
                    <h2 className="text-lg font-semibold mb-4 border-b border-divider pb-2 flex items-center gap-2">
                        <Send className="w-4 h-4 text-emerald-500" />
                        New Notification
                    </h2>

                    {errorMsg && (
                        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2 text-sm text-red-400">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <p>{errorMsg}</p>
                        </div>
                    )}
                    
                    {successMsg && (
                        <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-start gap-2 text-sm text-emerald-400">
                            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                            <p>{successMsg}</p>
                        </div>
                    )}

                    <form onSubmit={handleSend} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-text-muted mb-1">Title</label>
                            <input 
                                type="text"
                                className="w-full bg-surface border border-divider rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                placeholder="e.g. Action Required"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-text-muted mb-1">Message</label>
                            <textarea 
                                className="w-full bg-surface border border-divider rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                                placeholder="Enter notification message..."
                                rows={4}
                                value={body}
                                onChange={e => setBody(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-text-muted mb-1">Target</label>
                            <div className="flex bg-surface border border-divider rounded-lg p-1">
                                <button
                                    type="button"
                                    onClick={() => setTargetType('all_drivers')}
                                    className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${targetType === 'all_drivers' ? 'bg-indigo-500 text-white shadow' : 'text-text-muted hover:bg-white/5'}`}
                                >
                                    All Drivers
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTargetType('specific_driver')}
                                    className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${targetType === 'specific_driver' ? 'bg-indigo-500 text-white shadow' : 'text-text-muted hover:bg-white/5'}`}
                                >
                                    Specific Driver
                                </button>
                            </div>
                        </div>

                        {targetType === 'specific_driver' && (
                            <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                                <label className="block text-sm font-medium text-text-muted mb-1">Select Driver</label>
                                <select 
                                    className="w-full bg-surface border border-divider rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors appearance-none"
                                    value={targetDriverId}
                                    onChange={e => setTargetDriverId(e.target.value)}
                                >
                                    <option value="" disabled>Choose a driver...</option>
                                    {drivers.map(d => (
                                        <option key={d.id} value={d.id}>{d.username}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <button 
                            type="submit"
                            disabled={loading || !title.trim() || !body.trim() || (targetType === 'specific_driver' && !targetDriverId)}
                            className="w-full mt-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <span className="animate-pulse">Sending...</span>
                            ) : (
                                <>
                                    <Send className="w-4 h-4" />
                                    Send Notification
                                </>
                            )}
                        </button>
                    </form>
                </div>

                {/* History Table */}
                <div className="lg:col-span-2">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        Recent History
                    </h2>
                    <HistoryTable />
                </div>
            </div>
        </div>
    );
}
