'use client';

import { useEffect, useState, use } from 'react';
import { doc, getDoc, collection, getDocs, orderBy, query } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { firebaseDb, firebaseStorage } from '@/lib/firebase';
import { Order, OrderEvent, OrderPhoto, RouteStep, Profile } from '@/types';
import { format, differenceInMinutes } from 'date-fns';
import { formatDuration, formatDateString } from '@/lib/utils';
import Link from 'next/link';
import {
    ArrowLeft,
    Package,
    MapPin,
    Clock,
    User,
    Camera,
    Route,
    FileText,
    CheckCircle2,
    AlertCircle,
    Truck,
    DollarSign,
    Download,
    ExternalLink,
} from 'lucide-react';

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [order, setOrder] = useState<Order | null>(null);
    const [events, setEvents] = useState<OrderEvent[]>([]);
    const [photos, setPhotos] = useState<(OrderPhoto & { url: string })[]>([]);
    const [steps, setSteps] = useState<RouteStep[]>([]);
    const [assignedDriver, setAssignedDriver] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'photos' | 'steps'>('overview');

    useEffect(() => {
        const fetchOrderDetails = async () => {
            try {
                // Fetch order
                const orderDoc = await getDoc(doc(firebaseDb, 'orders', id));
                if (orderDoc.exists()) {
                    const data = orderDoc.data();
                    setOrder({
                        id: orderDoc.id,
                        ...data,
                        created_at: data.created_at?.toDate?.() || new Date(),
                        updated_at: data.updated_at?.toDate?.() || new Date(),
                        last_event_time: data.last_event_time?.toDate?.() || new Date(),
                        time_window_start: data.time_window_start?.toDate?.() || null,
                        time_window_end: data.time_window_end?.toDate?.() || null,
                    } as Order);

                    // Fetch events
                    const eventsSnap = await getDocs(
                        query(collection(firebaseDb, 'orders', id, 'events'), orderBy('event_time', 'asc'))
                    );
                    const eventsData: OrderEvent[] = [];
                    eventsSnap.forEach((doc) => {
                        const data = doc.data();
                        eventsData.push({
                            id: doc.id,
                            ...data,
                            event_time: data.event_time?.toDate?.() || new Date(),
                        } as OrderEvent);
                    });
                    setEvents(eventsData);

                    // Fetch photos
                    const photosSnap = await getDocs(collection(firebaseDb, 'orders', id, 'photos'));
                    const photosData: (OrderPhoto & { url: string })[] = [];
                    for (const doc of photosSnap.docs) {
                        const data = doc.data();
                        try {
                            const url = await getDownloadURL(ref(firebaseStorage, data.storage_path));
                            photosData.push({
                                id: doc.id,
                                ...data,
                                uploaded_at: data.uploaded_at?.toDate?.() || new Date(),
                                url,
                            } as OrderPhoto & { url: string });
                        } catch {
                            console.error('Error fetching photo:', data.storage_path);
                        }
                    }
                    // Sort photos: pickup first, then others
                    photosData.sort((a, b) => {
                        if (a.photo_type === 'pickup' && b.photo_type !== 'pickup') return -1;
                        if (a.photo_type !== 'pickup' && b.photo_type === 'pickup') return 1;
                        return 0;
                    });
                    setPhotos(photosData);

                    // Fetch driver details if assigned
                    if (data.assigned_driver_id) {
                        try {
                            const driverDoc = await getDoc(doc(firebaseDb, 'profiles', data.assigned_driver_id));
                            if (driverDoc.exists()) {
                                setAssignedDriver(driverDoc.data() as Profile);
                            }
                        } catch (error) {
                            console.error('Error fetching driver details:', error);
                        }
                    }

                    // Fetch route steps if route_group_id exists
                    if (data.route_group_id) {
                        const stepsSnap = await getDocs(
                            query(
                                collection(firebaseDb, 'route_groups', data.route_group_id, 'steps'),
                                orderBy('sequence_index', 'asc')
                            )
                        );
                        const stepsData: RouteStep[] = [];
                        stepsSnap.forEach((doc) => {
                            const stepData = doc.data();
                            if (stepData.order_id === id) {
                                stepsData.push({
                                    id: doc.id,
                                    ...stepData,
                                    completed_at: stepData.completed_at?.toDate?.() || null,
                                } as RouteStep);
                            }
                        });
                        setSteps(stepsData);
                    }
                }
            } catch (error) {
                console.error('Error fetching order details:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchOrderDetails();
    }, [id]);

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

    const getEventIcon = (eventType: string) => {
        switch (eventType) {
            case 'order_created':
                return <Package size={16} />;
            case 'assigned':
                return <User size={16} />;
            case 'pickup_photo_uploaded':
            case 'delivery_photo_uploaded':
                return <Camera size={16} />;
            case 'picked_up':
                return <Truck size={16} />;
            case 'delivered':
                return <CheckCircle2 size={16} />;
            case 'cancelled':
                return <AlertCircle size={16} />;
            default:
                return <FileText size={16} />;
        }
    };

    if (loading) {
        return (
            <div className="p-8 flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-slate-400">Loading order details...</p>
                </div>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="p-8">
                <div className="text-center py-12">
                    <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-white mb-2">Order Not Found</h2>
                    <p className="text-slate-400 mb-4">The order you&apos;re looking for doesn&apos;t exist.</p>
                    <Link
                        href="/orders"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-600 transition-colors"
                    >
                        <ArrowLeft size={18} />
                        Back to Orders
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <Link
                    href="/orders"
                    className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-colors"
                >
                    <ArrowLeft size={20} />
                </Link>
                <div className="flex-1">
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-bold text-white">{order.restaurant_name}</h1>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(order.status)}`}>
                            {order.status.replace('_', ' ')}
                        </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1">
                        <p className="text-slate-400 font-mono">{order.order_code}</p>
                        <span className="text-slate-600">•</span>
                        <p className="text-slate-400">{formatDateString(order.scheduled_date)}</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-3xl font-bold text-emerald-400">${order.payout_amount.toFixed(2)}</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-slate-700 pb-4">
                {(['overview', 'timeline', 'photos', 'steps'] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors capitalize ${activeTab === tab
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                            }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {activeTab === 'overview' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Pickup Info */}
                    <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="p-3 rounded-xl bg-blue-500/20">
                                    <MapPin size={20} className="text-blue-400" />
                                </div>
                                <h3 className="text-lg font-semibold text-white">Pickup Location</h3>
                            </div>
                            {order.time_window_start && (
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                                    <Clock size={16} className="text-blue-400" />
                                    <span className="text-blue-200 font-mono font-medium">
                                        {format(order.time_window_start, 'HH:mm')}
                                    </span>
                                </div>
                            )}
                        </div>
                        <p className="text-slate-300">{order.pickup_address}</p>
                        <p className="text-slate-500 text-sm mt-2">
                            Lat: {order.pickup_lat.toFixed(6)}, Lng: {order.pickup_lng.toFixed(6)}
                        </p>
                    </div>

                    {/* Dropoff Info */}
                    <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="p-3 rounded-xl bg-emerald-500/20">
                                    <MapPin size={20} className="text-emerald-400" />
                                </div>
                                <h3 className="text-lg font-semibold text-white">Delivery Location</h3>
                            </div>
                            {order.time_window_end && (
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                    <Clock size={16} className="text-emerald-400" />
                                    <span className="text-emerald-200 font-mono font-medium">
                                        {format(order.time_window_end, 'HH:mm')}
                                    </span>
                                </div>
                            )}
                        </div>
                        <p className="text-slate-300">{order.dropoff_address}</p>
                        <p className="text-slate-500 text-sm mt-2">
                            Lat: {order.dropoff_lat.toFixed(6)}, Lng: {order.dropoff_lng.toFixed(6)}
                        </p>
                    </div>

                    {/* Order Info */}
                    <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-3 rounded-xl bg-purple-500/20">
                                <FileText size={20} className="text-purple-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-white">Order Details</h3>
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between">
                                <span className="text-slate-400">Source</span>
                                <span className="text-white capitalize">{order.source}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">Created At</span>
                                <span className="text-white">{format(new Date(order.created_at), 'PPpp')}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">Last Update</span>
                                <span className="text-white">{format(new Date(order.last_event_time), 'PPpp')}</span>
                            </div>
                        </div>
                    </div>

                    {/* Driver Info */}
                    <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-3 rounded-xl bg-amber-500/20">
                                <User size={20} className="text-amber-500" />
                            </div>
                            <h3 className="text-lg font-semibold text-white">Assignment</h3>
                        </div>
                        {order.assigned_driver_id ? (
                            <div className="space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Driver</span>
                                    <span className="text-white font-medium">
                                        {assignedDriver ? assignedDriver.username : order.assigned_driver_id}
                                    </span>
                                </div>
                                {order.status === 'delivered' && order.time_window_end && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-400">Timeliness</span>
                                        {(() => {
                                            const deliveredTime = new Date(order.last_event_time);
                                            const deadline = new Date(order.time_window_end);
                                            // Add 15 min buffer if needed, but strict for now
                                            const isLate = deliveredTime > deadline;

                                            let timeDiffText = '';
                                            if (isLate) {
                                                const diff = differenceInMinutes(deliveredTime, deadline);
                                                timeDiffText = `${formatDuration(diff)} late`;
                                            } else {
                                                const diff = differenceInMinutes(deadline, deliveredTime);
                                                timeDiffText = `${formatDuration(diff)} early`;
                                            }

                                            return (
                                                <div className="flex flex-col items-end">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${isLate
                                                        ? 'bg-red-500/20 text-red-500 border border-red-500/30'
                                                        : 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
                                                        }`}>
                                                        {isLate ? 'Late' : 'On Time'}
                                                    </span>
                                                    {timeDiffText && (
                                                        <span className={`text-xs mt-1 ${isLate ? 'text-red-400' : 'text-emerald-400'}`}>
                                                            {timeDiffText}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}
                                {assignedDriver && (
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Driver ID</span>
                                        <span className="text-white font-mono text-sm">{order.assigned_driver_id}</span>
                                    </div>
                                )}
                                {order.route_group_id && (
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Route Group</span>
                                        <span className="text-white font-mono text-sm">{order.route_group_id}</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-slate-500">Not yet assigned</p>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'timeline' && (
                <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
                    {events.length === 0 ? (
                        <p className="text-slate-500 text-center py-8">No events recorded</p>
                    ) : (
                        <div className="relative">
                            <div className="absolute left-6 top-0 bottom-0 w-px bg-slate-700" />
                            <div className="space-y-4">
                                {events.map((event) => (
                                    <div key={event.id} className="relative flex items-start gap-4 pl-12">
                                        <div className="absolute left-4 w-5 h-5 rounded-full bg-slate-800 border-2 border-amber-500 flex items-center justify-center">
                                            <div className="text-amber-500">{getEventIcon(event.event_type)}</div>
                                        </div>
                                        <div className="flex-1 bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="font-medium text-white capitalize">
                                                    {event.event_type.replace(/_/g, ' ')}
                                                </span>
                                                <span className="text-slate-500 text-sm">
                                                    {format(new Date(event.event_time), 'PPpp')}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-sm">
                                                <span className={`px-2 py-0.5 rounded text-xs ${event.actor_role === 'admin' ? 'bg-purple-500/20 text-purple-400' :
                                                    event.actor_role === 'driver' ? 'bg-blue-500/20 text-blue-400' :
                                                        'bg-slate-500/20 text-slate-400'
                                                    }`}>
                                                    {event.actor_role}
                                                </span>
                                                <span className="text-slate-500 font-mono">{event.actor_id}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'photos' && (
                <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
                    {photos.length === 0 ? (
                        <div className="text-center py-12">
                            <Camera size={48} className="text-slate-600 mx-auto mb-4" />
                            <p className="text-slate-500">No photos uploaded yet</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {photos.map((photo) => (
                                <div key={photo.id} className="bg-slate-900/50 rounded-xl border border-slate-700/50 overflow-hidden">
                                    <div className="aspect-video relative">
                                        <img
                                            src={photo.url}
                                            alt={`${photo.photo_type} photo`}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                    <div className="p-4">
                                        <div className="flex items-center justify-between">
                                            <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${photo.photo_type === 'pickup'
                                                ? 'bg-blue-500/20 text-blue-400'
                                                : 'bg-emerald-500/20 text-emerald-400'
                                                }`}>
                                                {photo.photo_type}
                                            </span>
                                            <span className="text-slate-500 text-sm">
                                                {format(new Date(photo.uploaded_at), 'PPpp')}
                                            </span>
                                        </div>
                                        <div className="mt-3 flex justify-end">
                                            <a
                                                href={photo.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                download={`order-${order.order_code}-${photo.photo_type}.jpg`}
                                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-sm transition-colors border border-slate-700"
                                            >
                                                <Download size={14} />
                                                Download
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'steps' && (
                <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
                    {steps.length === 0 ? (
                        <div className="text-center py-12">
                            <Route size={48} className="text-slate-600 mx-auto mb-4" />
                            <p className="text-slate-500">No route steps found</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {steps.map((step, index) => (
                                <div
                                    key={step.id}
                                    className={`flex items-center gap-4 p-4 rounded-xl border ${step.status === 'completed'
                                        ? 'bg-emerald-500/10 border-emerald-500/30'
                                        : 'bg-slate-900/50 border-slate-700/50'
                                        }`}
                                >
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${step.status === 'completed'
                                        ? 'bg-emerald-500 text-white'
                                        : 'bg-slate-700 text-slate-400'
                                        }`}>
                                        {step.sequence_index + 1}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${step.task_type === 'pickup'
                                                ? 'bg-blue-500/20 text-blue-400'
                                                : 'bg-emerald-500/20 text-emerald-400'
                                                }`}>
                                                {step.task_type}
                                            </span>
                                            <span className="text-white">{step.address}</span>
                                        </div>
                                        {step.completed_at && (
                                            <p className="text-slate-500 text-sm mt-1">
                                                Completed: {format(new Date(step.completed_at), 'PPpp')}
                                            </p>
                                        )}
                                    </div>
                                    {step.status === 'completed' ? (
                                        <CheckCircle2 size={24} className="text-emerald-400" />
                                    ) : (
                                        <Clock size={24} className="text-slate-500" />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
