'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, orderBy, Timestamp, where } from 'firebase/firestore';
import { firebaseDb } from '@/lib/firebase';
import { EarningsWeekly, Profile } from '@/types';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import {
    Banknote,
    Search,
    Filter,
    Calendar,
    ChevronDown,
    Loader2,
    AlertCircle,
    CheckCircle2,
    Clock,
    FileText
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, subWeeks, parseISO } from 'date-fns';
import PayModal from '@/components/PayModal';

import { useTenant } from '@/lib/tenant-context';

export default function WeeklyPayrollPage() {
    const { profile } = useAuth();
    const { tenantId } = useTenant();
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [earnings, setEarnings] = useState<EarningsWeekly[]>([]);
    const [drivers, setDrivers] = useState<Record<string, Profile>>({});

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'paid'>('all');
    // Using a simple week selector for MVP. In reality, you'd want a custom range or a dropdown of recent weeks.
    // Let's create a list of the last 4 weeks
    const recentWeeks = useMemo(() => {
        const weeks = [];
        const today = new Date();
        for (let i = 0; i < 4; i++) {
            const date = subWeeks(today, i);
            // Assuming Monday start based on standard business week
            const start = startOfWeek(date, { weekStartsOn: 1 });
            const end = endOfWeek(date, { weekStartsOn: 1 });
            weeks.push({
                label: i === 0 ? 'This Week' : i === 1 ? 'Last Week' : format(start, 'MMM d'),
                startStr: format(start, 'yyyy-MM-dd'),
                endStr: format(end, 'yyyy-MM-dd'),
                startDt: start,
                endDt: end
            });
        }
        return weeks;
    }, []);

    const [selectedWeekIdx, setSelectedWeekIdx] = useState(0);

    // Pay Modal State
    const [payModalOpen, setPayModalOpen] = useState(false);
    const [selectedEarnDoc, setSelectedEarnDoc] = useState<EarningsWeekly | null>(null);

    useEffect(() => {
        // Enforce Admin Access (Basic frontend check, actual security is in Firestore rules/middleware)
        // Note: Allowing tenant_admins or admins. Since profile might not have tenant structure easily available here,
        // layout.tsx already protects standard users.
        if (profile && !['admin', 'tenant_admin'].includes(profile.role)) {
            router.replace('/');
            return;
        }

        if (profile) {
            fetchData();
        }
    }, [profile, selectedWeekIdx, tenantId]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const currentWeek = recentWeeks[selectedWeekIdx];

            // 1. Fetch Drivers to map names
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

            // 2. Fetch Earnings Weekly. 
            let earnsQ = query(collection(firebaseDb, 'earnings_weekly'), orderBy('week_start_date', 'desc'));
            if (tenantId && tenantId !== 'default') {
                earnsQ = query(earnsQ, where('tenant_id', '==', tenantId));
            }
            const earningsSnap = await getDocs(earnsQ);

            const allEarns: EarningsWeekly[] = [];
            earningsSnap.forEach(d => {
                allEarns.push({ id: d.id, ...d.data() } as EarningsWeekly);
            });

            setEarnings(allEarns);

        } catch (error) {
            console.error('Error fetching payroll data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Filter Logic
    const filteredEarnings = useMemo(() => {
        const currentWeek = recentWeeks[selectedWeekIdx];

        return earnings.filter(e => {
            // 1. Week Filter
            if (e.week_start_date !== currentWeek.startStr) return false;

            // 2. Status Filter
            const paidOut = e.paid_out_cents || 0;
            const totalCents = Math.round((e.total_earnings || 0) * 100);
            const isFullyPaid = paidOut >= totalCents;
            // Provide a default 'open' if status missing
            const currentStatus = isFullyPaid ? 'paid' : (e.status || 'open');

            if (statusFilter === 'open' && isFullyPaid) return false;
            if (statusFilter === 'paid' && !isFullyPaid) return false;

            // 3. Search Filter
            if (searchQuery) {
                const driver = drivers[e.driver_id];
                if (!driver) return false;

                const q = searchQuery.toLowerCase();
                const name = `${driver.username || ''}`.toLowerCase();
                const email = `${driver.email || ''}`.toLowerCase();

                if (!name.includes(q) && !email.includes(q)) return false;
            }

            return true;
        });
    }, [earnings, drivers, selectedWeekIdx, statusFilter, searchQuery, recentWeeks]);

    // Summary Calculations
    const totalNetCents = filteredEarnings.reduce((acc, curr) => acc + Math.round((curr.total_earnings || 0) * 100), 0);
    const totalPaidCents = filteredEarnings.reduce((acc, curr) => acc + (curr.paid_out_cents || 0), 0);
    const outstandingCents = totalNetCents - totalPaidCents;

    const handlePayClick = (earnDoc: EarningsWeekly) => {
        setSelectedEarnDoc(earnDoc);
        setPayModalOpen(true);
    };

    if (!profile) return null;

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl">
                            <Banknote size={24} />
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight text-white">Weekly Payroll</h1>
                    </div>
                    <p className="text-text-muted">Manage driver payouts and track outstanding balances.</p>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Total Net */}
                <div className="bg-card/50 border border-divider/50 rounded-2xl p-6">
                    <div className="flex items-center gap-3 text-text-muted mb-2">
                        <FileText size={18} />
                        <h3 className="font-medium">Total Net Income</h3>
                    </div>
                    <div className="text-3xl font-bold text-white">
                        ${(totalNetCents / 100).toFixed(2)}
                    </div>
                </div>

                {/* Total Paid */}
                <div className="bg-card/50 border border-emerald-500/30 rounded-2xl p-6">
                    <div className="flex items-center gap-3 text-emerald-400 mb-2">
                        <CheckCircle2 size={18} />
                        <h3 className="font-medium">Total Paid Out</h3>
                    </div>
                    <div className="text-3xl font-bold text-emerald-400">
                        ${(totalPaidCents / 100).toFixed(2)}
                    </div>
                </div>

                {/* Outstanding */}
                <div className="bg-card/50 border border-amber-500/30 rounded-2xl p-6">
                    <div className="flex items-center gap-3 text-amber-400 mb-2">
                        <Clock size={18} />
                        <h3 className="font-medium">Outstanding Balance</h3>
                    </div>
                    <div className="text-3xl font-bold text-amber-400">
                        ${(outstandingCents / 100).toFixed(2)}
                    </div>
                </div>
            </div>

            {/* Controls Bar */}
            <div className="flex flex-col md:flex-row gap-4 bg-card/30 p-4 rounded-2xl border border-divider">
                {/* Week Selector */}
                <div className="relative flex-1 md:flex-none md:min-w-[200px]">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Calendar size={18} className="text-text-muted" />
                    </div>
                    <select
                        className="w-full bg-background border border-divider rounded-xl pl-10 pr-10 py-2.5 text-text-main focus:outline-none focus:border-amber-500/50 appearance-none transition-colors"
                        value={selectedWeekIdx}
                        onChange={(e) => setSelectedWeekIdx(Number(e.target.value))}
                    >
                        {recentWeeks.map((w, idx) => (
                            <option key={w.startStr} value={idx}>
                                {w.label} ({format(parseISO(w.startStr), 'MMM d')} - {format(parseISO(w.endStr), 'MMM d')})
                            </option>
                        ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <ChevronDown size={16} className="text-text-muted" />
                    </div>
                </div>

                {/* Status Filter */}
                <div className="relative flex-1 md:flex-none md:min-w-[150px]">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Filter size={18} className="text-text-muted" />
                    </div>
                    <select
                        className="w-full bg-background border border-divider rounded-xl pl-10 pr-10 py-2.5 text-text-main focus:outline-none focus:border-amber-500/50 appearance-none transition-colors"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                    >
                        <option value="all">All Status</option>
                        <option value="open">Open / Unpaid</option>
                        <option value="paid">Fully Paid</option>
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
                        placeholder="Search specific driver..."
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
                                <th className="p-4 pl-6">Driver</th>
                                <th className="p-4 text-right">Net Income</th>
                                <th className="p-4 text-right">Paid So Far</th>
                                <th className="p-4 text-right">Outstanding</th>
                                <th className="p-4 text-center">Status</th>
                                <th className="p-4 pr-6 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-divider/50">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="p-12 text-center">
                                        <div className="flex flex-col items-center justify-center text-text-muted gap-3">
                                            <Loader2 className="animate-spin text-amber-500" size={32} />
                                            <p>Loading payroll data...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredEarnings.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-12 text-center">
                                        <div className="flex flex-col items-center justify-center text-text-muted gap-3">
                                            <AlertCircle size={32} />
                                            <p>No payroll records found for this week.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredEarnings.map(earn => {
                                    const driver = drivers[earn.driver_id];
                                    const driverName = driver?.username || 'Unknown Driver';

                                    const netCents = Math.round((earn.total_earnings || 0) * 100);
                                    const paidCents = earn.paid_out_cents || 0;
                                    const outCents = Math.max(0, netCents - paidCents);

                                    const isPaid = paidCents >= netCents && netCents > 0;
                                    const statusLabel = isPaid ? 'Paid' : 'Open';

                                    return (
                                        <tr key={earn.id} className="hover:bg-surface/30 transition-colors">
                                            <td className="p-4 pl-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-surface border border-divider flex items-center justify-center overflow-hidden shrink-0">
                                                        {driver?.photo_url ? (
                                                            <img src={driver.photo_url} alt={driverName} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <span className="text-text-muted font-bold tracking-wider">
                                                                {driverName.substring(0, 2).toUpperCase()}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-text-main">{driverName}</p>
                                                        {driver?.email && <p className="text-xs text-text-muted">{driver.email}</p>}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4 text-right font-medium text-text-main">
                                                ${(netCents / 100).toFixed(2)}
                                            </td>
                                            <td className="p-4 text-right text-text-muted">
                                                ${(paidCents / 100).toFixed(2)}
                                            </td>
                                            <td className="p-4 text-right">
                                                {outCents > 0 ? (
                                                    <span className="font-bold text-amber-400">${(outCents / 100).toFixed(2)}</span>
                                                ) : (
                                                    <span className="text-emerald-500 font-medium">$0.00</span>
                                                )}
                                            </td>
                                            <td className="p-4 text-center">
                                                <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold border ${isPaid
                                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                    }`}>
                                                    {statusLabel}
                                                </span>
                                            </td>
                                            <td className="p-4 pr-6 text-right">
                                                {!isPaid && outCents > 0 ? (
                                                    <button
                                                        onClick={() => handlePayClick(earn)}
                                                        className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg shadow-sm shadow-emerald-500/20 transition-all active:scale-95"
                                                    >
                                                        Pay Now
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => router.push(`/payouts/history?driverId=${earn.driver_id}`)}
                                                        className="px-4 py-1.5 bg-surface hover:bg-surface-hover text-text-main border border-divider text-sm font-medium rounded-lg transition-all"
                                                    >
                                                        History
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pay Modal Mount */}
            {selectedEarnDoc && (
                <PayModal
                    isOpen={payModalOpen}
                    onClose={() => setPayModalOpen(false)}
                    driverId={selectedEarnDoc.driver_id}
                    driverName={drivers[selectedEarnDoc.driver_id]?.username || 'Unknown Driver'}
                    weekStart={parseISO(selectedEarnDoc.week_start_date)}
                    weekEnd={parseISO(selectedEarnDoc.week_end_date)}
                    earningsWeeklyId={selectedEarnDoc.id}
                    outstandingAmountCents={Math.round((selectedEarnDoc.total_earnings || 0) * 100) - (selectedEarnDoc.paid_out_cents || 0)}
                    onSuccess={() => {
                        fetchData(); // Refresh UI after payment
                    }}
                />
            )}

        </div>
    );
}
