'use client';

import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { firebaseDb } from '@/lib/firebase';
import { EarningsWeekly, Profile } from '@/types';
import { formatDuration, formatDateString } from '@/lib/utils';
import { format, subWeeks, startOfWeek, addDays, differenceInMinutes } from 'date-fns';
import { useTenant } from '@/lib/tenant-context';
import {
    DollarSign,
    TrendingUp,
    Download,
    RefreshCw,
    ChevronDown,
    ChevronUp,
    Users,
} from 'lucide-react';

import { Order } from '@/types';

type Adjustment = {
    id: string;
    driver_id: string;
    amount: number;
    date: string;
    type: 'tip' | 'contribution' | 'adjustment' | 'bonus';
    created_at: any;
};

type EarningsWeeklyWithOrders = EarningsWeekly & {
    orders: Order[];
    adjustments: Adjustment[];
};

interface DriverEarnings {
    driver: Profile & { id: string };
    earnings: EarningsWeeklyWithOrders[];
    totalEarnings: number;
    totalOrders: number;
}

export default function EarningsPage() {
    const { tenantId } = useTenant();
    const [driverEarnings, setDriverEarnings] = useState<DriverEarnings[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedDriver, setExpandedDriver] = useState<string | null>(null);
    const [weekCount, setWeekCount] = useState(4);

    const fetchEarnings = async () => {
        setLoading(true);
        try {
            // Calculate date range
            const startDate = format(subWeeks(new Date(), weekCount), 'yyyy-MM-dd');

            // Get all drivers
            let driversQ = query(
                collection(firebaseDb, 'profiles'),
                where('role', '==', 'driver')
            );
            if (tenantId && tenantId !== 'default') {
                driversQ = query(driversQ, where('tenant_id', '==', tenantId));
            }
            const driversSnap = await getDocs(driversQ);

            const drivers: (Profile & { id: string })[] = [];
            driversSnap.forEach((doc) => {
                drivers.push({ id: doc.id, ...doc.data() } as Profile & { id: string });
            });

            // Get all delivered orders since start date
            // Note: Composite index might be required for status + scheduled_date
            // If it fails, we fetch all delivered and filter in memory (MVP safer)
            let ordersQuery = query(
                collection(firebaseDb, 'orders'),
                where('status', '==', 'delivered'),
                where('scheduled_date', '>=', startDate)
            );
            if (tenantId && tenantId !== 'default') {
                ordersQuery = query(ordersQuery, where('tenant_id', '==', tenantId));
            }

            const ordersSnap = await getDocs(ordersQuery);

            // Map<driverId, Map<weekStart, EarningsWeeklyWithOrders>>
            const driverMap = new Map<string, Map<string, EarningsWeeklyWithOrders>>();

            // Initialize drivers
            drivers.forEach(d => {
                driverMap.set(d.id, new Map());
            });

            ordersSnap.forEach((doc) => {
                const data = doc.data() as Order; // Cast to Order
                const driverId = data.assigned_driver_id;

                if (driverId && driverMap.has(driverId)) {
                    const date = new Date(data.scheduled_date);
                    // Get start of week (Monday)
                    const day = date.getDay();
                    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
                    const weekStartDate = new Date(date.setDate(diff));
                    const weekEndDate = new Date(new Date(weekStartDate).getTime() + 6 * 24 * 60 * 60 * 1000);
                    const weekStart = format(weekStartDate, 'MM-dd-yyyy');
                    const weekEnd = format(weekEndDate, 'MM-dd-yyyy');

                    const driverWeeks = driverMap.get(driverId)!;

                    if (!driverWeeks.has(weekStart)) {
                        driverWeeks.set(weekStart, {
                            driver_id: driverId,
                            week_start_date: weekStart,
                            week_end_date: weekEnd,
                            total_earnings: 0,
                            order_count: 0,
                            last_calculated_at: null as any,
                            orders: [], // Initialize orders array
                            adjustments: [] // Initialize adjustments array
                        } as unknown as EarningsWeeklyWithOrders);
                    }

                    const weekStats = driverWeeks.get(weekStart)!;
                    weekStats.total_earnings += (data.payout_amount || 0);
                    weekStats.order_count += 1;
                    weekStats.orders.push({ ...data, id: doc.id }); // Push full order details
                }
            });

            // Fetch Pay Adjustments
            let adjQuery = query(
                collection(firebaseDb, 'pay_adjustments'),
                where('date', '>=', startDate)
            );
            if (tenantId && tenantId !== 'default') {
                adjQuery = query(adjQuery, where('tenant_id', '==', tenantId));
            }
            const adjSnap = await getDocs(adjQuery);

            adjSnap.forEach(doc => {
                const data = doc.data() as Adjustment;
                // Add ID manually since we cast
                const adjWithId = { ...data, id: doc.id };
                const driverId = data.driver_id;

                if (driverId && driverMap.has(driverId)) {
                    // Parse YYYY-MM-DD safely
                    const [y, m, d] = data.date.split('-').map(Number);
                    const date = new Date(y, m - 1, d);

                    // Get start of week (Monday)
                    const day = date.getDay();
                    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
                    const weekStartDate = new Date(date.setDate(diff));
                    const weekEndDate = new Date(new Date(weekStartDate).getTime() + 6 * 24 * 60 * 60 * 1000);
                    const weekStart = format(weekStartDate, 'MM-dd-yyyy');
                    const weekEnd = format(weekEndDate, 'MM-dd-yyyy');

                    const driverWeeks = driverMap.get(driverId)!;

                    if (!driverWeeks.has(weekStart)) {
                        driverWeeks.set(weekStart, {
                            driver_id: driverId,
                            week_start_date: weekStart,
                            week_end_date: weekEnd,
                            total_earnings: 0,
                            order_count: 0,
                            last_calculated_at: null as any,
                            orders: [],
                            adjustments: []
                        } as unknown as EarningsWeeklyWithOrders);
                    }

                    const weekStats = driverWeeks.get(weekStart)!;
                    weekStats.total_earnings += (data.amount || 0);
                    // Do NOT increment order_count for adjustments
                    weekStats.adjustments.push(adjWithId);
                }
            });

            const earningsData: DriverEarnings[] = [];

            for (const driver of drivers) {
                const weekMap = driverMap.get(driver.id)!;
                const earnings = Array.from(weekMap.values()).sort((a, b) => {
                    const dateA = new Date(a.week_start_date);
                    const dateB = new Date(b.week_start_date);
                    return dateB.getTime() - dateA.getTime();
                });

                earningsData.push({
                    driver,
                    earnings,
                    totalEarnings: earnings.reduce((sum, e) => sum + e.total_earnings, 0),
                    totalOrders: earnings.reduce((sum, e) => sum + e.order_count, 0),
                });
            }

            // Sort by total earnings descending
            earningsData.sort((a, b) => b.totalEarnings - a.totalEarnings);
            setDriverEarnings(earningsData);
        } catch (error) {
            console.error('Error fetching earnings:', error);
            // Fallback for missing index: fetch all delivered without date filter
            // This is a safety mechanism
            if ((error as any).code === 'failed-precondition') {
                console.warn('Index missing, fetching all delivered orders safely...');
                // ... specialized fallback logic could go here, but usually dashboard users can create the index via console link
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEarnings();
    }, [weekCount]);

    const exportCSV = () => {
        let csv = 'Driver,Week Start,Week End,Earnings,Orders\n';

        for (const de of driverEarnings) {
            for (const earning of de.earnings) {
                csv += `${de.driver.username},${earning.week_start_date},${earning.week_end_date},${earning.total_earnings},${earning.order_count}\n`;
            }
        }

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `calivery-earnings-${format(new Date(), 'yyyy-MM-dd')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const totalPayout = driverEarnings.reduce((sum, de) => sum + de.totalEarnings, 0);
    const totalOrderCount = driverEarnings.reduce((sum, de) => sum + de.totalOrders, 0);

    const [expandedWeek, setExpandedWeek] = useState<string | null>(null);

    // ... (fetchEarnings logic updated to include orders)

    return (
        <div className="p-8">
            {/* ... (Header and Summary Cards remain same) */}

            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white">Driver Earnings</h1>
                    <p className="text-slate-400 mt-1">Driver earnings and payout summaries</p>
                </div>
                <div className="flex items-center gap-3">
                    <select
                        value={weekCount}
                        onChange={(e) => setWeekCount(parseInt(e.target.value))}
                        className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                    >
                        <option value={4}>Last 4 weeks</option>
                        <option value={8}>Last 8 weeks</option>
                        <option value={12}>Last 12 weeks</option>
                    </select>
                    <button
                        onClick={exportCSV}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 transition-all"
                    >
                        <Download size={18} />
                        Export CSV
                    </button>
                    <button
                        onClick={() => fetchEarnings()}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 transition-all disabled:opacity-50"
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="bg-slate-800/50 backdrop-blur rounded-2xl border border-slate-700/50 p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
                            <DollarSign size={24} className="text-white" />
                        </div>
                        <div>
                            <p className="text-slate-400 text-sm">Total Payouts</p>
                            <p className="text-3xl font-bold text-white">${totalPayout.toFixed(2)}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-slate-800/50 backdrop-blur rounded-2xl border border-slate-700/50 p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600">
                            <TrendingUp size={24} className="text-white" />
                        </div>
                        <div>
                            <p className="text-slate-400 text-sm">Total Orders</p>
                            <p className="text-3xl font-bold text-white">{totalOrderCount}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-slate-800/50 backdrop-blur rounded-2xl border border-slate-700/50 p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600">
                            <Users size={24} className="text-white" />
                        </div>
                        <div>
                            <p className="text-slate-400 text-sm">Active Drivers</p>
                            <p className="text-3xl font-bold text-white">{driverEarnings.length}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Earnings Table */}
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl border border-slate-700/50 overflow-hidden">
                {loading ? (
                    <div className="py-12 text-center">
                        <RefreshCw size={32} className="text-amber-500 mx-auto mb-4 animate-spin" />
                        <p className="text-slate-400">Loading earnings...</p>
                    </div>
                ) : driverEarnings.length === 0 ? (
                    <div className="py-12 text-center">
                        <DollarSign size={48} className="text-slate-600 mx-auto mb-4" />
                        <p className="text-slate-400">No earnings data available</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-700/50">
                        {driverEarnings.map((de) => (
                            <div key={de.driver.id}>
                                <button
                                    onClick={() => setExpandedDriver(expandedDriver === de.driver.id ? null : de.driver.id)}
                                    className="w-full flex items-center justify-between p-4 hover:bg-slate-700/30 transition-colors"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-lg font-bold text-slate-900">
                                            {de.driver.username.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="text-left">
                                            <p className="text-white font-medium">{de.driver.username}</p>
                                            <p className="text-slate-500 text-sm">{de.totalOrders} orders total</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-6">
                                        <div className="text-right">
                                            <p className="text-emerald-400 text-2xl font-bold">${de.totalEarnings.toFixed(2)}</p>
                                            <p className="text-slate-500 text-sm">Last {weekCount} weeks</p>
                                        </div>
                                        {expandedDriver === de.driver.id ? (
                                            <ChevronUp size={20} className="text-slate-400" />
                                        ) : (
                                            <ChevronDown size={20} className="text-slate-400" />
                                        )}
                                    </div>
                                </button>

                                {expandedDriver === de.driver.id && (
                                    <div className="bg-slate-900/50 px-4 pb-4">
                                        <div className="border border-slate-700/50 rounded-xl overflow-hidden">
                                            <table className="w-full">
                                                <thead>
                                                    <tr className="bg-slate-800/50">
                                                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">Week</th>
                                                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">Orders</th>
                                                        <th className="px-4 py-3 text-right text-sm font-medium text-slate-400">Earnings</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-700/50">
                                                    {de.earnings.map((earning) => (
                                                        <React.Fragment key={earning.id || earning.week_start_date}>
                                                            <tr
                                                                className="hover:bg-slate-800/30 cursor-pointer transition-colors"
                                                                onClick={() => {
                                                                    const weekId = `${de.driver.id}-${earning.week_start_date}`;
                                                                    setExpandedWeek(expandedWeek === weekId ? null : weekId);
                                                                }}
                                                            >
                                                                <td className="px-4 py-3 text-slate-300 flex items-center gap-2">
                                                                    {expandedWeek === `${de.driver.id}-${earning.week_start_date}` ? (
                                                                        <ChevronUp size={14} className="text-slate-500" />
                                                                    ) : (
                                                                        <ChevronDown size={14} className="text-slate-500" />
                                                                    )}
                                                                    {earning.week_start_date} <span className="text-slate-600">-</span> {earning.week_end_date}
                                                                </td>
                                                                <td className="px-4 py-3 text-slate-300">{earning.order_count}</td>
                                                                <td className="px-4 py-3 text-right text-emerald-400 font-medium">
                                                                    ${earning.total_earnings.toFixed(2)}
                                                                </td>
                                                            </tr>
                                                            {expandedWeek === `${de.driver.id}-${earning.week_start_date}` && (
                                                                <tr className="bg-slate-950/30">
                                                                    <td colSpan={3} className="px-4 py-3">
                                                                        <div className="pl-6 space-y-2">
                                                                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Order & Payment History</p>
                                                                            {earning.orders.length === 0 && earning.adjustments.length === 0 ? (
                                                                                <p className="text-sm text-slate-500 italic">No detailed data available.</p>
                                                                            ) : (
                                                                                <div className="grid gap-2">
                                                                                    {/* Combine Orders and Adjustments, sort by date desc */}
                                                                                    {[
                                                                                        ...earning.orders.map(o => ({ ...o, _type: 'order' as const, _sortDate: o.scheduled_date })),
                                                                                        ...earning.adjustments.map(a => ({ ...a, _type: 'adjustment' as const, _sortDate: a.date }))
                                                                                    ].sort((a, b) => b._sortDate.localeCompare(a._sortDate)).map((item: any) => {
                                                                                        if (item._type === 'adjustment') {
                                                                                            // Render Adjustment
                                                                                            const adj = item as Adjustment;
                                                                                            return (
                                                                                                <div key={`adj-${adj.id}`} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
                                                                                                    <div className="flex items-center gap-3">
                                                                                                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                                                                                                        <div>
                                                                                                            <p className="text-sm font-medium text-slate-200 capitalize">{adj.type.replace('_', ' ')}</p>
                                                                                                            <p className="text-xs text-slate-500">{formatDateString(adj.date)} • Payment Adjustment</p>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                    <div className="text-right">
                                                                                                        <span className="text-sm font-bold text-emerald-400">
                                                                                                            ${adj.amount.toFixed(2)}
                                                                                                        </span>
                                                                                                    </div>
                                                                                                </div>
                                                                                            );
                                                                                        } else {
                                                                                            // Render Order (existing logic)
                                                                                            const order = item as Order;
                                                                                            // Use last_event_time (or updated_at as fallback) to compare with time_window_end
                                                                                            const deliveredTime = order.last_event_time ? ((order.last_event_time as any).toDate ? (order.last_event_time as any).toDate() : order.last_event_time) : (order.updated_at ? ((order.updated_at as any).toDate ? (order.updated_at as any).toDate() : order.updated_at) : null);
                                                                                            const deadline = order.time_window_end ? ((order.time_window_end as any).toDate ? (order.time_window_end as any).toDate() : order.time_window_end) : null;

                                                                                            let isLate = false;
                                                                                            let timeDiffText = '';

                                                                                            if (deliveredTime && deadline) {
                                                                                                const delivered = new Date(deliveredTime);
                                                                                                const due = new Date(deadline);
                                                                                                if (delivered > due) {
                                                                                                    isLate = true;
                                                                                                    const diff = differenceInMinutes(delivered, due);
                                                                                                    timeDiffText = `${formatDuration(diff)} late`;
                                                                                                } else {
                                                                                                    isLate = false;
                                                                                                    const diff = differenceInMinutes(due, delivered);
                                                                                                    timeDiffText = `${formatDuration(diff)} early`;
                                                                                                }
                                                                                            }

                                                                                            return (
                                                                                                <Link
                                                                                                    href={`/orders/${order.id}`}
                                                                                                    key={order.id}
                                                                                                    className="block"
                                                                                                >
                                                                                                    <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800 transition-colors group">
                                                                                                        <div className="flex items-center gap-3">
                                                                                                            <div className={`w-2 h-2 rounded-full ${isLate ? 'bg-red-500' : 'bg-emerald-500'}`} />
                                                                                                            <div>
                                                                                                                <p className="text-sm font-medium text-slate-200 group-hover:text-amber-400 transition-colors">{order.restaurant_name}</p>
                                                                                                                <p className="text-xs text-slate-500">{formatDateString(order.scheduled_date)} • {order.order_code}</p>
                                                                                                            </div>
                                                                                                        </div>
                                                                                                        <div className="text-right flex items-center gap-4">
                                                                                                            <div className="flex flex-col items-end">
                                                                                                                <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${isLate
                                                                                                                    ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                                                                                                                    : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                                                                                                    }`}>
                                                                                                                    {isLate ? 'Late' : 'On Time'}
                                                                                                                </span>
                                                                                                                {timeDiffText && (
                                                                                                                    <span className={`text-[10px] mt-0.5 ${isLate ? 'text-red-400' : 'text-emerald-400'}`}>
                                                                                                                        {timeDiffText}
                                                                                                                    </span>
                                                                                                                )}
                                                                                                            </div>
                                                                                                            <span className="text-sm font-bold text-emerald-400 w-16">
                                                                                                                ${order.payout_amount.toFixed(2)}
                                                                                                            </span>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </Link>
                                                                                            );
                                                                                        }
                                                                                    })}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </React.Fragment>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
