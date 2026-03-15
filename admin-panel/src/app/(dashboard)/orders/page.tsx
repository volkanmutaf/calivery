'use client';

import { useEffect, useState } from 'react';
import { useNotification } from '@/lib/notification-context';
import { collection, query, orderBy, getDocs, where, limit, startAfter, DocumentData, QueryDocumentSnapshot, doc, getDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useTenant } from '@/lib/tenant-context';
import { useAuth } from '@/lib/auth-context';
import { firebaseDb, firebaseFunctions } from '@/lib/firebase';
import { Order, Profile } from '@/types';
import { format } from 'date-fns';
import { formatDateString } from '@/lib/utils';
import Link from 'next/link';

import {
    Plus,
    Search,
    Filter,
    RefreshCw,
    ChevronLeft,
    ChevronRight,
    Package,
    MapPin,
    Clock,

    X,
    Trash2,
    CheckCircle,
    FileText,
    AlertTriangle,
} from 'lucide-react';
import AddressInput from '@/components/AddressInput';

const FETCH_PAGE_SIZE = 50;
const DISPLAY_LIMIT = 10;

export default function OrdersPage() {
    // const { t } = useTranslation();
    const { showNotification } = useNotification();
    const { tenantId } = useTenant();
    const { role: userRole } = useAuth();
    const [orders, setOrders] = useState<Order[]>([]);
    const [drivers, setDrivers] = useState<Record<string, Profile>>({});
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedOrderForNote, setSelectedOrderForNote] = useState<Order | null>(null);
    const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => Promise<void>;
        type: 'danger' | 'success';
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: async () => { },
        type: 'danger',
    });

    // Client-side pagination
    const [currentPage, setCurrentPage] = useState(1);

    const fetchOrders = async (append = false) => {
        setLoading(true);
        try {
            let baseConstraints: any[] = [orderBy('created_at', 'desc')];
            if (statusFilter !== 'all') {
                baseConstraints.unshift(where('status', '==', statusFilter));
            }
            if (userRole !== 'super_admin') {
                const filterId = tenantId || 'default';
                baseConstraints.unshift(where('tenant_id', '==', filterId));
            }

            let ordersQuery = query(
                collection(firebaseDb, 'orders'),
                ...baseConstraints,
                limit(FETCH_PAGE_SIZE)
            );

            if (append && lastDoc) {
                ordersQuery = query(ordersQuery, startAfter(lastDoc));
            }

            const snapshot = await getDocs(ordersQuery);
            const newOrders: Order[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                newOrders.push({
                    id: doc.id,
                    ...data,
                    created_at: data.created_at?.toDate?.() || new Date(),
                    updated_at: data.updated_at?.toDate?.() || new Date(),
                    last_event_time: data.last_event_time?.toDate?.() || new Date(),
                } as Order);
            });

            if (append) {
                setOrders((prev) => [...prev, ...newOrders]);
            } else {
                setOrders(newOrders);
            }

            // Fetch driver details for assigned orders
            const driverIdsToFetch = new Set<string>();
            newOrders.forEach(order => {
                if (order.assigned_driver_id) {
                    driverIdsToFetch.add(order.assigned_driver_id);
                }
            });

            if (driverIdsToFetch.size > 0) {
                const newDrivers: Record<string, Profile> = {};
                await Promise.all(Array.from(driverIdsToFetch).map(async (driverId) => {
                    try {
                        const driverDoc = await getDoc(doc(firebaseDb, 'profiles', driverId));
                        if (driverDoc.exists()) {
                            newDrivers[driverId] = driverDoc.data() as Profile;
                        }
                    } catch (e) {
                        console.error(`Failed to fetch driver ${driverId}`, e);
                    }
                }));
                setDrivers(prev => ({ ...prev, ...newDrivers }));
            }

            setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
            setHasMore(snapshot.docs.length === FETCH_PAGE_SIZE);
        } catch (error) {
            console.error('Error fetching orders:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
    }, [statusFilter, tenantId]);

    const filteredOrders = orders.filter((order) => {
        const matchesSearch = order.restaurant_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            order.order_code.toLowerCase().includes(searchTerm.toLowerCase());

        if (matchesSearch) return true;

        // Check driver name
        if (order.assigned_driver_id && drivers[order.assigned_driver_id]) {
            return drivers[order.assigned_driver_id].username.toLowerCase().includes(searchTerm.toLowerCase());
        }

        return false;
    });

    // Calculate pagination derived values
    const totalPages = Math.ceil(filteredOrders.length / DISPLAY_LIMIT);
    const currentOrders = filteredOrders.slice(
        (currentPage - 1) * DISPLAY_LIMIT,
        currentPage * DISPLAY_LIMIT
    );

    // Reset page when filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter]);

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
                return 'bg-red-500/20 text-red-400 border-red-500/30';
            default:
                return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
        }
    };

    const handleDeleteOrder = async (orderId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setConfirmModal({
            isOpen: true,
            title: 'Delete Order',
            message: 'Are you sure you want to permanently delete this order? This action cannot be undone.',
            type: 'danger',
            onConfirm: async () => {
                try {
                    const deleteOrder = httpsCallable(firebaseFunctions, 'deleteOrder');
                    await deleteOrder({ order_id: orderId });
                    fetchOrders();
                    showNotification('Order deleted successfully', 'success');
                } catch (error) {
                    console.error('Error deleting order:', error);
                    showNotification('Failed to delete order', 'error');
                }
            }
        });
    };

    const handleForceComplete = async (orderId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setConfirmModal({
            isOpen: true,
            title: 'Force Complete Order',
            message: 'Are you sure you want to force mark this order as delivered? This will complete all steps.',
            type: 'success',
            onConfirm: async () => {
                try {
                    const adminCompleteOrder = httpsCallable(firebaseFunctions, 'adminCompleteOrder');
                    await adminCompleteOrder({ order_id: orderId });
                    fetchOrders();
                    showNotification('Order marked as delivered', 'success');
                } catch (error) {
                    console.error('Error completing order:', error);
                    showNotification('Failed to complete order', 'error');
                }
            }
        });
    };

    return (
        <div className="p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-text-main">Orders</h1>
                    <p className="text-text-muted mt-1">Manage catering delivery orders</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 font-semibold hover:from-amber-400 hover:to-orange-400 transition-all shadow-lg shadow-amber-500/20"
                >
                    <Plus size={20} />
                    Create Order
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-4 mb-6">
                <div className="relative flex-1 max-w-md">
                    <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                        type="text"
                        placeholder="Search orders..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-2.5 rounded-xl bg-surface border border-divider text-text-main placeholder-text-muted focus:outline-none focus:border-amber-500 transition-colors"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <Filter size={18} className="text-text-muted" />
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-4 py-2.5 rounded-xl bg-surface border border-divider text-text-main focus:outline-none focus:border-amber-500 transition-colors"
                    >
                        <option value="all">All Status</option>
                        <option value="new">New</option>
                        <option value="assigned">Assigned</option>
                        <option value="in_progress">In Progress</option>
                        <option value="delivered">Delivered</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                </div>

                <button
                    onClick={() => fetchOrders()}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface border border-divider text-text-muted hover:text-text-main hover:border-text-muted transition-all disabled:opacity-50"
                >
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {/* Orders Table */}
            <div className="bg-card/50 backdrop-blur rounded-2xl border border-divider/50 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-divider/50">
                                <th className="px-6 py-4 text-left text-sm font-medium text-text-muted">Order Code</th>
                                <th className="px-6 py-4 text-left text-sm font-medium text-text-muted">Restaurant</th>
                                <th className="px-6 py-4 text-left text-sm font-medium text-text-muted">Date</th>
                                <th className="px-6 py-4 text-left text-sm font-medium text-text-muted">Payout</th>
                                <th className="px-6 py-4 text-left text-sm font-medium text-text-muted">Status</th>
                                <th className="px-6 py-4 text-left text-sm font-medium text-text-muted">Driver</th>
                                <th className="px-6 py-4 text-left text-sm font-medium text-text-muted">Last Update</th>
                                <th className="px-6 py-4 text-right text-sm font-medium text-text-muted">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-divider/50">
                            {currentOrders.map((order) => (
                                <tr
                                    key={order.id}
                                    className="hover:bg-surface/30 transition-colors cursor-pointer"
                                    onClick={() => window.location.href = `/orders/${order.id}`}
                                >
                                    <td className="px-6 py-4">
                                        <span className="font-mono text-amber-400">{order.order_code}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                                                <Package size={18} className="text-amber-500" />
                                            </div>
                                            <div>
                                                <p className="text-text-main font-medium">{order.restaurant_name}</p>
                                                <p className="text-text-muted text-sm flex items-center gap-1">
                                                    <MapPin size={12} />
                                                    {order.pickup_address.substring(0, 30)}...
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-text-muted">{formatDateString(order.scheduled_date)}</td>
                                    <td className="px-6 py-4 text-emerald-400 font-medium">
                                        ${order.payout_amount.toFixed(2)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(order.status)} capitalize`}>
                                            {order.status.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-text-muted">
                                        {order.assigned_driver_id ? (
                                            <span className="text-white font-medium">
                                                {drivers[order.assigned_driver_id]?.username || 'Loading...'}
                                            </span>
                                        ) : (
                                            <span className="text-slate-600">—</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-1 text-text-muted text-sm">
                                            <Clock size={14} />
                                            {format(new Date(order.last_event_time), 'HH:mm')}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center justify-end gap-2">
                                            {order.status !== 'delivered' && order.status !== 'cancelled' && (
                                                <button
                                                    onClick={(e) => handleForceComplete(order.id, e)}
                                                    className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                                                    title="Force Complete Order"
                                                >
                                                    <CheckCircle size={18} />
                                                </button>
                                            )}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedOrderForNote(order);
                                                }}
                                                className={`p-2 rounded-lg transition-colors ${order.admin_notes
                                                    ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 shadow-sm shadow-emerald-500/10'
                                                    : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                                                    }`}
                                                title={order.admin_notes ? "View Note" : "Add Note"}
                                            >
                                                <FileText size={18} />
                                            </button>
                                            <button
                                                onClick={(e) => handleDeleteOrder(order.id, e)}
                                                className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                                                title="Delete Order"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {filteredOrders.length === 0 && !loading && (
                    <div className="py-12 text-center">
                        <Package size={48} className="text-text-muted mx-auto mb-4" />
                        <p className="text-text-muted">No orders found</p>
                    </div>
                )}

                {loading && (
                    <div className="py-12 text-center">
                        <RefreshCw size={32} className="text-amber-500 mx-auto mb-4 animate-spin" />
                        <p className="text-text-muted">Loading orders...</p>
                    </div>
                )}

                {/* Pagination */}
                {!loading && filteredOrders.length > 0 && (
                    <div className="p-4 border-t border-divider flex items-center justify-between">
                        <div className="text-sm text-text-muted">
                            Showing {Math.min((currentPage - 1) * DISPLAY_LIMIT + 1, filteredOrders.length)} to {Math.min(currentPage * DISPLAY_LIMIT, filteredOrders.length)} of {filteredOrders.length} orders
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-2 rounded-lg hover:bg-surface text-text-muted hover:text-text-main disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            >
                                <ChevronLeft size={20} />
                            </button>

                            <div className="flex items-center gap-1">
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                    <button
                                        key={page}
                                        onClick={() => setCurrentPage(page)}
                                        className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${currentPage === page
                                            ? 'bg-amber-500 text-slate-900 shadow-lg shadow-amber-500/20'
                                            : 'text-text-muted hover:bg-surface hover:text-text-main'
                                            }`}
                                    >
                                        {page}
                                    </button>
                                ))}
                            </div>

                            <button
                                onClick={() => {
                                    if (currentPage < totalPages) {
                                        setCurrentPage(p => p + 1);
                                    } else if (hasMore) {
                                        // Load more from server and then go to next page
                                        fetchOrders(true).then(() => {
                                            setCurrentPage(p => p + 1);
                                        });
                                    }
                                }}
                                disabled={currentPage === totalPages && !hasMore}
                                className="p-2 rounded-lg hover:bg-surface text-text-muted hover:text-text-main disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {showCreateModal && (
                <CreateOrderModal onClose={() => setShowCreateModal(false)} onCreated={() => fetchOrders()} />
            )}

            {selectedOrderForNote && (
                <NoteModal
                    order={selectedOrderForNote}
                    onClose={() => setSelectedOrderForNote(null)}
                    onSave={() => fetchOrders()}
                />
            )}

            {confirmModal.isOpen && (
                <ConfirmModal
                    title={confirmModal.title}
                    message={confirmModal.message}
                    type={confirmModal.type}
                    onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                    onConfirm={confirmModal.onConfirm}
                />
            )}
        </div>
    );
}

