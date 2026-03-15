'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { firebaseDb } from '@/lib/firebase';
import { useTenant } from '@/lib/tenant-context';
import { Order, DashboardStats, DashboardAlert } from '@/types';
import { format } from 'date-fns';
import {
    Users,
    Package,
    Clock,
    Truck,
    CheckCircle2,
    DollarSign,
    AlertTriangle,
    RefreshCw,
    TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import StatCard from '@/components/StatCard';


export default function DashboardPage() {
    // const { t } = useTranslation();
    const { tenantId } = useTenant();
    const [stats, setStats] = useState<DashboardStats>({
        active_drivers: 0,
        orders_new: 0,
        orders_assigned: 0,
        orders_in_progress: 0,
        orders_delivered: 0,
        total_payout_today: 0,
    });
    const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
    const [recentOrders, setRecentOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);

    const today = format(new Date(), 'yyyy-MM-dd');

    const fetchDashboardData = async () => {
        setLoading(true);
        try {
            // Fetch active drivers
            let driversQ = query(
                collection(firebaseDb, 'profiles'),
                where('role', '==', 'driver'),
                where('is_active', '==', true)
            );
            if (tenantId && tenantId !== 'default') {
                driversQ = query(driversQ, where('tenant_id', '==', tenantId));
            }
            const driversSnap = await getDocs(driversQ);

            // Fetch today's orders
            let ordersQ = query(
                collection(firebaseDb, 'orders'),
                where('scheduled_date', '==', today)
            );
            if (tenantId && tenantId !== 'default') {
                ordersQ = query(ordersQ, where('tenant_id', '==', tenantId));
            }
            const ordersSnap = await getDocs(ordersQ);

            let newCount = 0;
            let assignedCount = 0;
            let inProgressCount = 0;
            let deliveredCount = 0;
            let totalPayout = 0;

            ordersSnap.forEach((doc) => {
                const order = doc.data() as Order;
                switch (order.status) {
                    case 'new':
                        newCount++;
                        break;
                    case 'assigned':
                        assignedCount++;
                        break;
                    case 'in_progress':
                        inProgressCount++;
                        break;
                    case 'delivered':
                        deliveredCount++;
                        break;
                }
                if (order.status === 'delivered') {
                    totalPayout += order.payout_amount;
                }
            });

            setStats({
                active_drivers: driversSnap.size,
                orders_new: newCount,
                orders_assigned: assignedCount,
                orders_in_progress: inProgressCount,
                orders_delivered: deliveredCount,
                total_payout_today: totalPayout,
            });

            // Fetch recent orders
            let recentQ = query(
                collection(firebaseDb, 'orders'),
                orderBy('created_at', 'desc'),
                limit(5)
            );
            if (tenantId && tenantId !== 'default') {
                recentQ = query(
                    collection(firebaseDb, 'orders'),
                    where('tenant_id', '==', tenantId),
                    orderBy('created_at', 'desc'),
                    limit(5)
                );
            }

            const recentSnap = await getDocs(recentQ);

            const orders: Order[] = [];
            recentSnap.forEach((doc) => {
                orders.push({ id: doc.id, ...doc.data() } as Order);
            });
            setRecentOrders(orders);

            // TODO: Generate alerts based on business rules
            setAlerts([]);

        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboardData();
    }, [tenantId]);

    // StatCard component moved to @/components/StatCard

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'new':
                return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
            case 'assigned':
                return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
            case 'in_progress':
                return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
            case 'delivered':
                return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
            case 'cancelled':
                return 'bg-error/20 text-error border-error/30';
            default:
                return 'bg-surface/20 text-text-muted border-divider/30';
        }
    };

    return (
        <div className="p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-text-main">Dashboard</h1>
                    <p className="text-text-muted mt-1">
                        Overview of your restaurant delivery performance
                    </p>
                </div>
                <button
                    onClick={() => fetchDashboardData()}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface border border-divider text-text-muted hover:text-text-main hover:border-divider transition-all disabled:opacity-50"
                >
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
                <StatCard
                    title="Active Drivers"
                    value={stats.active_drivers}
                    icon={Users}
                    gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
                />
                <StatCard
                    title="New Orders"
                    value={stats.orders_new}
                    icon={Package}
                    gradient="bg-gradient-to-br from-blue-500 to-indigo-600"
                />
                <StatCard
                    title="Assigned"
                    value={stats.orders_assigned}
                    icon={Clock}
                    gradient="bg-gradient-to-br from-amber-500 to-orange-600"
                />
                <StatCard
                    title="In Progress"
                    value={stats.orders_in_progress}
                    icon={Truck}
                    gradient="bg-gradient-to-br from-purple-500 to-pink-600"
                />
                <StatCard
                    title="Delivered"
                    value={stats.orders_delivered}
                    icon={CheckCircle2}
                    gradient="bg-gradient-to-br from-green-500 to-emerald-600"
                />
                <StatCard
                    title="Today's Payout"
                    value={`$${stats.total_payout_today.toFixed(2)}`}
                    icon={DollarSign}
                    gradient="bg-gradient-to-br from-rose-500 to-red-600"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Orders */}
                <div className="lg:col-span-2 bg-card/50 backdrop-blur rounded-2xl border border-divider/50 p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-semibold text-text-main">Recent Orders</h2>
                        <Link
                            href="/orders"
                            className="text-amber-500 hover:text-amber-400 text-sm font-medium transition-colors"
                        >
                            View All →
                        </Link>
                    </div>

                    <div className="space-y-3">
                        {recentOrders.length === 0 ? (
                            <p className="text-text-muted text-center py-8">No orders found</p>
                        ) : (
                            recentOrders.map((order) => (
                                <Link
                                    key={order.id}
                                    href={`/orders/${order.id}`}
                                    className="flex items-center justify-between p-4 rounded-xl bg-surface/50 border border-divider/50 hover:border-divider transition-all"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                                            <Package size={20} className="text-amber-500" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-text-main">{order.restaurant_name}</p>
                                            <p className="text-sm text-text-muted">{order.order_code}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(order.status)}`}>
                                            {order.status.replace('_', ' ')}
                                        </span>
                                        <span className="text-emerald-400 font-medium">
                                            ${order.payout_amount.toFixed(2)}
                                        </span>
                                    </div>
                                </Link>
                            ))
                        )}
                    </div>
                </div>

                {/* Alerts */}
                <div className="bg-card/50 backdrop-blur rounded-2xl border border-divider/50 p-6">
                    <div className="flex items-center gap-2 mb-6">
                        <AlertTriangle size={20} className="text-amber-500" />
                        <h2 className="text-xl font-semibold text-text-main">Alerts</h2>
                    </div>

                    {alerts.length === 0 ? (
                        <div className="text-center py-8">
                            <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-3" />
                            <p className="text-text-muted">All systems operational</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {alerts.map((alert) => (
                                <div
                                    key={alert.id}
                                    className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30"
                                >
                                    <p className="text-amber-400 font-medium text-sm">{alert.message}</p>
                                    <p className="text-text-muted text-xs mt-1">{alert.order_code}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Quick Stats */}
                    <div className="mt-6 pt-6 border-t border-divider">
                        <div className="flex items-center gap-2 text-text-muted mb-4">
                            <TrendingUp size={18} />
                            <span className="text-sm font-medium">Today's Progress</span>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-text-muted">Orders Completed</span>
                                    <span className="text-text-main">
                                        {stats.orders_delivered} / {stats.orders_new + stats.orders_assigned + stats.orders_in_progress + stats.orders_delivered}
                                    </span>
                                </div>
                                <div className="h-2 rounded-full bg-surface overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all"
                                        style={{
                                            width: `${((stats.orders_delivered) /
                                                (stats.orders_new + stats.orders_assigned + stats.orders_in_progress + stats.orders_delivered || 1)) *
                                                100
                                                }%`,
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
