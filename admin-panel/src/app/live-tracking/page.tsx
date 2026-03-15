'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { GoogleMap, useJsApiLoader, MarkerF, InfoWindowF, PolylineF } from '@react-google-maps/api';
import { collection, query, where, onSnapshot, getDocs, orderBy } from 'firebase/firestore';
import { firebaseDb } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useTenant } from '@/lib/tenant-context';
import { Profile } from '@/types';
import { 
    Navigation, 
    Clock, 
    User, 
    Battery, 
    AlertCircle,
    Search,
    Map as MapIcon,
    RefreshCw,
    Share2
} from 'lucide-react';
import { useNotification } from '@/lib/notification-context';
import { useUI } from '@/lib/ui-context';

const MAP_CONTAINER_STYLE = {
    width: '100%',
    height: 'calc(100vh - 80px)', // Full height minus header
};

const DEFAULT_CENTER = {
    lat: 34.0522, // Los Angeles
    lng: -118.2437,
};

const MAP_OPTIONS = {
    disableDefaultUI: false,
    zoomControl: true,
    styles: [
        {
            "featureType": "all",
            "elementType": "labels.text.fill",
            "stylers": [{ "color": "#7c93a3" }, { "lightness": "-10" }]
        }
    ],
};

export default function LiveTrackingPage() {
    const { role: userRole } = useAuth();
    const { tenantId } = useTenant();
    const { showNotification } = useNotification();
    const [drivers, setDrivers] = useState<Profile[]>([]);
    const [selectedDriver, setSelectedDriver] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeRoute, setActiveRoute] = useState<any[]>([]);
    const { sidebarCollapsed } = useUI();

    const { isLoaded, loadError } = useJsApiLoader({
        googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAP_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
        libraries: ['places'],
    });

    useEffect(() => {
        setLoading(true);
        
        let driversQuery = query(
            collection(firebaseDb, 'profiles'),
            where('role', '==', 'driver'),
            where('is_on_duty', '==', true)
        );

        // Tenant isolation
        if (userRole !== 'super_admin') {
            driversQuery = query(driversQuery, where('tenant_id', '==', tenantId || 'default'));
        }

        const unsubscribe = onSnapshot(driversQuery, (snapshot) => {
            const driversData: Profile[] = [];
            snapshot.forEach((doc) => {
                const data = { ...doc.data(), id: doc.id } as Profile;
                if (data.last_location) {
                    driversData.push(data);
                }
            });
            setDrivers(driversData);
            setLoading(false);
        }, (error) => {
            console.error('Error listening to drivers:', error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [tenantId, userRole]);

    // Fetch route when driver is selected
    useEffect(() => {
        if (!selectedDriver) {
            setActiveRoute([]);
            return;
        }

        const fetchRoute = async () => {
            const groupsRef = collection(firebaseDb, 'route_groups');
            const q = query(
                groupsRef, 
                where('driver_id', '==', selectedDriver.id),
                where('status', '==', 'active')
            );
            
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                const groupId = querySnapshot.docs[0].id;
                const stepsRef = collection(firebaseDb, `route_groups/${groupId}/steps`);
                const stepsSnap = await getDocs(query(stepsRef, orderBy('sequence_index', 'asc')));
                
                const routePoints = stepsSnap.docs.map(doc => ({
                    lat: doc.data().lat,
                    lng: doc.data().lng
                }));
                setActiveRoute(routePoints);
            } else {
                setActiveRoute([]);
            }
        };

        fetchRoute();
    }, [selectedDriver]);

    const handleShareLink = (driverId: string) => {
        const baseUrl = window.location.origin;
        const shareUrl = `${baseUrl}/tracking/${driverId}`;
        navigator.clipboard.writeText(shareUrl);
        showNotification('Tracking link copied to clipboard!', 'success');
    };

    const filteredDrivers = useMemo(() => {
        return drivers.filter(d => 
            d.username.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [drivers, searchQuery]);

    const activeDriversCount = drivers.length;

    if (loadError) {
        return (
            <div className="flex h-screen items-center justify-center bg-background p-4 text-center">
                <div className="max-w-md space-y-4">
                    <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
                    <h1 className="text-xl font-bold">Map Loading Error</h1>
                    <p className="text-text-muted">Could not load Google Maps. Please check your API key and connection.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-background overflow-hidden relative">
            <main className="flex-1 flex flex-col transition-all duration-300">
                {/* Header Section */}
                <header className="h-16 border-b border-divider bg-card px-6 flex items-center justify-between z-10">
                    <div className="flex items-center gap-3">
                        <MapIcon className="h-5 w-5 text-amber-500" />
                        <h2 className="text-lg font-bold">Live Fleet Tracking</h2>
                        <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            {activeDriversCount} Online
                        </span>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="relative hidden sm:block">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                            <input
                                type="text"
                                placeholder="Search drivers..."
                                className="pl-9 pr-4 py-2 rounded-xl bg-surface border border-divider text-sm focus:outline-none focus:border-amber-500 w-64"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <button 
                            className="p-2 rounded-xl hover:bg-surface border border-divider transition-colors"
                            onClick={() => window.location.reload()}
                        >
                            <RefreshCw className="h-4 w-4 text-text-muted" />
                        </button>
                    </div>
                </header>

                <div className="flex-1 relative">
                    {!isLoaded ? (
                        <div className="flex h-full items-center justify-center">
                            <div className="space-y-4 text-center">
                                <RefreshCw className="mx-auto h-10 w-10 text-amber-500 animate-spin" />
                                <p className="text-sm font-medium animate-pulse">Loading live tracking map...</p>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full w-full">
                            <GoogleMap
                                mapContainerStyle={MAP_CONTAINER_STYLE}
                                zoom={12}
                                center={DEFAULT_CENTER}
                                options={MAP_OPTIONS}
                            >
                                {filteredDrivers.map((driver) => (
                                    <MarkerF
                                        key={driver.id}
                                        position={{
                                            lat: driver.last_location!.latitude,
                                            lng: driver.last_location!.longitude,
                                        }}
                                        onClick={() => setSelectedDriver(driver)}
                                        icon={{
                                            url: 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png', // Delivery van icon
                                            scaledSize: new window.google.maps.Size(40, 40),
                                        }}
                                    />
                                ))}

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

                                {selectedDriver && (
                                    <InfoWindowF
                                        position={{
                                            lat: selectedDriver.last_location!.latitude,
                                            lng: selectedDriver.last_location!.longitude,
                                        }}
                                        onCloseClick={() => setSelectedDriver(null)}
                                    >
                                        <div className="p-3 min-w-[200px] text-slate-900">
                                            <div className="flex items-center gap-3 mb-3 border-b pb-2">
                                                <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold">
                                                    {selectedDriver.username.charAt(0)}
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-sm">{selectedDriver.username}</h3>
                                                    <p className="text-xs text-slate-500">{selectedDriver.phone || 'No phone'}</p>
                                                </div>
                                            </div>
                                            
                                            <div className="space-y-2 text-xs">
                                                <div className="flex items-center gap-2">
                                                    <Clock className="h-3 w-3 text-slate-400" />
                                                    <span>Last update: {
                                                        selectedDriver.last_location_update?.toDate 
                                                        ? selectedDriver.last_location_update.toDate().toLocaleTimeString() 
                                                        : 'Recent'
                                                    }</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Navigation className="h-3 w-3 text-slate-400" />
                                                    <span>Speed: {Math.round(selectedDriver.last_location?.speed || 0)} mph</span>
                                                </div>
                                            </div>

                                            <div className="flex gap-2">
                                                <button 
                                                    className="flex-1 mt-4 bg-indigo-600 text-white py-1.5 rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors"
                                                    onClick={() => {/* TODO: Detailed View */}}
                                                >
                                                    View Route
                                                </button>
                                                <button 
                                                    className="mt-4 bg-slate-100 text-slate-600 p-1.5 rounded-lg hover:bg-slate-200 transition-colors border border-slate-200"
                                                    onClick={() => handleShareLink(selectedDriver.id)}
                                                    title="Share Tracking Link"
                                                >
                                                    <Share2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </InfoWindowF>
                                )}
                            </GoogleMap>

                            {/* Overlay Sidebar for Active Drivers */}
                            <div className="absolute top-4 left-4 w-72 max-h-[calc(100%-32px)] overflow-hidden bg-card/90 backdrop-blur-md border border-divider rounded-2xl shadow-xl z-20 flex flex-col pointer-events-auto">
                                <div className="p-4 border-b border-divider">
                                    <h3 className="font-bold text-sm flex items-center gap-2">
                                        <Navigation className="h-4 w-4 text-amber-500" />
                                        Active Fleet
                                    </h3>
                                </div>
                                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                    {drivers.length === 0 ? (
                                        <div className="p-4 text-center">
                                            <p className="text-xs text-text-muted italic">No drivers currently on duty.</p>
                                        </div>
                                    ) : (
                                        filteredDrivers.map((driver) => (
                                            <button
                                                key={driver.id}
                                                className={`w-full text-left p-3 rounded-xl transition-all ${
                                                    selectedDriver?.username === driver.username 
                                                        ? 'bg-amber-500/20 border border-amber-500/30' 
                                                        : 'hover:bg-surface/50 border border-transparent'
                                                }`}
                                                onClick={() => setSelectedDriver(driver)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                                                        <User className="h-4 w-4" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-semibold text-xs truncate">{driver.username}</p>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500"></div>
                                                            <p className="text-[10px] text-text-muted">Moving • {Math.round(driver.last_location!.speed || 0)} mph</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
