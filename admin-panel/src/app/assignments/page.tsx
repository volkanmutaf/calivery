'use client';

import { useNotification } from '@/lib/notification-context';
import { useTenant } from '@/lib/tenant-context';
import { useAuth } from '@/lib/auth-context';
import { useEffect, useState, useMemo } from 'react';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { firebaseDb, firebaseFunctions } from '@/lib/firebase';
import { Order, Profile } from '@/types';
import { format } from 'date-fns';
import {
    DndContext,
    DragEndEvent,
    DragOverlay,
    DragStartEvent,
    PointerSensor,
    useSensor,
    useSensors,
    useDroppable,
    useDraggable,
    closestCenter,
} from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
    useSortable,
    arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    Route,
    Users,
    Package,
    Play,
    CheckCircle2,
    X,
    Loader2,
    UserPlus,
    Map,
    Clock,
    Navigation,
    Search,
    GripVertical,
    Undo2,
    Save,
    Shuffle,
    Eye,
    MousePointerClick,
    ChevronDown,
    Edit,
} from 'lucide-react';

interface DriverWithId extends Profile {
    id: string;
}

interface RoutePreview {
    route_group_id: string;
    driver_id: string;
    driver_username: string;
    orders: string[];
    total_distance_miles: number;
    total_duration_mins: number;
    google_maps_url: string;
    steps: Array<{
        sequence_index: number;
        order_id: string;
        task_type: string;
        address: string;
        lat: number;
        lng: number;
        estimated_time: string;
    }>;
    fairness_score: number;
}

import { haversineDistance } from '@/lib/routing';

// Haversine distance in miles
const haversineDistanceMi = haversineDistance;

// ═══════════════════════════════════════════════════════
// MAIN PAGE — Tabs: "Route Planner" (original) | "Drag & Drop" (new)
// ═══════════════════════════════════════════════════════

