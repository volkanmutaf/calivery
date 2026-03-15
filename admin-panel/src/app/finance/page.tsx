'use client';

import { useState, useEffect, useMemo } from 'react';
import { useNotification } from '@/lib/notification-context';
import { useTenant } from '@/lib/tenant-context';
import { collection, query, getDocs, updateDoc, doc, where, orderBy } from 'firebase/firestore';
import { firebaseDb } from '@/lib/firebase';
import { Order, Profile } from '@/types';
import {
    DollarSign,
    Search,
    ChevronDown,
    ChevronUp,
    Save,
    CheckCircle2,
    AlertCircle,
    Truck,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Wallet
} from 'lucide-react';
import {
    format,
    startOfMonth,
    endOfMonth,
    subMonths,
    addMonths,
    isSameMonth,
    startOfWeek,
    endOfWeek,
    eachWeekOfInterval,
    isSameDay
} from 'date-fns';

// Types for the dashboard
type PayAdjustment = {
    id: string;
    driver_id: string;
    amount: number;
    date: string;
    type: string;
    created_at: any;
};

type FinanceItem =
    | { type: 'order'; data: Order; dateStr: string }
    | { type: 'adjustment'; data: PayAdjustment; dateStr: string };

type WeeklyGroup = {
    weekStart: Date;
    weekEnd: Date;
    label: string;
    items: FinanceItem[];
    stats: {
        revenue: number;
        driverPay: number; // Orders payout + Adjustments
        netIncome: number;
        orderCount: number;
        adjustmentCount: number;
        incompleteCount: number;
    };
};

