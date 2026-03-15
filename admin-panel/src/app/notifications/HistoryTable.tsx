'use client';

import { useState, useEffect } from 'react';
import { useTenant } from '@/lib/tenant-context';
import { firebaseDb as db } from '@/lib/firebase';
import { collection, query, orderBy, limit, onSnapshot, QuerySnapshot, DocumentData } from 'firebase/firestore';

interface NotificationLog {
    id: string;
    type: string;
    title: string;
    body: string;
    target_type: string;
    target_driver_id: string | null;
    sent_by_user_id: string;
    total_targeted: number;
    total_success: number;
    total_failed: number;
    created_at: any;
    status: string;
}

export default function HistoryTable() {
    const { tenant } = useTenant();
    const [logs, setLogs] = useState<NotificationLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!tenant?.id) return;

        const tenantId = tenant.id === 'default' ? 'default' : tenant.id;
        const logsRef = collection(db, `tenants/${tenantId}/notification_logs`);
        const q = query(logsRef, orderBy('created_at', 'desc'), limit(50));

        const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
            const historyData: NotificationLog[] = [];
            snapshot.forEach((doc: DocumentData) => {
                historyData.push({ id: doc.id, ...doc.data() } as NotificationLog);
            });
            setLogs(historyData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching notification logs:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [tenant?.id]);

    if (loading) {
        return (
            <div className="bg-card border border-divider rounded-xl p-6 text-center text-text-muted">
                Loading history...
            </div>
        );
    }

    if (logs.length === 0) {
        return (
            <div className="bg-card border border-divider rounded-xl p-6 text-center text-text-muted">
                No notification history found.
            </div>
        );
    }

    return (
        <div className="bg-card border border-divider rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-surface text-text-muted text-xs uppercase font-semibold border-b border-divider">
                        <tr>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">Type</th>
                            <th className="px-4 py-3">Message</th>
                            <th className="px-4 py-3">Target</th>
                            <th className="px-4 py-3">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-divider/50">
                        {logs.map((log) => (
                            <tr key={log.id} className="hover:bg-surface/50 transition-colors">
                                <td className="px-4 py-3 text-text-muted whitespace-nowrap">
                                    {log.created_at?.toDate().toLocaleString() || 'N/A'}
                                </td>
                                <td className="px-4 py-3">
                                    <span className="bg-blue-500/10 text-blue-400 px-2 py-1 rounded text-xs font-medium capitalize">
                                        {log.type.replace('_', ' ')}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="font-medium text-text-main">{log.title}</div>
                                    <div className="text-text-muted truncate max-w-xs">{log.body}</div>
                                </td>
                                <td className="px-4 py-3 text-text-muted capitalize whitespace-nowrap">
                                    {log.target_type === 'specific_driver' ? `Driver: ${log.target_driver_id?.substring(0, 8)}...` : 'All Drivers'}
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                                            log.status === 'sent' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                                        }`}>
                                            {log.status === 'sent' ? 'Sent' : 'Failed'}
                                        </span>
                                        <span className="text-xs text-text-muted">
                                            {log.total_success}/{log.total_targeted}
                                        </span>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
