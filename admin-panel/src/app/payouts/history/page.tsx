'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, orderBy, where } from 'firebase/firestore';
import { firebaseDb } from '@/lib/firebase';
import { Payout, Profile } from '@/types';
import { useAuth } from '@/lib/auth-context';
import { useTenant } from '@/lib/tenant-context';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    History,
    Search,
    Filter,
    Calendar,
    ChevronDown,
    Loader2,
    AlertCircle,
    CheckCircle2
} from 'lucide-react';
import { format } from 'date-fns';

export default function PayoutHistoryPage() {
    const { profile } = useAuth();
    const { tenantId } = useTenant();
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialDriverId = searchParams.get('driverId');

    const [loading, setLoading] = useState(true);
    const [payouts, setPayouts] = useState<Payout[]>([]);
    const [drivers, setDrivers] = useState<Record<string, Profile>>({});

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [methodFilter, setMethodFilter] = useState<'all' | Payout['method']>('all');
    // Date filter could be complex, keeping it simple for MVP: all time, this month, etc.
    // We'll just fetch recent and allow searching for now.

    useEffect(() => {
        // Enforce Admin Access
        if (profile && !['admin', 'tenant_admin'].includes(profile.role)) {
            router.replace('/');
            return;
        }

        if (profile) {
            fetchData();
        }
    }, [profile, tenantId]);

    useEffect(() => {
        if (initialDriverId && Object.keys(drivers).length > 0) {
            const d = drivers[initialDriverId];
            if (d) {
                setSearchQuery(d.username);
            }
        }
    }, [initialDriverId, drivers]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Drivers
            let driversQ = query(collection(firebaseDb, 'profiles'));
            if (tenantId && tenantId !== 'default') {
                driversQ = query(driversQ, where('tenant_id', '==', tenantId));
            }
            const driversSnap = await getDocs(driversQ);
            const driversMap: Record<string, Profile> = {};
            driversSnap.docs.forEach(doc => {
                driversMap[doc.id] = doc.data() as Profile;
            });
            setDrivers(driversMap);

            // 2. Fetch Payouts (Descending order of creation)
            let payoutsQ = query(collection(firebaseDb, 'payouts'), orderBy('created_at', 'desc'));
            if (tenantId && tenantId !== 'default') {
                payoutsQ = query(payoutsQ, where('tenant_id', '==', tenantId));
            }
            const payoutsSnap = await getDocs(payoutsQ);

            const allPayouts: Payout[] = [];
            payoutsSnap.forEach(d => {
                const data = d.data();
                allPayouts.push({
                    ...data,
                    id: d.id,
                    created_at: data.created_at?.toDate(),
                    updated_at: data.updated_at?.toDate(),
                    week_start: data.week_start?.toDate() || new Date(data.week_start),
                    week_end: data.week_end?.toDate() || new Date(data.week_end)
                } as Payout);
            });

            setPayouts(allPayouts);

        } catch (error) {
            console.error('Error fetching payout history:', error);
        } finally {
            setLoading(false);
        }
    };

    // Filter Logic
    const filteredPayouts = useMemo(() => {
        return payouts.filter(p => {
            // 1. Method Filter
            if (methodFilter !== 'all' && p.method !== methodFilter) return false;

            // 2. Search Filter (Driver Name/Email or Reference #)
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const driver = drivers[p.driver_id];
                const dName = driver ? `${driver.username}`.toLowerCase() : '';
                const dEmail = driver ? `${driver.email}`.toLowerCase() : '';
                const ref = `${p.reference || ''}`.toLowerCase();

                if (!dName.includes(q) && !dEmail.includes(q) && !ref.includes(q)) return false;
            }

            return true;
        });
    }, [payouts, drivers, methodFilter, searchQuery]);

    const totalPaidCents = filteredPayouts.reduce((acc, curr) => acc + curr.amount_cents, 0);

    if (!profile) return null;

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl">
                            <History size={24} />
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight text-white">Payout History</h1>
                    </div>
                    <p className="text-text-muted">View a complete log of all driver payments.</p>
                </div>

                <div className="bg-card/50 border border-emerald-500/30 rounded-2xl p-4 flex items-center gap-4 min-w-[250px]">
                    <div className="p-3 bg-emerald-500/10 rounded-full text-emerald-400">
                        <CheckCircle2 size={24} />
                    </div>
                    <div>
                        <div className="text-sm text-text-muted">Total in Range</div>
                        <div className="text-2xl font-bold text-emerald-400">
                            ${(totalPaidCents / 100).toFixed(2)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Controls Bar */}
            <div className="flex flex-col md:flex-row gap-4 bg-card/30 p-4 rounded-2xl border border-divider">

                {/* Method Filter */}
                <div className="relative flex-1 md:flex-none md:min-w-[200px]">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Filter size={18} className="text-text-muted" />
                    </div>
                    <select
                        className="w-full bg-background border border-divider rounded-xl pl-10 pr-10 py-2.5 text-text-main focus:outline-none focus:border-amber-500/50 appearance-none transition-colors capitalize"
                        value={methodFilter}
                        onChange={(e) => setMethodFilter(e.target.value as any)}
                    >
                        <option value="all">All Payment Methods</option>
                        <option value="zelle">Zelle</option>
                        <option value="ach">ACH / Bank Transfer</option>
                        <option value="cash">Cash</option>
                        <option value="check">Check</option>
                        <option value="stripe">Stripe</option>
                        <option value="other">Other</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <ChevronDown size={16} className="text-text-muted" />
                    </div>
                </div>

                {/* Search */}
                <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search size={18} className="text-text-muted" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search driver name or reference..."
                        className="w-full bg-background border border-divider rounded-xl pl-10 pr-4 py-2.5 text-text-main focus:outline-none focus:border-amber-500/50 transition-colors"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* Data Table */}
            <div className="bg-card border border-divider rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-surface/50 border-b border-divider text-xs uppercase tracking-wider text-text-muted font-semibold">
                                <th className="p-4 pl-6">Payout Date</th>
                                <th className="p-4">Driver</th>
                                <th className="p-4 text-right">Amount</th>
                                <th className="p-4 text-center">Method</th>
                                <th className="p-4">Reference</th>
                                <th className="p-4">Admin</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-divider/50">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="p-12 text-center">
                                        <div className="flex flex-col items-center justify-center text-text-muted gap-3">
                                            <Loader2 className="animate-spin text-amber-500" size={32} />
                                            <p>Loading payout history...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredPayouts.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-12 text-center">
                                        <div className="flex flex-col items-center justify-center text-text-muted gap-3">
                                            <AlertCircle size={32} />
                                            <p>No payouts found matching your filters.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredPayouts.map(payout => {
                                    const driver = drivers[payout.driver_id];
                                    const driverName = driver?.username || 'Unknown Driver';

                                    return (
                                        <tr key={payout.id} className="hover:bg-surface/30 transition-colors">
                                            <td className="p-4 pl-6">
                                                <div className="text-text-main font-medium">
                                                    {payout.created_at ? format(payout.created_at, 'MMM d, yyyy') : 'Unknown Date'}
                                                </div>
                                                <div className="text-xs text-text-muted mt-0.5 flex items-center gap-1">
                                                    <Calendar size={12} />
                                                    For {payout.week_start ? format(payout.week_start, 'MMM d') : '?'} - {payout.week_end ? format(payout.week_end, 'MMM d') : '?'}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-surface border border-divider flex items-center justify-center overflow-hidden shrink-0">
                                                        {driver?.photo_url ? (
                                                            <img src={driver.photo_url} alt={driverName} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <span className="text-text-muted text-xs font-bold tracking-wider">
                                                                {driverName.substring(0, 2).toUpperCase()}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="font-medium text-text-main">{driverName}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-right">
                                                <span className="font-bold text-emerald-400">
                                                    ${(payout.amount_cents / 100).toFixed(2)}
                                                </span>
                                            </td>
                                            <td className="p-4 text-center">
                                                <span className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-bold border rounded-full bg-surface text-text-main border-divider capitalize">
                                                    {payout.method}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                {payout.reference ? (
                                                    <span className="text-text-main text-sm font-mono bg-background px-2 py-1 rounded border border-divider">
                                                        {payout.reference}
                                                    </span>
                                                ) : (
                                                    <span className="text-text-muted text-sm italic">None</span>
                                                )}
                                                {payout.note && (
                                                    <div className="text-xs text-text-muted mt-1 max-w-[200px] truncate" title={payout.note}>
                                                        {payout.note}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-4 text-text-muted text-sm">
                                                {payout.created_by}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    );
}