export default function FinancePage() {
    const { tenantId } = useTenant();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [loading, setLoading] = useState(true);
    const [orders, setOrders] = useState<Order[]>([]);
    const [adjustments, setAdjustments] = useState<PayAdjustment[]>([]);
    const [drivers, setDrivers] = useState<Record<string, string>>({});
    const [searchQuery, setSearchQuery] = useState('');

    // Monthly Stats
    const [monthStats, setMonthStats] = useState({
        revenue: 0,
        driverPay: 0,
        netIncome: 0,
        orderCount: 0,
        incompleteCount: 0
    });

    useEffect(() => {
        fetchData();
    }, [currentDate, tenantId]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Drivers (for mapping names)
            let driversQuery = query(collection(firebaseDb, 'profiles'), where('role', '==', 'driver'));
            if (tenantId && tenantId !== 'default') {
                driversQuery = query(driversQuery, where('tenant_id', '==', tenantId));
            }
            const driversSnap = await getDocs(driversQuery);
            const driverMap: Record<string, string> = {};
            driversSnap.forEach(doc => {
                const data = doc.data() as Profile;
                driverMap[doc.id] = data.username || 'Unknown Driver';
            });
            setDrivers(driverMap);

            // 2. Calculate Date Range for the selected Month
            const start = format(startOfMonth(currentDate), 'yyyy-MM-dd');
            const end = format(endOfMonth(currentDate), 'yyyy-MM-dd');

            // 3. Fetch Orders in this month
            // Note: We use scheduled_date string comparison. 
            // It works because YYYY-MM-DD is lexicographically sortable.
            let ordersQ = query(
                collection(firebaseDb, 'orders'),
                where('scheduled_date', '>=', start),
                where('scheduled_date', '<=', end),
                orderBy('scheduled_date', 'desc')
            );
            if (tenantId && tenantId !== 'default') {
                ordersQ = query(ordersQ, where('tenant_id', '==', tenantId));
            }
            const ordersSnap = await getDocs(ordersQ);
            const ordersData: Order[] = [];
            ordersSnap.forEach(doc => ordersData.push({ id: doc.id, ...doc.data() } as Order));

            // 4. Fetch Adjustments in this month
            let adjQ = query(
                collection(firebaseDb, 'pay_adjustments'),
                where('date', '>=', start),
                where('date', '<=', end),
                orderBy('date', 'desc')
            );
            if (tenantId && tenantId !== 'default') {
                adjQ = query(adjQ, where('tenant_id', '==', tenantId));
            }
            const adjSnap = await getDocs(adjQ);
            const adjData: PayAdjustment[] = [];
            adjSnap.forEach(doc => adjData.push({ id: doc.id, ...doc.data() } as PayAdjustment));

            setOrders(ordersData);
            setAdjustments(adjData);
            calculateMonthStats(ordersData, adjData);

        } catch (error) {
            console.error('Error fetching finance data:', error);
        } finally {
            setLoading(false);
        }
    };

    const calculateMonthStats = (ordersList: Order[], adjList: PayAdjustment[]) => {
        let revenue = 0;
        let driverPay = 0;
        let netIncome = 0;
        let incomplete = 0;

        ordersList.forEach(o => {
            const r = (o.order_price || 0) + (o.customer_tip || 0);
            const d = o.payout_amount || 0;
            const n = o.net_income || (o.finance_status === 'completed' ? o.net_income || 0 : 0); // Only count calculated net income or safe fallback

            // If the order is NOT complete, we can estimate net income:
            const estimatedNet = r - d;

            if (o.finance_status !== 'completed') {
                incomplete++;
            }

            revenue += r;
            driverPay += d;
            // Use actual net income if completed, otherwise estimate
            netIncome += (o.finance_status === 'completed' ? (o.net_income || 0) : estimatedNet);
        });

        adjList.forEach(a => {
            // Adjustments are effectively driver pay
            driverPay += (a.amount || 0);
            // And they reduce net income
            netIncome -= (a.amount || 0);
        });

        setMonthStats({
            revenue,
            driverPay,
            netIncome,
            orderCount: ordersList.length,
            incompleteCount: incomplete
        });
    };

    const handleMonthChange = (direction: 'prev' | 'next') => {
        setCurrentDate(prev => direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1));
    };

    const handleUpdateOrder = (updatedOrder: Order) => {
        setOrders(prev => {
            const newOrders = prev.map(o => o.id === updatedOrder.id ? updatedOrder : o);
            calculateMonthStats(newOrders, adjustments);
            return newOrders;
        });
    };

    // Group Data by Weeks
    const weeklyData = useMemo(() => {
        // 1. Filter Items based on Search
        const lowerQuery = searchQuery.toLowerCase();

        const filteredOrders = orders.filter(o => {
            if (!lowerQuery) return true;
            return (
                o.order_code.toLowerCase().includes(lowerQuery) ||
                o.restaurant_name.toLowerCase().includes(lowerQuery) ||
                (o.assigned_driver_id && drivers[o.assigned_driver_id]?.toLowerCase().includes(lowerQuery))
            );
        });

        const filteredAdjustments = adjustments.filter(a => {
            if (!lowerQuery) return true;
            return (
                a.type.toLowerCase().includes(lowerQuery) ||
                (a.driver_id && drivers[a.driver_id]?.toLowerCase().includes(lowerQuery))
            );
        });

        // 2. Generate Weeks for the month
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);

        // Ensure we cover full weeks (start on Monday)
        const weeks = eachWeekOfInterval({ start: monthStart, end: monthEnd }, { weekStartsOn: 1 });

        const groups: WeeklyGroup[] = weeks.map(weekStart => {
            const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

            // Format for comparison (string YYYY-MM-DD)
            // We need to be careful: an order on the 31st might fall in a week starting 27th
            // Simple approach: Iterate all items and place them in the correct week bucket
            // Or filter for this week range.
            // Since we have filtered items, let's filter them per week.

            const weekStartStr = format(weekStart, 'yyyy-MM-dd');
            const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

            const weekOrders = filteredOrders.filter(o => o.scheduled_date >= weekStartStr && o.scheduled_date <= weekEndStr);
            const weekAdj = filteredAdjustments.filter(a => a.date >= weekStartStr && a.date <= weekEndStr);

            // Calculate Stats
            let revenue = 0;
            let pay = 0; // Driver Pay
            let net = 0;
            let incomplete = 0;

            const items: FinanceItem[] = [];

            weekOrders.forEach(o => {
                const r = (o.order_price || 0) + (o.customer_tip || 0);
                const d = o.payout_amount || 0;
                // Estimate net if not completed
                const n = o.finance_status === 'completed' ? (o.net_income || 0) : (r - d);

                if (o.finance_status !== 'completed') {
                    incomplete++;
                }

                revenue += r;
                pay += d;
                net += n;

                items.push({ type: 'order', data: o, dateStr: o.scheduled_date });
            });

            weekAdj.forEach(a => {
                const d = a.amount || 0;
                pay += d;
                net -= d; // Reduces net income

                items.push({ type: 'adjustment', data: a, dateStr: a.date });
            });

            // Sort items by date desc
            items.sort((a, b) => b.dateStr.localeCompare(a.dateStr));

            return {
                weekStart,
                weekEnd,
                label: `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d')}`,
                items,
                stats: {
                    revenue,
                    driverPay: pay,
                    netIncome: net,
                    orderCount: weekOrders.length,
                    adjustmentCount: weekAdj.length,
                    incompleteCount: incomplete
                }
            };
        });

        // Reverse weeks to show newest first? Or Standard calendar order? 
        // Typically newest week (bottom of month) or top.
        // Let's keep calendar order (earliest week first) or reverse?
        // Calendar view usually implies top-down. 
        // Let's do standard order (week 1 -> week 4).
        return groups;

    }, [orders, adjustments, currentDate, searchQuery, drivers]);


    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-900/20">
                        <DollarSign size={24} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-white">Finance Dashboard</h1>
                        <p className="text-slate-400">Track monthly revenue and payouts</p>
                    </div>
                </div>

                {/* Month Selector */}
                <div className="flex items-center bg-slate-800 rounded-xl p-1 border border-slate-700">
                    <button
                        onClick={() => handleMonthChange('prev')}
                        className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div className="px-6 flex items-center gap-2 font-medium text-white min-w-[160px] justify-center">
                        <Calendar size={18} className="text-emerald-500" />
                        {format(currentDate, 'MMMM yyyy')}
                    </div>
                    <button
                        onClick={() => handleMonthChange('next')}
                        className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
                        disabled={isSameMonth(currentDate, new Date()) && currentDate > new Date()} // Optional: disable future? No, let them look.
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>
            </div>

            {/* Monthly Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {monthStats.incompleteCount > 0 && (
                    <StatCard
                        label="Pending Entry"
                        value={monthStats.incompleteCount}
                        icon={AlertCircle}
                        color="text-red-400"
                        bg="bg-red-500/10"
                    />
                )}
                <StatCard
                    label="Total Orders"
                    value={monthStats.orderCount}
                    icon={CheckCircle2}
                    color="text-blue-400"
                    bg="bg-blue-500/10"
                />
                <StatCard
                    label="Total Revenue"
                    value={`$${monthStats.revenue.toFixed(2)}`}
                    icon={DollarSign}
                    color="text-emerald-400"
                    bg="bg-emerald-500/10"
                />
                <StatCard
                    label="Driver Pay & Adj."
                    value={`$${monthStats.driverPay.toFixed(2)}`}
                    icon={Wallet}
                    color="text-amber-400"
                    bg="bg-amber-500/10"
                />
                <StatCard
                    label="Net Income"
                    value={`$${monthStats.netIncome.toFixed(2)}`}
                    icon={DollarSign}
                    color="text-purple-400"
                    bg="bg-purple-500/10"
                    highlight
                />
            </div>

            {/* Main Content Area */}
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl border border-slate-700/50 overflow-hidden min-h-[500px]">
                {/* Toolbar */}
                <div className="p-4 border-b border-slate-700/50 flex flex-col md:flex-row gap-4 justify-between items-center">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        Weekly Breakdown
                    </h2>
                    <div className="relative w-full md:w-96">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search orders, drivers..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-900/50 rounded-xl border border-slate-700 text-white focus:border-emerald-500 focus:outline-none placeholder:text-slate-600"
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="p-12 flex justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
                    </div>
                ) : (
                    <div className="divide-y divide-slate-700/50">
                        {weeklyData.map((week) => (
                            <WeeklySection
                                key={week.label}
                                week={week}
                                drivers={drivers}
                                onUpdateOrder={handleUpdateOrder}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// --- Sub Components ---

function StatCard({ label, value, icon: Icon, color, bg, highlight }: any) {
    return (
        <div className={`p-5 rounded-2xl border ${highlight ? 'bg-slate-800 border-emerald-500/30' : 'bg-slate-800/50 border-slate-700/50'}`}>
            <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</span>
                <div className={`p-2 rounded-lg ${bg}`}>
                    <Icon size={18} className={color} />
                </div>
            </div>
            <div className={`text-2xl font-bold ${highlight ? 'text-emerald-400' : 'text-white'}`}>{value}</div>
        </div>
    );
}

function WeeklySection({ week, drivers, onUpdateOrder }: { week: WeeklyGroup, drivers: Record<string, string>, onUpdateOrder: (o: Order) => void }) {
    const [expanded, setExpanded] = useState(false);

    // Auto-expand current week? optional.
    const isCurrentWeek = useMemo(() => {
        const now = new Date();
        return now >= week.weekStart && now <= week.weekEnd;
    }, [week]);

    // Or just expand if it has items? 
    // Let's default to collapsed to keep view clean, unless filtered.

    if (week.items.length === 0) return null; // Hide empty weeks? Or show them as empty? Hiding is cleaner.

    return (
        <div className={`transition-colors ${expanded ? 'bg-slate-800/30' : 'hover:bg-slate-800/20'}`}>
            <div
                className="p-4 cursor-pointer flex items-center justify-between group"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${isCurrentWeek ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700/50 text-slate-400'}`}>
                        {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>
                    <div>
                        <h3 className={`font-semibold flex items-center gap-2 ${isCurrentWeek ? 'text-emerald-400' : 'text-white'}`}>
                            {week.label}
                            {week.stats.incompleteCount > 0 && (
                                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
                                    {week.stats.incompleteCount}
                                </span>
                            )}
                        </h3>
                        <p className="text-xs text-slate-500">
                            {week.stats.orderCount} Orders • {week.stats.adjustmentCount} Adjustments
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-6 text-sm text-right">
                    <div className="hidden md:block">
                        <p className="text-slate-500 text-xs">Revenue</p>
                        <p className="font-medium text-emerald-400">${week.stats.revenue.toFixed(2)}</p>
                    </div>
                    <div className="hidden md:block">
                        <p className="text-slate-500 text-xs">Driver Pay</p>
                        <p className="font-medium text-amber-400">${week.stats.driverPay.toFixed(2)}</p>
                    </div>
                    <div>
                        <p className="text-slate-500 text-xs">Net Income</p>
                        <p className="font-bold text-white">${week.stats.netIncome.toFixed(2)}</p>
                    </div>
                </div>
            </div>

            {expanded && (
                <div className="border-t border-slate-700/50 px-4 py-2 bg-slate-900/20">
                    {week.items.map((item, idx) => {
                        if (item.type === 'order') {
                            return (
                                <OrderRow
                                    key={item.data.id}
                                    order={item.data}
                                    driverName={item.data.assigned_driver_id ? drivers[item.data.assigned_driver_id] : undefined}
                                    onUpdate={onUpdateOrder}
                                />
                            );
                        } else {
                            return (
                                <AdjustmentRow
                                    key={item.data.id}
                                    adjustment={item.data}
                                    driverName={drivers[item.data.driver_id]}
                                />
                            );
                        }
                    })}
                </div>
            )}
        </div>
    );
}

function OrderRow({ order, driverName, onUpdate }: { order: Order, driverName?: string, onUpdate: (o: Order) => void }) {
    const { showNotification } = useNotification();
    const [editMode, setEditMode] = useState(false);
    const [price, setPrice] = useState(order.order_price?.toString() || '');
    const [tip, setTip] = useState(order.customer_tip?.toString() || '');
    const [saving, setSaving] = useState(false);

    const isCompleted = order.finance_status === 'completed';
    const estimatedNet = ((parseFloat(price) || 0) + (parseFloat(tip) || 0)) - order.payout_amount;
    const finalNet = isCompleted ? (order.net_income || 0) : estimatedNet;

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setSaving(true);
        try {
            const numPrice = parseFloat(price) || 0;
            const numTip = parseFloat(tip) || 0;
            const updates = {
                finance_status: 'completed',
                order_price: numPrice,
                customer_tip: numTip,
                net_income: numPrice + numTip - order.payout_amount
            };

            await updateDoc(doc(firebaseDb, 'orders', order.id), updates as any);
            onUpdate({ ...order, ...updates } as Order);
            setEditMode(false);
        } catch (error) {
            console.error(error);
            showNotification('Failed to save', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col border-b border-slate-800/50 last:border-0 hover:bg-slate-800/10 transition-colors rounded-lg my-1 overflow-hidden">
            <div
                className="flex items-center justify-between p-3 cursor-pointer"
                onClick={() => setEditMode(!editMode)}
            >
                <div className="flex items-center gap-3">
                    <div className="text-slate-500">
                        {editMode ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </div>
                    <div className={`w-2 h-2 rounded-full ${isCompleted ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-white font-medium">{order.restaurant_name}</span>
                            <span className="text-xs text-slate-500">#{order.order_code}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-slate-400">{format(new Date(order.scheduled_date), 'MMM d')}</span>
                            {driverName && (
                                <span className="flex items-center gap-1 text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700">
                                    <Truck size={10} /> {driverName}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4 text-right">
                    <div>
                        <div className="text-[10px] text-slate-500 uppercase">Rev</div>
                        <div className="text-sm font-medium text-emerald-400">
                            ${((order.order_price || 0) + (order.customer_tip || 0)).toFixed(2)}
                        </div>
                    </div>
                    <div className="opacity-60">
                        <div className="text-[10px] text-slate-500 uppercase">Pay</div>
                        <div className="text-sm font-medium text-amber-400">
                            ${order.payout_amount.toFixed(2)}
                        </div>
                    </div>
                    <div className="w-16">
                        <div className="text-[10px] text-slate-500 uppercase">Net</div>
                        <div className={`text-sm font-bold ${finalNet >= 0 ? 'text-white' : 'text-red-400'}`}>
                            ${finalNet.toFixed(2)}
                        </div>
                    </div>
                </div>
            </div>

            {editMode && (
                <form onSubmit={handleSave} onClick={(e) => e.stopPropagation()} className="px-4 pb-4 pt-2 bg-slate-900/30 grid grid-cols-3 gap-4 border-t border-slate-800/50">
                    <div>
                        <label className="text-xs text-slate-500 mb-1 block">Order Price</label>
                        <input
                            type="number"
                            step="0.01"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-sm text-white"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 mb-1 block">Customer Tip</label>
                        <input
                            type="number"
                            step="0.01"
                            value={tip}
                            onChange={(e) => setTip(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-sm text-white"
                        />
                    </div>
                    <div className="flex items-end">
                        <button
                            type="submit"
                            disabled={saving}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-2 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
                        >
                            {saving ? 'Saving...' : 'Update'}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}

function AdjustmentRow({ adjustment, driverName }: { adjustment: PayAdjustment, driverName?: string }) {
    return (
        <div className="flex items-center justify-between p-3 border-b border-slate-800/50 last:border-0 hover:bg-slate-800/10 transition-colors rounded-lg my-1">
            <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-purple-500" />
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-slate-200 font-medium capitalize">{adjustment.type}</span>
                        {driverName && (
                            <span className="flex items-center gap-1 text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700">
                                <Truck size={10} /> {driverName}
                            </span>
                        )}
                    </div>
                    <div className="text-xs text-slate-500">{format(new Date(adjustment.date), 'MMM d, yyyy')} • Adjustment</div>
                </div>
            </div>

            <div className="text-right">
                <div className="text-[10px] text-slate-500 uppercase">Pay</div>
                <div className="text-sm font-bold text-amber-400">
                    +${adjustment.amount.toFixed(2)}
                </div>
            </div>
        </div>
    );
}