export default function AssignmentsPage() {
    const { showNotification } = useNotification();
    const { tenantId } = useTenant();
    const { role: userRole } = useAuth();
    const [activeTab, setActiveTab] = useState<'planner' | 'dragdrop'>('planner');
    const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [unassignedOrders, setUnassignedOrders] = useState<Order[]>([]);
    const [assignedOrders, setAssignedOrders] = useState<Order[]>([]);
    const [activeDrivers, setActiveDrivers] = useState<DriverWithId[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch unassigned orders
            let unassignedQ = query(
                collection(firebaseDb, 'orders'),
                where('scheduled_date', '==', selectedDate),
                where('status', '==', 'new')
            );
            if (userRole !== 'super_admin') {
                const filterId = tenantId || 'default';
                unassignedQ = query(unassignedQ, where('tenant_id', '==', filterId));
            }
            const newOrdersSnap = await getDocs(unassignedQ);

            const newOrders: Order[] = [];
            newOrdersSnap.forEach((doc) => {
                const data = doc.data();
                newOrders.push({
                    id: doc.id,
                    ...data,
                    created_at: data.created_at?.toDate?.() || new Date(),
                    time_window_start: data.time_window_start?.toDate?.() || null,
                    time_window_end: data.time_window_end?.toDate?.() || null,
                } as Order);
            });
            setUnassignedOrders(newOrders);

            // Fetch assigned orders (published)
            let assignedQ = query(
                collection(firebaseDb, 'orders'),
                where('scheduled_date', '==', selectedDate),
                where('status', 'in', ['assigned', 'in_progress'])
            );
            if (userRole !== 'super_admin') {
                const filterId = tenantId || 'default';
                assignedQ = query(assignedQ, where('tenant_id', '==', filterId));
            }
            const assignedSnap = await getDocs(assignedQ);

            const aOrders: Order[] = [];
            assignedSnap.forEach((doc) => {
                const data = doc.data();
                aOrders.push({
                    id: doc.id,
                    ...data,
                    created_at: data.created_at?.toDate?.() || new Date(),
                    time_window_start: data.time_window_start?.toDate?.() || null,
                    time_window_end: data.time_window_end?.toDate?.() || null,
                } as Order);
            });
            setAssignedOrders(aOrders);

            let driversQ = query(
                collection(firebaseDb, 'profiles'),
                where('role', '==', 'driver'),
                where('is_active', '==', true)
            );
            if (userRole !== 'super_admin') {
                const filterId = tenantId || 'default';
                driversQ = query(driversQ, where('tenant_id', '==', filterId));
            }
            const driversSnap = await getDocs(driversQ);

            const drivers: DriverWithId[] = [];
            driversSnap.forEach((doc) => {
                drivers.push({ id: doc.id, ...doc.data() } as DriverWithId);
            });
            setActiveDrivers(drivers);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [selectedDate, tenantId]);

    return (
        <div className="p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-text-main">Assignments</h1>
                    <p className="text-text-muted mt-1">Route planning and driver assignment control center</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 p-1 rounded-xl bg-surface/50 border border-divider/50">
                        <button
                            onClick={() => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedDate === format(new Date(), 'yyyy-MM-dd')
                                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 shadow-lg shadow-amber-500/20'
                                : 'text-text-muted hover:text-text-main hover:bg-surface'
                                }`}
                        >
                            Today
                        </button>
                        <button
                            onClick={() => {
                                const tomorrow = new Date();
                                tomorrow.setDate(tomorrow.getDate() + 1);
                                setSelectedDate(format(tomorrow, 'yyyy-MM-dd'));
                            }}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedDate === format((() => { const d = new Date(); d.setDate(d.getDate() + 1); return d; })(), 'yyyy-MM-dd')
                                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 shadow-lg shadow-amber-500/20'
                                : 'text-text-muted hover:text-text-main hover:bg-surface'
                                }`}
                        >
                            Tomorrow
                        </button>
                    </div>
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="px-4 py-2.5 rounded-xl bg-surface border border-divider text-text-main focus:outline-none focus:border-amber-500 transition-colors cursor-pointer"
                    />
                </div>
            </div>

            {/* Tab Switcher */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-surface/50 border border-divider/50 w-fit mb-6">
                <button
                    onClick={() => setActiveTab('planner')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'planner'
                        ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 shadow-lg shadow-amber-500/20'
                        : 'text-text-muted hover:text-text-main hover:bg-surface'
                        }`}
                >
                    <Shuffle size={16} />
                    Route Planner
                </button>
                <button
                    onClick={() => setActiveTab('dragdrop')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'dragdrop'
                        ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 shadow-lg shadow-amber-500/20'
                        : 'text-text-muted hover:text-text-main hover:bg-surface'
                        }`}
                >
                    <MousePointerClick size={16} />
                    Drag & Drop
                </button>
            </div>

            {activeTab === 'planner' ? (
                <RoutePlannerTab
                    selectedDate={selectedDate}
                    unassignedOrders={unassignedOrders}
                    assignedOrders={assignedOrders}
                    activeDrivers={activeDrivers}
                    loading={loading}
                    onRefresh={fetchData}
                />
            ) : (
                <DragDropTab
                    selectedDate={selectedDate}
                    unassignedOrders={unassignedOrders}
                    assignedOrders={assignedOrders}
                    activeDrivers={activeDrivers}
                    loading={loading}
                    onRefresh={fetchData}
                />
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// TAB 1: ROUTE PLANNER (original system — restored)
// ═══════════════════════════════════════════════════════

function RoutePlannerTab({
    selectedDate,
    unassignedOrders,
    assignedOrders,
    activeDrivers,
    loading,
    onRefresh,
}: {
    selectedDate: string;
    unassignedOrders: Order[];
    assignedOrders: Order[];
    activeDrivers: DriverWithId[];
    loading: boolean;
    onRefresh: () => void;
}) {
    const { showNotification } = useNotification();
    const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
    const [selectedDrivers, setSelectedDrivers] = useState<Set<string>>(new Set());
    const [maxOrdersPerDriver, setMaxOrdersPerDriver] = useState(3);
    const [routePreviews, setRoutePreviews] = useState<RoutePreview[]>([]);
    const [generating, setGenerating] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [manualAssigning, setManualAssigning] = useState(false);
    const [selectedTargetDriver, setSelectedTargetDriver] = useState<string | null>(null);
    const [previewMode, setPreviewMode] = useState<'auto' | 'manual' | null>(null);
    const [expandedDrivers, setExpandedDrivers] = useState<Set<string>>(new Set());

    // Group assigned orders by driver
    const assignedByDriver = useMemo(() => {
        const map: Record<string, Order[]> = {};
        assignedOrders.forEach((o) => {
            if (o.assigned_driver_id) {
                if (!map[o.assigned_driver_id]) map[o.assigned_driver_id] = [];
                map[o.assigned_driver_id].push(o);
            }
        });
        return map;
    }, [assignedOrders]);

    const toggleDriverExpand = (driverId: string) => {
        setExpandedDrivers((prev) => {
            const next = new Set(prev);
            if (next.has(driverId)) next.delete(driverId);
            else next.add(driverId);
            return next;
        });
    };

    useEffect(() => {
        setSelectedOrders(new Set());
        setSelectedDrivers(new Set());
        setRoutePreviews([]);
        setShowPreview(false);
    }, [selectedDate]);

    const toggleOrderSelection = (orderId: string) => {
        const newSelected = new Set(selectedOrders);
        if (newSelected.has(orderId)) newSelected.delete(orderId);
        else newSelected.add(orderId);
        setSelectedOrders(newSelected);
    };

    const toggleDriverSelection = (driverId: string) => {
        const newSelected = new Set(selectedDrivers);
        if (newSelected.has(driverId)) newSelected.delete(driverId);
        else newSelected.add(driverId);
        setSelectedDrivers(newSelected);
    };

    const toggleAllOrders = () => {
        if (selectedOrders.size === unassignedOrders.length) setSelectedOrders(new Set());
        else setSelectedOrders(new Set(unassignedOrders.map((o) => o.id)));
    };

    const toggleAllDrivers = () => {
        if (selectedDrivers.size === activeDrivers.length) setSelectedDrivers(new Set());
        else setSelectedDrivers(new Set(activeDrivers.map((d) => d.id)));
    };

    const generateRoutes = async () => {
        setGenerating(true);
        try {
            const autoAssign = httpsCallable(firebaseFunctions, 'autoAssignOrders');
            const result = await autoAssign({
                scheduled_date: selectedDate,
                order_ids: selectedOrders.size > 0 ? Array.from(selectedOrders) : undefined,
                driver_ids: selectedDrivers.size > 0 ? Array.from(selectedDrivers) : undefined,
                max_orders_per_driver: maxOrdersPerDriver,
                preview_only: true,
            });
            const data = result.data as { route_groups: RoutePreview[] };
            setRoutePreviews(data.route_groups);
            setShowPreview(true);
            setPreviewMode('auto');
        } catch (error) {
            console.error('Error generating routes:', error);
            showNotification('Failed to generate routes. Please try again.', 'error');
        } finally {
            setGenerating(false);
        }
    };

    const manualAssignOrders = async () => {
        if (selectedDrivers.size !== 1 || selectedOrders.size === 0) return;
        const selectedDriverId = Array.from(selectedDrivers)[0];
        setSelectedTargetDriver(selectedDriverId);
        setManualAssigning(true);
        try {
            const manualAssign = httpsCallable(firebaseFunctions, 'manualAssignOrders');
            const result = await manualAssign({
                scheduled_date: selectedDate,
                order_ids: Array.from(selectedOrders),
                driver_id: selectedDriverId,
                preview_only: true,
            });
            const data = result.data as { route_groups: RoutePreview[] };
            setRoutePreviews(data.route_groups);
            setPreviewMode('manual');
            setShowPreview(true);
        } catch (error) {
            console.error('Error manual assigning orders:', error);
            showNotification('Failed to calculate route. Please try again.', 'error');
        } finally {
            setManualAssigning(false);
        }
    };

    const publishRoutes = async () => {
        setPublishing(true);
        try {
            if (previewMode === 'manual' && selectedTargetDriver) {
                const manualAssign = httpsCallable(firebaseFunctions, 'manualAssignOrders');
                await manualAssign({
                    scheduled_date: selectedDate,
                    order_ids: Array.from(selectedOrders),
                    driver_id: selectedTargetDriver,
                    preview_only: false,
                });
            } else {
                const autoAssign = httpsCallable(firebaseFunctions, 'autoAssignOrders');
                await autoAssign({
                    scheduled_date: selectedDate,
                    order_ids: selectedOrders.size > 0 ? Array.from(selectedOrders) : undefined,
                    driver_ids: selectedDrivers.size > 0 ? Array.from(selectedDrivers) : undefined,
                    max_orders_per_driver: maxOrdersPerDriver,
                    preview_only: false,
                });
            }
            showNotification('Routes published successfully!', 'success');
            onRefresh();
            setRoutePreviews([]);
            setShowPreview(false);
            setSelectedOrders(new Set());
            setSelectedDrivers(new Set());
            setPreviewMode(null);
            setSelectedTargetDriver(null);
        } catch (error) {
            console.error('Error publishing routes:', error);
            showNotification('Failed to publish routes. Please try again.', 'error');
        } finally {
            setPublishing(false);
        }
    };

    return (
        <>
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 size={40} className="text-amber-500 animate-spin" />
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Unassigned Orders */}
                    <div className="bg-card/50 backdrop-blur rounded-2xl border border-divider/50 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <Package size={20} className="text-amber-500" />
                                <h2 className="text-lg font-semibold text-text-main">Unassigned Orders</h2>
                                <span className="px-2 py-0.5 rounded-full bg-surface text-text-muted text-xs border border-divider">
                                    {unassignedOrders.length}
                                </span>
                            </div>
                            <button onClick={toggleAllOrders} className="text-sm text-amber-500 hover:text-amber-400 transition-colors">
                                {unassignedOrders.length > 0 && selectedOrders.size === unassignedOrders.length ? 'Deselect All' : 'Select All'}
                            </button>
                        </div>
                        <div className="space-y-2 max-h-80 overflow-y-auto">
                            {unassignedOrders.length === 0 ? (
                                <p className="text-text-muted text-center py-8">No unassigned orders for this date</p>
                            ) : (
                                unassignedOrders.map((order) => {
                                    // Calculate distance to selected driver (if exactly 1 selected)
                                    let distanceMi: number | null = null;
                                    if (selectedDrivers.size === 1) {
                                        const driverId = Array.from(selectedDrivers)[0];
                                        const driver = activeDrivers.find(d => d.id === driverId);
                                        if (driver && driver.driver_base_lat && driver.driver_base_lng && order.pickup_lat && order.pickup_lng) {
                                            distanceMi = haversineDistanceMi(driver.driver_base_lat, driver.driver_base_lng, order.pickup_lat, order.pickup_lng);
                                        }
                                    }
                                    // Find nearest driver to this order's pickup
                                    let nearestDriverName: string | null = null;
                                    if (selectedOrders.has(order.id) && order.pickup_lat && order.pickup_lng && activeDrivers.length > 0) {
                                        let minDist = Infinity;
                                        for (const d of activeDrivers) {
                                            if (d.driver_base_lat && d.driver_base_lng) {
                                                const dist = haversineDistanceMi(d.driver_base_lat, d.driver_base_lng, order.pickup_lat, order.pickup_lng);
                                                if (dist < minDist) {
                                                    minDist = dist;
                                                    nearestDriverName = d.username;
                                                }
                                            }
                                        }
                                    }
                                    return (
                                        <button
                                            key={order.id}
                                            onClick={() => toggleOrderSelection(order.id)}
                                            className={`w-full text-left p-3 rounded-xl border transition-all ${selectedOrders.has(order.id)
                                                ? 'bg-amber-500/20 border-amber-500/50'
                                                : 'bg-surface/50 border-divider/50 hover:border-divider'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-text-main font-medium truncate">{order.restaurant_name}</p>
                                                        {(order.time_window_start || order.time_window_end) && (
                                                            <span className="text-xs text-text-muted bg-surface px-1.5 py-0.5 rounded border border-divider flex items-center gap-1 flex-shrink-0">
                                                                <Clock size={10} />
                                                                {order.time_window_start ? format(order.time_window_start, 'HH:mm') : '--:--'}
                                                                {' - '}
                                                                {order.time_window_end ? format(order.time_window_end, 'HH:mm') : '--:--'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-text-muted text-[11px] truncate mt-0.5">📦 {order.pickup_address}</p>
                                                    <p className="text-text-muted text-[11px] truncate">📍 {order.dropoff_address}</p>
                                                </div>
                                                <div className="text-right flex-shrink-0 ml-2">
                                                    <p className="text-emerald-400 font-medium">${order.payout_amount}</p>
                                                    {distanceMi !== null && (
                                                        <p className="text-[11px] text-blue-400 font-medium flex items-center gap-1 justify-end mt-0.5">
                                                            <Navigation size={10} />
                                                            {distanceMi.toFixed(1)} mi
                                                        </p>
                                                    )}
                                                    {selectedOrders.has(order.id) && (
                                                        <div className="flex items-center gap-1.5 mt-1 ml-auto">
                                                            {nearestDriverName && (
                                                                <span className="text-[10px] text-amber-400/80 font-medium">
                                                                    ↗ {nearestDriverName}
                                                                </span>
                                                            )}
                                                            <CheckCircle2 size={16} className="text-amber-500" />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Active Drivers */}
                    <div className="bg-card/50 backdrop-blur rounded-2xl border border-divider/50 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <Users size={20} className="text-emerald-500" />
                                <h2 className="text-lg font-semibold text-text-main">Active Drivers</h2>
                                <span className="px-2 py-0.5 rounded-full bg-surface text-text-muted text-xs border border-divider">
                                    {activeDrivers.length}
                                </span>
                            </div>
                            <button onClick={toggleAllDrivers} className="text-sm text-amber-500 hover:text-amber-400 transition-colors">
                                {activeDrivers.length > 0 && selectedDrivers.size === activeDrivers.length ? 'Deselect All' : 'Select All'}
                            </button>
                        </div>
                        <div className="space-y-2 max-h-80 overflow-y-auto">
                            {activeDrivers.length === 0 ? (
                                <p className="text-text-muted text-center py-8">No active drivers available</p>
                            ) : (
                                activeDrivers.map((driver) => {
                                    const driverAssigned = assignedByDriver[driver.id] || [];
                                    const isExpanded = expandedDrivers.has(driver.id);
                                    return (
                                        <div key={driver.id} className="space-y-0">
                                            <div className="flex items-stretch gap-0">
                                                {/* Main selectable area */}
                                                <button
                                                    onClick={() => toggleDriverSelection(driver.id)}
                                                    className={`flex-1 text-left p-3 rounded-l-xl border-y border-l transition-all ${selectedDrivers.has(driver.id)
                                                        ? 'bg-emerald-500/20 border-emerald-500/50'
                                                        : 'bg-surface/50 border-divider/50 hover:border-divider'
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center font-bold text-white">
                                                            {driver.username.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div className="flex-1">
                                                            <p className="text-text-main font-medium">{driver.username}</p>
                                                            <p className="text-text-muted text-sm truncate">{driver.driver_base_address || 'No base address'}</p>
                                                        </div>
                                                        {driverAssigned.length > 0 && (
                                                            <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold border border-blue-500/30">
                                                                {driverAssigned.length} assigned
                                                            </span>
                                                        )}
                                                        {selectedDrivers.has(driver.id) && <CheckCircle2 size={20} className="text-emerald-500" />}
                                                    </div>
                                                </button>
                                                {/* Expand toggle button */}
                                                {driverAssigned.length > 0 && (
                                                    <button
                                                        onClick={() => toggleDriverExpand(driver.id)}
                                                        className={`px-3 rounded-r-xl border-y border-r transition-all flex items-center ${selectedDrivers.has(driver.id)
                                                            ? 'bg-emerald-500/10 border-emerald-500/50 hover:bg-emerald-500/20'
                                                            : 'bg-surface/50 border-divider/50 hover:bg-surface'
                                                            }`}
                                                    >
                                                        <ChevronDown size={16} className={`text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                                    </button>
                                                )}
                                                {driverAssigned.length === 0 && (
                                                    <div className={`rounded-r-xl border-y border-r w-px ${selectedDrivers.has(driver.id)
                                                        ? 'border-emerald-500/50'
                                                        : 'border-divider/50'
                                                        }`} />
                                                )}
                                            </div>
                                            {/* Expanded assigned orders */}
                                            {isExpanded && driverAssigned.length > 0 && (
                                                <div className="ml-[52px] mt-1 mb-2 space-y-1">
                                                    {driverAssigned.map((order, idx) => (
                                                        <div key={order.id} className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20">
                                                            <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                                                                {idx + 1}
                                                            </span>
                                                            <Package size={12} className="text-blue-400 flex-shrink-0" />
                                                            <span className="text-text-main text-xs font-medium truncate flex-1">{order.restaurant_name}</span>
                                                            <span className="text-xs text-text-muted">{order.order_code}</span>
                                                            <span className={`text-xs font-semibold flex-shrink-0 ${order.status === 'in_progress' ? 'text-amber-400' : 'text-blue-400'}`}>
                                                                {order.status === 'in_progress' ? 'In Progress' : 'Assigned'}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Assignment Controls */}
            <div className="mt-6 bg-card/50 backdrop-blur rounded-2xl border border-divider/50 p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div>
                            <label className="block text-sm text-text-muted mb-1">Max orders per driver</label>
                            <input
                                type="number"
                                min={1}
                                max={10}
                                value={maxOrdersPerDriver}
                                onChange={(e) => setMaxOrdersPerDriver(parseInt(e.target.value) || 3)}
                                className="w-24 px-3 py-2 rounded-lg bg-surface border border-divider text-text-main focus:outline-none focus:border-amber-500"
                            />
                        </div>
                        <div className="text-text-muted text-sm">
                            <p>Selected: {selectedOrders.size} orders, {selectedDrivers.size} drivers</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={manualAssignOrders}
                            disabled={selectedOrders.size === 0 || selectedDrivers.size !== 1 || manualAssigning}
                            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold hover:from-emerald-400 hover:to-teal-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed min-w-[180px] justify-center"
                            title={selectedDrivers.size !== 1 ? 'Select exactly 1 driver for manual assignment' : ''}
                        >
                            {manualAssigning ? <Loader2 size={20} className="animate-spin" /> : <UserPlus size={20} />}
                            {manualAssigning
                                ? 'Calculating...'
                                : `Manual Assign ${selectedDrivers.size === 1 ? `to ${activeDrivers.find((d) => selectedDrivers.has(d.id))?.username || 'Driver'}` : ''}`}
                        </button>
                        <button
                            onClick={generateRoutes}
                            disabled={generating || unassignedOrders.length === 0 || activeDrivers.length === 0}
                            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 font-semibold hover:from-amber-400 hover:to-orange-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {generating ? <Loader2 size={20} className="animate-spin" /> : <Shuffle size={20} />}
                            Generate Fair Routes
                        </button>
                    </div>
                </div>
            </div>

            {/* Route Preview Modal */}
            {showPreview && routePreviews.length > 0 && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-card rounded-2xl border border-divider w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between p-6 border-b border-divider">
                            <div className="flex items-center gap-3">
                                <Route size={24} className="text-amber-500" />
                                <div>
                                    <h2 className="text-xl font-semibold text-text-main">Route Preview</h2>
                                    <p className="text-text-muted text-sm">Review and publish generated routes</p>
                                </div>
                            </div>
                            <button onClick={() => setShowPreview(false)} className="p-2 rounded-lg hover:bg-surface text-text-muted hover:text-text-main transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            {routePreviews.map((route) => {
                                // Build order lookup for restaurant names
                                const orderMap: Record<string, Order> = {};
                                unassignedOrders.forEach(o => { orderMap[o.id] = o; });

                                // Build Google Maps Static API URL with markers and path
                                const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
                                const markers = route.steps.map((step) => {
                                    const seqNum = step.sequence_index + 1;
                                    const label = seqNum <= 9 ? String(seqNum) : String.fromCharCode(55 + seqNum);
                                    const color = step.task_type === 'pickup' ? 'blue' : 'green';
                                    return `markers=color:${color}%7Csize:mid%7Clabel:${label}%7C${step.lat},${step.lng}`;
                                }).join('&');
                                const pathPoints = route.steps.map(s => `${s.lat},${s.lng}`).join('|');
                                const staticMapUrl = apiKey
                                    ? `https://maps.googleapis.com/maps/api/staticmap?size=640x400&scale=2&maptype=roadmap&${markers}&path=color:0xF59E0BAA|weight:3|${pathPoints}&key=${apiKey}`
                                    : '';

                                return (
                                    <div key={route.route_group_id} className="bg-surface/50 rounded-xl border border-divider/50 p-4">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center font-bold text-white">
                                                    {route.driver_username.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="text-text-main font-medium">{route.driver_username}</p>
                                                    <div className="flex items-center gap-3 mt-0.5">
                                                        <p className="text-text-muted text-xs flex items-center gap-1">
                                                            <Navigation size={12} className="text-amber-500" />
                                                            {route.total_distance_miles} mi
                                                        </p>
                                                        <p className="text-text-muted text-xs flex items-center gap-1">
                                                            <Clock size={12} className="text-blue-500" />
                                                            {route.total_duration_mins} min
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                                <a
                                                    href={route.google_maps_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-500/10 px-2.5 py-1.5 rounded-lg border border-emerald-500/20"
                                                >
                                                    <Map size={14} />
                                                    View Route Map
                                                </a>
                                                {staticMapUrl && (
                                                    <div className="relative group/map">
                                                        <button className="flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/10 px-2.5 py-1.5 rounded-lg border border-blue-500/20">
                                                            <Eye size={14} />
                                                            Quick View
                                                        </button>
                                                        <div className="fixed inset-0 z-[100] hidden group-hover/map:flex items-center justify-center bg-black/50 pointer-events-none">
                                                            <div className="rounded-2xl overflow-hidden border-2 border-divider shadow-2xl shadow-black/60">
                                                                <img
                                                                    src={staticMapUrl}
                                                                    alt={`Route map for ${route.driver_username}`}
                                                                    style={{ width: '45vw', maxWidth: '700px', height: 'auto' }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="text-right">
                                                    <span className="text-[10px] uppercase font-bold text-text-muted block">Fairness</span>
                                                    <span className="text-text-main font-bold">{route.fairness_score.toFixed(1)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Route Sequence Summary */}
                                        <div className="flex items-center gap-1 mb-3 flex-wrap">
                                            <span className="text-[10px] text-text-muted font-semibold uppercase mr-1">Route:</span>
                                            {route.steps.map((step, idx) => (
                                                <span key={idx} className="flex items-center gap-0.5">
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${step.task_type === 'pickup' ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                                                        {step.task_type === 'pickup' ? 'P' : 'D'}{step.sequence_index + 1}
                                                    </span>
                                                    {idx < route.steps.length - 1 && (
                                                        <span className="text-text-muted text-[10px]">→</span>
                                                    )}
                                                </span>
                                            ))}
                                        </div>

                                        {/* Steps Detail */}
                                        <div className="space-y-2">
                                            {route.steps.map((step, stepIndex) => {
                                                const stepOrder = orderMap[step.order_id];
                                                return (
                                                    <div key={stepIndex} className="flex items-center gap-3 py-2 group">
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${step.task_type === 'pickup' ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                                                            {step.sequence_index + 1}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <div className="flex items-center gap-2">
                                                                    <p className={`text-[10px] font-bold uppercase tracking-wider ${step.task_type === 'pickup' ? 'text-blue-400' : 'text-emerald-400'}`}>
                                                                        {step.task_type}
                                                                    </p>
                                                                    {stepOrder && (
                                                                        <span className="text-text-main text-xs font-medium">
                                                                            {stepOrder.restaurant_name}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <span className="text-text-muted text-[11px] font-medium bg-surface px-1.5 py-0.5 rounded flex items-center gap-1 flex-shrink-0">
                                                                    <Clock size={10} />
                                                                    {step.estimated_time}
                                                                </span>
                                                            </div>
                                                            <p className="text-text-muted text-xs truncate mt-0.5">{step.address}</p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="p-6 border-t border-divider flex gap-3">
                            <button onClick={() => setShowPreview(false)} className="flex-1 px-4 py-3 rounded-xl bg-surface text-text-main font-medium hover:bg-surface/80 border border-divider transition-colors">
                                Cancel
                            </button>
                            <button
                                onClick={publishRoutes}
                                disabled={publishing}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold hover:from-emerald-400 hover:to-teal-400 transition-all disabled:opacity-50"
                            >
                                {publishing ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} />}
                                Publish Routes
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// ═══════════════════════════════════════════════════════
// TAB 2: DRAG & DROP
// ═══════════════════════════════════════════════════════

// ─── Draggable Order Card (from unassigned list) ───
function DraggableOrderCard({ order, isDragging, distanceMi }: { order: Order; isDragging?: boolean; distanceMi?: number | null }) {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: `order-${order.id}`,
        data: { type: 'order', order },
    });

    const style = transform
        ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 1000 }
        : undefined;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`group flex items-center gap-3 p-3 rounded-xl border transition-all cursor-grab active:cursor-grabbing
                ${isDragging ? 'opacity-40 border-amber-500/30 bg-amber-500/5' : 'bg-surface/50 border-divider/50 hover:border-amber-500/40 hover:bg-surface/80'}`}
            {...listeners}
            {...attributes}
        >
            <div className="flex-shrink-0 text-text-muted group-hover:text-amber-500 transition-colors">
                <GripVertical size={18} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <p className="text-text-main font-medium text-sm truncate">{order.restaurant_name}</p>
                    {(order.time_window_start || order.time_window_end) && (
                        <span className="text-[10px] text-text-muted bg-surface px-1.5 py-0.5 rounded border border-divider flex items-center gap-1 flex-shrink-0">
                            <Clock size={9} />
                            {order.time_window_start ? format(order.time_window_start, 'HH:mm') : '--:--'}
                            {' - '}
                            {order.time_window_end ? format(order.time_window_end, 'HH:mm') : '--:--'}
                        </span>
                    )}
                </div>
                <p className="text-text-muted text-[10px] truncate mt-0.5">📦 {order.pickup_address}</p>
                <p className="text-text-muted text-[10px] truncate">📍 {order.dropoff_address}</p>
            </div>
            <div className="flex-shrink-0 text-right">
                <p className="text-emerald-400 font-semibold text-sm">${order.payout_amount}</p>
                {distanceMi != null && (
                    <p className="text-[10px] text-blue-400 font-medium flex items-center gap-1 justify-end mt-0.5">
                        <Navigation size={9} />
                        {distanceMi.toFixed(1)} mi
                    </p>
                )}
            </div>
        </div>
    );
}

// ─── Sortable Order inside a Driver ───
function SortableAssignedOrder({ order, index, onRemove }: { order: Order; index: number; onRemove: () => void }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: `assigned-${order.id}`,
        data: { type: 'assigned', order },
    });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition: transition ?? undefined,
    };

    // When this item is being dragged, show a ghost placeholder (same height)
    if (isDragging) {
        return (
            <div
                ref={setNodeRef}
                style={style}
                className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg border-2 border-dashed border-amber-500/50 bg-amber-500/5"
            >
                <span className="w-5 h-5 flex-shrink-0" />
                <span className="text-transparent text-xs">{order.restaurant_name}</span>
            </div>
        );
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg bg-surface/60 border border-divider/30 group/item"
        >
            <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                {index + 1}
            </span>
            {/* Drag handle — only this element initiates the drag */}
            <button
                className="cursor-grab active:cursor-grabbing text-text-muted hover:text-amber-500 transition-colors flex-shrink-0 touch-none"
                {...attributes}
                {...listeners}
            >
                <GripVertical size={14} />
            </button>
            <Package size={12} className="text-amber-500 flex-shrink-0" />
            <span className="text-text-main text-xs font-medium truncate flex-1">{order.restaurant_name}</span>
            <span className="text-emerald-400 text-xs font-semibold flex-shrink-0">${order.payout_amount}</span>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="opacity-0 group-hover/item:opacity-100 p-1 rounded text-red-400 hover:bg-red-500/20 transition-all flex-shrink-0"
                title="Remove"
            >
                <X size={14} />
            </button>
        </div>
    );
}

// ─── Droppable Driver Card ───
function DroppableDriverCard({
    driver,
    isSelected,
    assignedOrders,
    publishedOrders,
    onSelect,
    onRemoveOrder,
    onRemovePublished,
    onReorder,
}: {
    driver: DriverWithId;
    isSelected: boolean;
    assignedOrders: Order[];
    publishedOrders: Order[];
    onSelect: () => void;
    onRemoveOrder: (orderId: string) => void;
    onRemovePublished: (orderId: string) => void;
    onReorder: (oldIndex: number, newIndex: number) => void;
}) {
    const { isOver, setNodeRef } = useDroppable({
        id: `driver-${driver.id}`,
        data: { type: 'driver', driverId: driver.id },
    });

    const sortableIds = assignedOrders.map((o) => `assigned-${o.id}`);

    return (
        <div
            ref={setNodeRef}
            onClick={onSelect}
            className={`p-4 rounded-xl border-2 transition-all cursor-pointer
                ${isOver ? 'border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/10 scale-[1.01]'
                    : isSelected ? 'border-emerald-500/60 bg-emerald-500/10'
                        : 'border-divider/50 bg-surface/30 hover:border-divider hover:bg-surface/50'}`}
        >
            <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 transition-all
                    ${isSelected ? 'bg-gradient-to-br from-emerald-500 to-teal-500 ring-2 ring-emerald-500/40' : 'bg-gradient-to-br from-slate-600 to-slate-700'}`}>
                    {driver.username.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-text-main font-medium">{driver.username}</p>
                    <p className="text-text-muted text-xs truncate">{driver.driver_base_address || 'No base address'}</p>
                </div>
                {isSelected && <CheckCircle2 size={20} className="text-emerald-500 flex-shrink-0" />}
                {publishedOrders.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-semibold flex-shrink-0 border border-blue-500/30">
                        {publishedOrders.length} published
                    </span>
                )}
                {assignedOrders.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-semibold flex-shrink-0 border border-amber-500/30">
                        +{assignedOrders.length}
                    </span>
                )}
            </div>

            {/* Published orders — slim, with hover remove */}
            {publishedOrders.length > 0 && (
                <div className="mt-2 pl-[52px] flex flex-col gap-0.5">
                    {publishedOrders.map((order, idx) => (
                        <div key={order.id} className="group/pub flex items-center gap-1.5 py-0.5 px-2 rounded bg-blue-500/5 border border-transparent hover:border-blue-500/20 transition-colors">
                            <span className="w-4 h-4 rounded-full bg-blue-500/15 text-blue-400 text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                                {idx + 1}
                            </span>
                            <Package size={10} className="text-blue-400/70 flex-shrink-0" />
                            <span className="text-text-main/80 text-[11px] truncate flex-1">{order.restaurant_name}</span>
                            <span className={`text-[9px] font-medium flex-shrink-0 ${order.status === 'in_progress' ? 'text-amber-400/70' : 'text-blue-400/50'}`}>
                                {order.status === 'in_progress' ? 'Active' : 'Published'}
                            </span>
                            <button
                                onClick={(e) => { e.stopPropagation(); onRemovePublished(order.id); }}
                                onPointerDown={(e) => e.stopPropagation()}
                                className="opacity-0 group-hover/pub:opacity-100 p-1 rounded text-red-400/80 hover:text-red-400 hover:bg-red-500/15 transition-all flex-shrink-0"
                                title="Unassign"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Newly dragged (unsaved) orders — sortable */}
            {assignedOrders.length > 0 && (
                <div className={`${publishedOrders.length > 0 ? 'mt-1' : 'mt-2'} pl-[52px] flex flex-col gap-1`}>
                    {publishedOrders.length > 0 && (
                        <div className="border-t border-dashed border-divider/40 my-0.5" />
                    )}
                    <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                        {assignedOrders.map((order, idx) => (
                            <SortableAssignedOrder
                                key={order.id}
                                order={order}
                                index={publishedOrders.length + idx}
                                onRemove={() => onRemoveOrder(order.id)}
                            />
                        ))}
                    </SortableContext>
                </div>
            )}

            {isOver && (
                <div className="mt-2 py-1.5 text-center rounded-lg border-2 border-dashed border-amber-500/40 text-amber-400 text-[11px] font-medium animate-pulse">
                    Drop order here
                </div>
            )}
        </div>
    );
}

// ─── Overlay card ───
function DragOverlayCard({ order }: { order: Order }) {
    return (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-card border border-amber-500/40 shadow-xl shadow-amber-500/10 cursor-grabbing min-w-[200px]">
            <GripVertical size={18} className="text-amber-500" />
            <div className="flex-1 min-w-0">
                <p className="text-text-main font-medium text-sm truncate">{order.restaurant_name}</p>
                <p className="text-text-muted text-[10px] truncate mt-0.5">📦 {order.pickup_address}</p>
                <p className="text-text-muted text-[10px] truncate">📍 {order.dropoff_address}</p>
            </div>
            <p className="text-emerald-400 font-semibold text-sm">${order.payout_amount}</p>
        </div>
    );
}

// ─── Drag & Drop Tab Component ───
function DragDropTab({
    selectedDate,
    unassignedOrders,
    assignedOrders: publishedAssignedOrders,
    activeDrivers,
    loading,
    onRefresh,
}: {
    selectedDate: string;
    unassignedOrders: Order[];
    assignedOrders: Order[];
    activeDrivers: DriverWithId[];
    loading: boolean;
    onRefresh: () => void;
}) {
    const { showNotification } = useNotification();
    const [orderSearch, setOrderSearch] = useState('');
    const [driverSearch, setDriverSearch] = useState('');
    const [assignments, setAssignments] = useState<Record<string, string[]>>({});
    const [removedPublishedIds, setRemovedPublishedIds] = useState<Set<string>>(new Set());
    const [activeOrder, setActiveOrder] = useState<Order | null>(null);
    const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
    const [publishing, setPublishing] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    );

    // Reset when date changes
    useEffect(() => {
        setAssignments({});
        setRemovedPublishedIds(new Set());
        setSelectedDriverId(null);
    }, [selectedDate]);

    // Derived state
    const assignedOrderIds = useMemo(() => {
        const ids = new Set<string>();
        Object.values(assignments).forEach((oids) => oids.forEach((id) => ids.add(id)));
        return ids;
    }, [assignments]);

    const localUnassigned = useMemo(() => {
        // Include unassigned orders (excluding those we've dragged to a driver)
        const base = unassignedOrders.filter((o) => !assignedOrderIds.has(o.id));
        // Also include published orders that were removed (X button) so they return here
        const removedPublished = publishedAssignedOrders.filter((o) => removedPublishedIds.has(o.id));
        return [...base, ...removedPublished];
    }, [unassignedOrders, assignedOrderIds, publishedAssignedOrders, removedPublishedIds]);

    const filteredUnassigned = useMemo(() => {
        if (!orderSearch.trim()) return localUnassigned;
        const q = orderSearch.toLowerCase();
        return localUnassigned.filter(
            (o) => o.restaurant_name.toLowerCase().includes(q) || o.order_code.toLowerCase().includes(q) || o.pickup_address.toLowerCase().includes(q)
        );
    }, [localUnassigned, orderSearch]);

    const filteredDrivers = useMemo(() => {
        if (!driverSearch.trim()) return activeDrivers;
        const q = driverSearch.toLowerCase();
        return activeDrivers.filter((d) => d.username.toLowerCase().includes(q) || (d.driver_base_address || '').toLowerCase().includes(q));
    }, [activeDrivers, driverSearch]);

    const ordersById = useMemo(() => {
        const map: Record<string, Order> = {};
        unassignedOrders.forEach((o) => (map[o.id] = o));
        return map;
    }, [unassignedOrders]);

    // Group already-published orders by driver (excluding removed ones)
    const publishedByDriver = useMemo(() => {
        const map: Record<string, Order[]> = {};
        publishedAssignedOrders.forEach((o) => {
            if (o.assigned_driver_id && !removedPublishedIds.has(o.id)) {
                if (!map[o.assigned_driver_id]) map[o.assigned_driver_id] = [];
                map[o.assigned_driver_id].push(o);
            }
        });
        return map;
    }, [publishedAssignedOrders, removedPublishedIds]);

    const totalAssigned = assignedOrderIds.size;
    const hasChanges = totalAssigned > 0 || removedPublishedIds.size > 0;

    // DnD handlers
    const handleDragStart = (event: DragStartEvent) => {
        const data = event.active.data.current;
        if (data?.order) setActiveOrder(data.order as Order);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveOrder(null);
        const { active, over } = event;
        if (!over) return;

        const activeId = active.id as string;
        const overId = over.id as string;
        const activeData = active.data.current;
        const overData = over.data.current;

        // Case 1: Dragging an unassigned order onto a driver
        if (activeId.startsWith('order-') && overId.startsWith('driver-')) {
            const orderId = activeId.replace('order-', '');
            const driverId = overId.replace('driver-', '');

            setAssignments((prev) => {
                const next = { ...prev };
                // Remove from any existing driver first
                Object.keys(next).forEach((did) => {
                    next[did] = next[did].filter((id) => id !== orderId);
                    if (next[did].length === 0) delete next[did];
                });
                next[driverId] = [...(next[driverId] || []), orderId];
                return next;
            });
            return;
        }

        // Case 2: Reordering within the same driver
        if (activeId.startsWith('assigned-') && overId.startsWith('assigned-')) {
            const activeOrderId = activeId.replace('assigned-', '');
            const overOrderId = overId.replace('assigned-', '');

            // Find which driver they belong to
            const driverId = Object.entries(assignments).find(([, oids]) => oids.includes(activeOrderId))?.[0];
            if (!driverId) return;

            setAssignments((prev) => {
                const next = { ...prev };
                const list = [...(next[driverId] || [])];
                const oldIndex = list.indexOf(activeOrderId);
                const newIndex = list.indexOf(overOrderId);
                if (oldIndex === -1 || newIndex === -1) return prev;
                next[driverId] = arrayMove(list, oldIndex, newIndex);
                return next;
            });
            return;
        }

        // Case 3: Dragging an unassigned order onto an assigned order (drop into that driver)
        if (activeId.startsWith('order-') && overId.startsWith('assigned-')) {
            const orderId = activeId.replace('order-', '');
            const overOrderId = overId.replace('assigned-', '');
            const driverId = Object.entries(assignments).find(([, oids]) => oids.includes(overOrderId))?.[0];
            if (!driverId) return;

            setAssignments((prev) => {
                const next = { ...prev };
                Object.keys(next).forEach((did) => {
                    next[did] = next[did].filter((id) => id !== orderId);
                    if (next[did].length === 0) delete next[did];
                });
                next[driverId] = [...(next[driverId] || []), orderId];
                return next;
            });
            return;
        }
    };

    const removeOrderFromDriver = (orderId: string) => {
        setAssignments((prev) => {
            const next = { ...prev };
            Object.keys(next).forEach((did) => {
                next[did] = next[did].filter((id) => id !== orderId);
                if (next[did].length === 0) delete next[did];
            });
            return next;
        });
    };

    const handleReorder = (driverId: string, oldIndex: number, newIndex: number) => {
        setAssignments((prev) => {
            const next = { ...prev };
            const list = [...(next[driverId] || [])];
            next[driverId] = arrayMove(list, oldIndex, newIndex);
            return next;
        });
    };

    const resetAll = () => {
        setAssignments({});
        setRemovedPublishedIds(new Set());
        setSelectedDriverId(null);
    };

    const removePublishedOrder = async (orderId: string) => {
        // Immediately update local state
        setRemovedPublishedIds((prev) => new Set([...prev, orderId]));
        // Auto-save: unassign in Firestore
        try {
            await updateDoc(doc(firebaseDb, 'orders', orderId), {
                status: 'new',
                assigned_driver_id: null,
                route_group_id: null,
            });
            // Refresh data so the order moves back permanently
            onRefresh();
        } catch (err) {
            console.error('Failed to unassign order:', err);
            // Revert local state on failure
            setRemovedPublishedIds((prev) => {
                const next = new Set(prev);
                next.delete(orderId);
                return next;
            });
        }
    };

    const publishAssignments = async () => {
        if (!hasChanges) return;
        setPublishing(true);
        try {
            const manualAssign = httpsCallable(firebaseFunctions, 'manualAssignOrders');
            for (const [driverId, orderIds] of Object.entries(assignments)) {
                if (orderIds.length === 0) continue;
                await manualAssign({
                    scheduled_date: selectedDate,
                    order_ids: orderIds,
                    driver_id: driverId,
                    preview_only: false,
                });
            }
            showNotification('Assignments published successfully!', 'success');
            setAssignments({});
            setSelectedDriverId(null);
            onRefresh();
        } catch (error) {
            console.error('Error publishing assignments:', error);
            showNotification('Failed to publish assignments. Please try again.', 'error');
        } finally {
            setPublishing(false);
        }
    };

    return (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} collisionDetection={closestCenter}>
            {/* Action Bar */}
            {hasChanges && (
                <div className="flex items-center justify-between mb-4 p-4 rounded-xl bg-gradient-to-r from-amber-500/10 to-emerald-500/10 border border-amber-500/20">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        <p className="text-text-main text-sm font-medium">
                            {totalAssigned} order{totalAssigned !== 1 ? 's' : ''} assigned to {Object.keys(assignments).length} driver{Object.keys(assignments).length !== 1 ? 's' : ''}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={resetAll} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface border border-divider text-text-muted hover:text-text-main transition-all text-sm">
                            <Undo2 size={16} />
                            Reset
                        </button>
                        <button
                            onClick={publishAssignments}
                            disabled={publishing}
                            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold hover:from-emerald-400 hover:to-teal-400 transition-all disabled:opacity-50 text-sm shadow-lg shadow-emerald-500/20"
                        >
                            {publishing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            {publishing ? 'Publishing...' : 'Publish Assignments'}
                        </button>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 size={40} className="text-amber-500 animate-spin" />
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" style={{ minHeight: '70vh' }}>
                    {/* LEFT: Unassigned Orders */}
                    <div className="bg-card/50 backdrop-blur rounded-2xl border border-divider/50 flex flex-col min-h-0">
                        <div className="p-5 border-b border-divider/50 flex-shrink-0">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Package size={20} className="text-amber-500" />
                                    <h2 className="text-lg font-semibold text-text-main">Unassigned Orders</h2>
                                    <span className="px-2 py-0.5 rounded-full bg-surface text-text-muted text-xs border border-divider">{localUnassigned.length}</span>
                                </div>
                            </div>
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                <input
                                    type="text"
                                    placeholder="Search orders..."
                                    value={orderSearch}
                                    onChange={(e) => setOrderSearch(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 rounded-lg bg-surface border border-divider text-text-main text-sm placeholder-text-muted focus:outline-none focus:border-amber-500 transition-colors"
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {filteredUnassigned.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-text-muted">
                                    <Package size={40} className="mb-3 opacity-30" />
                                    <p className="text-sm">{localUnassigned.length === 0 ? 'All orders assigned!' : 'No matching orders'}</p>
                                </div>
                            ) : (
                                filteredUnassigned.map((order) => {
                                    let distMi: number | null = null;
                                    if (selectedDriverId) {
                                        const driver = activeDrivers.find(d => d.id === selectedDriverId);
                                        if (driver && driver.driver_base_lat && driver.driver_base_lng && order.pickup_lat && order.pickup_lng) {
                                            distMi = haversineDistanceMi(driver.driver_base_lat, driver.driver_base_lng, order.pickup_lat, order.pickup_lng);
                                        }
                                    }
                                    return <DraggableOrderCard key={order.id} order={order} isDragging={activeOrder?.id === order.id} distanceMi={distMi} />;
                                })
                            )}
                        </div>
                    </div>

                    {/* RIGHT: Active Drivers */}
                    <div className="bg-card/50 backdrop-blur rounded-2xl border border-divider/50 flex flex-col min-h-0">
                        <div className="p-5 border-b border-divider/50 flex-shrink-0">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Users size={20} className="text-emerald-500" />
                                    <h2 className="text-lg font-semibold text-text-main">Active Drivers</h2>
                                    <span className="px-2 py-0.5 rounded-full bg-surface text-text-muted text-xs border border-divider">{activeDrivers.length}</span>
                                </div>
                            </div>
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                <input
                                    type="text"
                                    placeholder="Search drivers..."
                                    value={driverSearch}
                                    onChange={(e) => setDriverSearch(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 rounded-lg bg-surface border border-divider text-text-main text-sm placeholder-text-muted focus:outline-none focus:border-amber-500 transition-colors"
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {filteredDrivers.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-text-muted">
                                    <Users size={40} className="mb-3 opacity-30" />
                                    <p className="text-sm">{activeDrivers.length === 0 ? 'No active drivers' : 'No matching drivers'}</p>
                                </div>
                            ) : (
                                filteredDrivers.map((driver) => (
                                    <DroppableDriverCard
                                        key={driver.id}
                                        driver={driver}
                                        isSelected={selectedDriverId === driver.id}
                                        assignedOrders={(assignments[driver.id] || []).map((oid) => ordersById[oid]).filter(Boolean)}
                                        publishedOrders={publishedByDriver[driver.id] || []}
                                        onSelect={() => setSelectedDriverId((prev) => (prev === driver.id ? null : driver.id))}
                                        onRemoveOrder={removeOrderFromDriver}
                                        onRemovePublished={removePublishedOrder}
                                        onReorder={(oldIdx, newIdx) => handleReorder(driver.id, oldIdx, newIdx)}
                                    />
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            <DragOverlay>{activeOrder ? <DragOverlayCard order={activeOrder} /> : null}</DragOverlay>
        </DndContext>
    );
}
