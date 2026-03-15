'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { GoogleMap, useJsApiLoader, MarkerF, PolylineF } from '@react-google-maps/api';
import { doc, getDoc, onSnapshot, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { firebaseDb } from '@/lib/firebase';
import { Profile, Order } from '@/types';
import { 
    Clock, 
    Navigation, 
    CheckCircle, 
    Package, 
    MapPin, 
    AlertCircle,
    Truck
} from 'lucide-react';
import { haversineDistance } from '../../../lib/routing';

const MAP_CONTAINER_STYLE = {
    width: '100%',
    height: '100%',
};

export default function PublicTrackingPage() {
    const params = useParams();
    const shareId = params.shareId as string;
    
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [driver, setDriver] = useState<Profile | null>(null);
    const [activeOrder, setActiveOrder] = useState<Order | null>(null);
    const [nextStep, setNextStep] = useState<any | null>(null);
    const [activeRoute, setActiveRoute] = useState<any[]>([]);
    const [eta, setEta] = useState<string>('Calculating...');

    const { isLoaded } = useJsApiLoader({
        googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
        libraries: ['places'],
    });

    useEffect(() => {
        if (!shareId) return;

        const loadTrackingData = async () => {
            setLoading(true);
            try {
                // In a production system, shareId would map to a 'tracking_shares' collection
                // For this MVP, we'll assume shareId is the driver's current active task/uid for demo
                // Ideally: const shareDoc = await getDoc(doc(firebaseDb, 'shares', shareId));
                
                // Let's assume the shareId IS the driver profile ID for now (simplicity)
                // In future: real-time ephemeral tokens
                const driverRef = doc(firebaseDb, 'profiles', shareId);
                
                const unsubscribe = onSnapshot(driverRef, async (docSnap) => {
                    if (docSnap.exists()) {
                        const driverData = docSnap.data() as Profile;
                        setDriver(driverData);

                        // Fetch active route group for this driver
                        const groupsRef = collection(firebaseDb, 'route_groups');
                        const groupsQuery = query(
                            groupsRef, 
                            where('driver_id', '==', shareId),
                            where('status', '==', 'active')
                        );
                        
                        const groupsSnap = await getDocs(groupsQuery);
                        if (!groupsSnap.empty) {
                            const groupDoc = groupsSnap.docs[0];
                            const groupId = groupDoc.id;

                            // Fetch steps for this group
                            const stepsRef = collection(firebaseDb, `route_groups/${groupId}/steps`);
                            const stepsQuery = query(stepsRef, where('status', '==', 'pending'), orderBy('sequence_index', 'asc'), limit(1));
                            const stepsSnap = await getDocs(stepsQuery);
                            
                            if (!stepsSnap.empty) {
                                const stepData = stepsSnap.docs[0].data();
                                setNextStep(stepData);

                                // Fetch ALL steps for the route line
                                const allStepsSnap = await getDocs(query(stepsRef, orderBy('sequence_index', 'asc')));
                                const routePoints = allStepsSnap.docs.map(doc => ({
                                    lat: doc.data().lat,
                                    lng: doc.data().lng
                                }));
                                setActiveRoute(routePoints);

                                // Fetch the actual order info
                                const orderSnap = await getDoc(doc(firebaseDb, 'orders', stepData.order_id));
                                if (orderSnap.exists()) {
                                    setActiveOrder(orderSnap.data() as Order);
                                }

                                // Calculate ETA if we have driver location
                                if (driverData.last_location) {
                                    const dist = haversineDistance(
                                        driverData.last_location.latitude,
                                        driverData.last_location.longitude,
                                        stepData.lat,
                                        stepData.lng
                                    );
                                    // Simple logic: 2 mins per mile + 3 mins buffer
                                    const mins = Math.round(dist * 2 + 3);
                                    setEta(`${mins}-${mins + 5} min`);
                                }
                            }
                        }
                        setLoading(false);
                    } else {
                        setError('Tracking link is invalid or expired.');
                        setLoading(false);
                    }
                });

                return () => unsubscribe();
            } catch (err) {
                console.error('Error loading tracking:', err);
                setError('Could not load tracking information.');
                setLoading(false);
            }
        };

        loadTrackingData();
    }, [shareId]);

    const center = driver?.last_location ? {
        lat: driver.last_location.latitude,
        lng: driver.last_location.longitude,
    } : { lat: 34.0522, lng: -118.2437 };

    if (error) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
                <div className="bg-white p-8 rounded-3xl shadow-xl max-w-sm w-full space-y-4">
                    <div className="h-16 w-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                        <AlertCircle className="h-8 w-8 text-red-500" />
                    </div>
                    <h1 className="text-xl font-bold text-slate-900">Tracking Unavailable</h1>
                    <p className="text-slate-500">{error}</p>
                    <button 
                        onClick={() => window.location.reload()}
                        className="w-full bg-slate-900 text-white py-3 rounded-xl font-semibold hover:bg-slate-800 transition-colors"
                    >
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* Minimal Header */}
            <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 h-16 px-6 flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="h-8 w-8 bg-amber-500 rounded-lg flex items-center justify-center shadow-lg shadow-amber-500/20">
                        <Truck className="h-5 w-5 text-white" />
                    </div>
                    <h1 className="font-bold text-lg text-slate-900">Calivery Live</h1>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 rounded-full border border-emerald-100">
                    <span className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse"></span>
                    <span className="text-xs font-bold text-emerald-700 uppercase">Live Now</span>
                </div>
            </header>

            <div className="flex-1 flex flex-col md:flex-row relative">
                {/* Map Area */}
                <div className="flex-1 min-h-[400px] h-full relative">
                    {isLoaded && driver?.last_location ? (
                        <GoogleMap
                            mapContainerStyle={MAP_CONTAINER_STYLE}
                            zoom={15}
                            center={center}
                            options={{
                                disableDefaultUI: true,
                                zoomControl: false,
                                styles: [
                                    { "featureType": "poi", "stylers": [{ "visibility": "off" }] }
                                ]
                            }}
                        >
                            <MarkerF
                                position={center}
                                icon={{
                                    url: 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png',
                                    scaledSize: new window.google.maps.Size(48, 48),
                                }}
                            />
                            {activeRoute.length > 0 && (
                                <PolylineF
                                    path={activeRoute}
                                    options={{
                                        strokeColor: "#6366f1",
                                        strokeOpacity: 0.8,
                                        strokeWeight: 4,
                                    }}
                                />
                            )}
                        </GoogleMap>
                    ) : (
                        <div className="h-full w-full bg-slate-100 flex items-center justify-center">
                            <Clock className="h-10 w-10 text-slate-300 animate-spin" />
                        </div>
                    )}
                </div>

                {/* Tracking Info Card */}
                <div className="w-full md:w-[400px] bg-white p-6 md:m-4 md:rounded-3xl shadow-2xl flex flex-col gap-6 z-20">
                    {/* Status Header */}
                    <div className="space-y-1">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Delivery Status</p>
                        <h2 className="text-2xl font-black text-slate-900">Driver is en route</h2>
                    </div>

                    {/* ETA Card */}
                    <div className="bg-indigo-600 p-5 rounded-2xl text-white shadow-lg shadow-indigo-600/20 flex items-center justify-between">
                        <div>
                            <p className="text-indigo-100 text-[10px] font-bold uppercase tracking-wider mb-1">Estimated Arrival</p>
                            <p className="text-3xl font-black">{eta}</p>
                        </div>
                        <div className="h-12 w-12 bg-white/10 rounded-xl flex items-center justify-center">
                            <Clock className="h-6 w-6" />
                        </div>
                    </div>

                    {/* Driver Profile */}
                    <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="h-12 w-12 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600 text-lg">
                            {driver?.username?.charAt(0) || 'D'}
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-slate-900">{driver?.username || 'Calivery Driver'}</h3>
                            <p className="text-xs text-slate-500">Professional Courier</p>
                        </div>
                        <button className="h-10 w-10 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-sm hover:bg-slate-50 transition-colors">
                            <Navigation className="h-4 w-4 text-indigo-600" />
                        </button>
                    </div>

                    {/* Progress Steps */}
                    <div className="space-y-4">
                        <div className="flex gap-4">
                            <div className="flex flex-col items-center">
                                <div className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center">
                                    <CheckCircle className="h-4 w-4 text-white" />
                                </div>
                                <div className="w-1 h-full bg-emerald-200 rounded-full my-1"></div>
                            </div>
                            <div className="pb-4">
                                <p className="text-sm font-bold text-slate-900">Order Picked Up</p>
                                <p className="text-xs text-slate-500">The driver has left the facility</p>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <div className="flex flex-col items-center">
                                <div className="h-6 w-6 rounded-full bg-indigo-600 flex items-center justify-center animate-pulse">
                                    <Truck className="h-4 w-4 text-white" />
                                </div>
                                <div className="w-1 h-full bg-slate-100 rounded-full my-1"></div>
                            </div>
                            <div className="pb-4">
                                <p className="text-sm font-bold text-slate-900">On the way to you</p>
                                <p className="text-xs text-slate-500">Live coordinates active</p>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <div className="flex flex-col items-center">
                                <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-300">
                                    <Package className="h-4 w-4" />
                                </div>
                            </div>
                            <div>
                                <p className="text-sm font-bold text-slate-300">Delivered</p>
                                <p className="text-xs text-slate-300">Confirmation pending</p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-auto pt-6 border-t border-slate-100">
                        <p className="text-[10px] text-center text-slate-400 font-medium">
                            Powered by Calivery Tracking System • Secure Transaction
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