function ConfirmModal({
    title,
    message,
    type,
    onClose,
    onConfirm,
}: {
    title: string;
    message: string;
    type: 'danger' | 'success';
    onClose: () => void;
    onConfirm: () => Promise<void>;
}) {
    const [loading, setLoading] = useState(false);

    const handleConfirm = async () => {
        setLoading(true);
        await onConfirm();
        setLoading(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-2xl border border-divider w-full max-w-md shadow-2xl overflow-hidden">
                <div className={`h-2 ${type === 'danger' ? 'bg-red-500' : 'bg-emerald-500'}`} />
                <div className="p-6">
                    <div className="flex items-center gap-4 mb-6">
                        <div className={`p-3 rounded-full ${type === 'danger' ? 'bg-red-500/20' : 'bg-emerald-500/20'}`}>
                            {type === 'danger' ? (
                                <AlertTriangle size={24} className="text-red-400" />
                            ) : (
                                <CheckCircle size={24} className="text-emerald-400" />
                            )}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-text-main">{title}</h2>
                            <p className="text-text-muted text-sm">{type === 'danger' ? 'Action cannot be undone' : 'Confirmation required'}</p>
                        </div>
                    </div>

                    <p className="text-text-muted mb-8 leading-relaxed">
                        {message}
                    </p>

                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            disabled={loading}
                            className="flex-1 px-4 py-3 rounded-xl bg-surface text-text-main font-medium hover:bg-surface/80 border border-divider transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={loading}
                            className={`flex-1 px-4 py-3 rounded-xl font-semibold text-white transition-all shadow-lg flex items-center justify-center gap-2 ${type === 'danger'
                                ? 'bg-red-500 hover:bg-red-400 shadow-red-500/20'
                                : 'bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/20'
                                } disabled:opacity-50`}
                        >
                            {loading && <RefreshCw size={18} className="animate-spin" />}
                            {loading ? 'Processing...' : 'Confirm'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function CreateOrderModal({
    onClose,
    onCreated,
}: {
    onClose: () => void;
    onCreated: () => void;
}) {
    // const { t } = useTranslation();
    const [formData, setFormData] = useState({
        restaurant_name: '',
        pickup_address: '',
        pickup_lat: '',
        pickup_lng: '',
        dropoff_address: '',
        dropoff_lat: '',
        dropoff_lng: '',
        payout_amount: '',
        scheduled_date: format(new Date(), 'yyyy-MM-dd'),
        time_window_start: '',
        time_window_end: '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const createOrder = httpsCallable(firebaseFunctions, 'createOrder');
            await createOrder({
                restaurant_name: formData.restaurant_name,
                pickup_address: formData.pickup_address,
                pickup_lat: formData.pickup_lat ? parseFloat(formData.pickup_lat) : undefined,
                pickup_lng: formData.pickup_lng ? parseFloat(formData.pickup_lng) : undefined,
                dropoff_address: formData.dropoff_address,
                dropoff_lat: formData.dropoff_lat ? parseFloat(formData.dropoff_lat) : undefined,
                dropoff_lng: formData.dropoff_lng ? parseFloat(formData.dropoff_lng) : undefined,
                payout_amount: parseFloat(formData.payout_amount),
                scheduled_date: formData.scheduled_date,
                time_window_start: formData.time_window_start ? `${formData.scheduled_date}T${formData.time_window_start}` : undefined,
                time_window_end: formData.time_window_end ? `${formData.scheduled_date}T${formData.time_window_end}` : undefined,
            });

            onCreated();
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to create order');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-2xl border border-divider w-full max-w-lg shadow-2xl">
                <div className="flex items-center justify-between p-6 border-b border-divider">
                    <h2 className="text-xl font-semibold text-text-main">Create New Order</h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-surface text-text-muted hover:text-text-main transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-text-muted mb-2">
                            Restaurant Name
                        </label>
                        <input
                            type="text"
                            value={formData.restaurant_name}
                            onChange={(e) => setFormData({ ...formData, restaurant_name: e.target.value })}
                            className="w-full px-4 py-3 rounded-xl bg-surface border border-divider text-text-main placeholder-text-muted focus:outline-none focus:border-amber-500 transition-colors"
                            placeholder="Enter restaurant name"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-text-muted mb-2">
                            Pickup Address
                        </label>
                        <AddressInput
                            value={formData.pickup_address}
                            onChange={(addr, lat, lng) => {
                                setFormData(prev => ({
                                    ...prev,
                                    pickup_address: addr,
                                    pickup_lat: lat ? lat.toString() : prev.pickup_lat,
                                    pickup_lng: lng ? lng.toString() : prev.pickup_lng,
                                }));
                            }}
                            placeholder="Enter pickup address"
                        />
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <input
                                type="number"
                                step="any"
                                placeholder="Lat"
                                value={formData.pickup_lat}
                                onChange={(e) => setFormData({ ...formData, pickup_lat: e.target.value })}
                                className="px-3 py-2 rounded-lg bg-surface border border-divider text-sm focus:border-amber-500 outline-none"
                            />
                            <input
                                type="number"
                                step="any"
                                placeholder="Lng"
                                value={formData.pickup_lng}
                                onChange={(e) => setFormData({ ...formData, pickup_lng: e.target.value })}
                                className="px-3 py-2 rounded-lg bg-surface border border-divider text-sm focus:border-amber-500 outline-none"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-text-muted mb-2">
                            Dropoff Address
                        </label>
                        <AddressInput
                            value={formData.dropoff_address}
                            onChange={(addr, lat, lng) => {
                                setFormData(prev => ({
                                    ...prev,
                                    dropoff_address: addr,
                                    dropoff_lat: lat ? lat.toString() : prev.dropoff_lat,
                                    dropoff_lng: lng ? lng.toString() : prev.dropoff_lng,
                                }));
                            }}
                            placeholder="Enter delivery address"
                        />
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <input
                                type="number"
                                step="any"
                                placeholder="Lat"
                                value={formData.dropoff_lat}
                                onChange={(e) => setFormData({ ...formData, dropoff_lat: e.target.value })}
                                className="px-3 py-2 rounded-lg bg-surface border border-divider text-sm focus:border-amber-500 outline-none"
                            />
                            <input
                                type="number"
                                step="any"
                                placeholder="Lng"
                                value={formData.dropoff_lng}
                                onChange={(e) => setFormData({ ...formData, dropoff_lng: e.target.value })}
                                className="px-3 py-2 rounded-lg bg-surface border border-divider text-sm focus:border-amber-500 outline-none"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-text-muted mb-2">
                                Scheduled Date
                            </label>
                            <input
                                type="date"
                                value={formData.scheduled_date}
                                onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl bg-surface border border-divider text-text-main placeholder-text-muted focus:outline-none focus:border-amber-500 transition-colors"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-text-muted mb-2">
                                Payout Amount ($)
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={formData.payout_amount}
                                onChange={(e) => setFormData({ ...formData, payout_amount: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl bg-surface border border-divider text-text-main placeholder-text-muted focus:outline-none focus:border-amber-500 transition-colors"
                                placeholder="0.00"
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-text-muted mb-2">
                                Pickup By (Time)
                            </label>
                            <input
                                type="time"
                                value={formData.time_window_start}
                                onChange={(e) => setFormData({ ...formData, time_window_start: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl bg-surface border border-divider text-text-main placeholder-text-muted focus:outline-none focus:border-amber-500 transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-text-muted mb-2">
                                Deliver By (Time)
                            </label>
                            <input
                                type="time"
                                value={formData.time_window_end}
                                onChange={(e) => setFormData({ ...formData, time_window_end: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl bg-surface border border-divider text-text-main placeholder-text-muted focus:outline-none focus:border-amber-500 transition-colors"
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-3 rounded-xl bg-surface text-text-main font-medium hover:bg-surface/80 border border-divider transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 font-semibold hover:from-amber-400 hover:to-orange-400 transition-all disabled:opacity-50"
                        >
                            {loading ? 'Creating...' : 'Create Order'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function NoteModal({
    order,
    onClose,
    onSave,
}: {
    order: Order;
    onClose: () => void;
    onSave: () => void;
}) {
    const { showNotification } = useNotification();
    const [note, setNote] = useState(order.admin_notes || '');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateDoc(doc(firebaseDb, 'orders', order.id), {
                admin_notes: note,
                updated_at: new Date()
            } as any);
            onSave();
            onClose();
        } catch (error) {
            console.error('Error saving note:', error);
            showNotification('Failed to save note', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-2xl border border-divider w-full max-w-md shadow-2xl">
                <div className="flex items-center justify-between p-6 border-b border-divider">
                    <h2 className="text-xl font-semibold text-text-main">Order Notes</h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-surface text-text-muted hover:text-text-main transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6">
                    <p className="text-sm text-text-muted mb-4">
                        Add notes for the driver. These will be visible in the driver app.
                    </p>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        className="w-full h-32 px-4 py-3 rounded-xl bg-surface border border-divider text-text-main placeholder-text-muted focus:outline-none focus:border-amber-500 transition-colors resize-none"
                        placeholder="e.g. Call upon arrival, Gate code #1234..."
                        autoFocus
                    />
                    <div className="flex gap-3 mt-6">
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 rounded-xl bg-surface text-text-main font-medium hover:bg-surface/80 border border-divider transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-all disabled:opacity-50"
                        >
                            {saving ? 'Saving...' : 'Save Note'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
