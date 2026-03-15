import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { doc, updateDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { firebaseDb, firebaseAuth } from './firebase';

export const BACKGROUND_LOCATION_TASK = 'background-location-task';

// Define the background task
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error) {
        console.error('[LocationTask] Error:', error);
        return;
    }

    if (data) {
        const { locations }: any = data;
        const location = locations[0]; // Get the latest location

        if (location) {
            const { latitude, longitude, accuracy, speed, heading } = location.coords;
            const uid = firebaseAuth.currentUser?.uid;

            if (uid) {
                try {
                    // 1. Update Profile for Real-time Admin View
                    const profileRef = doc(firebaseDb, 'profiles', uid);
                    await updateDoc(profileRef, {
                        last_location: {
                            latitude,
                            longitude,
                            accuracy: accuracy || null,
                            speed: speed || null,
                            heading: heading || null,
                        },
                        last_location_update: serverTimestamp(),
                    });

                    // 2. Add to History for Breadcrumbs/Reports
                    const historyRef = collection(firebaseDb, 'location_history');
                    await addDoc(historyRef, {
                        driver_id: uid,
                        latitude,
                        longitude,
                        timestamp: serverTimestamp(),
                    });

                    console.log(`[LocationTask] Updated location for ${uid}: ${latitude}, ${longitude}`);
                } catch (dbError) {
                    console.error('[LocationTask] Firestore update failed:', dbError);
                }
            } else {
                console.log('[LocationTask] No user logged in, skipping update');
            }
        }
    }
});

/**
 * Register background location tracking
 */
export async function startLocationTracking() {
    console.log('[LocationTask] Evaluating permissions...');
    
    // Check foreground permissions first
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    console.log('[LocationTask] Foreground status:', foregroundStatus);
    
    if (foregroundStatus !== 'granted') {
        console.warn('[LocationTask] Foreground permission denied');
        return false;
    }

    // Check background permissions (required for task manager)
    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    console.log('[LocationTask] Background status:', backgroundStatus);
    
    if (backgroundStatus !== 'granted') {
        console.warn('[LocationTask] Background permission denied');
        return false;
    }

    const isStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (isStarted) {
        console.log('[LocationTask] Task already running');
        return true;
    }

    try {
        console.log('[LocationTask] Starting location updates...');
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 60000, 
            distanceInterval: 50,
            deferredUpdatesInterval: 60000,
            foregroundService: {
                notificationTitle: 'Calivery Driver Online',
                notificationBody: 'Location tracking is active for deliveries.',
                notificationColor: '#F59E0B',
            },
            pausesUpdatesAutomatically: false,
        });
        console.log('[LocationTask] Started successfully');

        // Immediate first sync so they appear on map instantly
        try {
            const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const uid = firebaseAuth.currentUser?.uid;
            if (uid && location) {
                const { latitude, longitude, accuracy, speed, heading } = location.coords;
                const profileRef = doc(firebaseDb, 'profiles', uid);
                await updateDoc(profileRef, {
                    last_location: {
                        latitude,
                        longitude,
                        accuracy: accuracy || null,
                        speed: speed || null,
                        heading: heading || null,
                    },
                    last_location_update: serverTimestamp(),
                });
                console.log('[LocationTask] Initial manual sync completed');
            }
        } catch (syncErr) {
            console.warn('[LocationTask] Initial sync failed (non-critical):', syncErr);
        }

        return true;
    } catch (err) {
        console.error('[LocationTask] CRITICAL FAILURE:', err);
        return false;
    }
}

/**
 * Unregister background location tracking
 */
export async function stopLocationTracking() {
    const isStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (isStarted) {
        console.log('[LocationTask] Stopping task...');
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        return true;
    }
    return false;
}
