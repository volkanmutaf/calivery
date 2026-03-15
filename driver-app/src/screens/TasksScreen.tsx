import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Linking } from 'react-native';
import * as Location from 'expo-location';
import { collection, query, where, getDocs, orderBy, doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { firebaseDb } from '../lib/firebase';
import { useAuth } from '../lib/auth-context';
import { useTheme } from '../lib/theme-context';
import { Order, RouteStep } from '../types';
import { format, addDays } from 'date-fns';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import RouteTimeline, { RouteItem } from '../components/RouteTimeline';

import { startLocationTracking } from '../lib/location-task';

type TabType = 'today' | 'tomorrow';

export default function TasksScreen() {
    const { t } = useTranslation();
    const { user } = useAuth();
    const { colors } = useTheme();
    const navigation = useNavigation<any>();

    // UI State
    const [activeTab, setActiveTab] = useState<TabType>('today');
    const [loading, setLoading] = useState(true);

    // Split state for the two data sources
    const [routeGroupItems, setRouteGroupItems] = useState<RouteItem[]>([]);
    const [manualItems, setManualItems] = useState<RouteItem[]>([]);
    const [routeItems, setRouteItems] = useState<RouteItem[]>([]);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    useFocusEffect(
        React.useCallback(() => {
            setRefreshTrigger((prev: number) => prev + 1);
        }, [])
    );

    useEffect(() => {
        if (!user) return;
        setLoading(true);

        const today = new Date();
        const targetDate = activeTab === 'today'
            ? format(today, 'yyyy-MM-dd')
            : format(addDays(today, 1), 'yyyy-MM-dd');

        // --- 1. Listener for Manual Orders ---
        const manualOrdersQuery = query(
            collection(firebaseDb, 'orders'),
            where('assigned_driver_id', '==', user.uid),
            where('scheduled_date', '==', targetDate),
            where('status', 'in', ['assigned', 'in_progress'])
        );

        const unsubManual = onSnapshot(manualOrdersQuery, (snapshot) => {
            try {
                console.log(`Manual orders snapshot received: ${snapshot.size} items`);
                const items: RouteItem[] = [];
                snapshot.docs.forEach(doc => {
                    const order = { id: doc.id, ...doc.data() } as Order;
                    console.log(`Processing manual order: ${order.order_code}`);

                    // Create pseudo-steps for manual order
                    items.push({
                        step: {
                            id: `manual_${order.id}_pickup`,
                            sequence_index: 999,
                            order_id: order.id,
                            task_type: 'pickup',
                            address: order.pickup_address,
                            lat: order.pickup_lat,
                            lng: order.pickup_lng,
                            status: order.status === 'in_progress' ? 'completed' : 'pending',
                            required_photo_type: 'pickup',
                            completed_at: null
                        },
                        order: order,
                        isNext: false
                    });

                    items.push({
                        step: {
                            id: `manual_${order.id}_dropoff`,
                            sequence_index: 999,
                            order_id: order.id,
                            task_type: 'dropoff',
                            address: order.dropoff_address,
                            lat: order.dropoff_lat,
                            lng: order.dropoff_lng,
                            status: 'pending',
                            required_photo_type: 'delivery',
                            completed_at: null
                        },
                        order: order,
                        isNext: false
                    });
                });
                setManualItems(items);
            } catch (err) {
                console.error("Error in Manual Orders snapshot handler:", err);
            }
        });

        // --- 2. Listener for Route Groups ---
        const rgQuery = query(
            collection(firebaseDb, 'route_groups'),
            where('driver_id', '==', user.uid),
            where('scheduled_date', '==', targetDate),
            where('status', '==', 'active'),
            orderBy('generated_at', 'asc')
        );

        const unsubRG = onSnapshot(rgQuery, async (snapshot) => {
            try {
                console.log(`Route groups snapshot received: ${snapshot.size} items`);
                if (snapshot.empty) {
                    setRouteGroupItems([]);
                    return;
                }

                const newItems: RouteItem[] = [];

                // Process each group
                for (const rgDoc of snapshot.docs) {
                    const stepsSnap = await getDocs(
                        query(collection(firebaseDb, 'route_groups', rgDoc.id, 'steps'), orderBy('sequence_index', 'asc'))
                    );

                    const steps: RouteStep[] = [];
                    stepsSnap.forEach((doc) => {
                        steps.push({ id: doc.id, ...doc.data() } as RouteStep);
                    });

                    // Fetch orders for these steps
                    const uniqueOrderIds = [...new Set(steps.map(s => s.order_id))];
                    const ordersMap: Record<string, Order> = {};

                    for (const orderId of uniqueOrderIds) {
                        try {
                            const orderDoc = await getDoc(doc(firebaseDb, 'orders', orderId));
                            if (orderDoc.exists()) {
                                ordersMap[orderId] = { id: orderDoc.id, ...orderDoc.data() } as Order;
                                console.log(`Fetched route order: ${ordersMap[orderId].order_code}`);
                            }
                        } catch (orderErr) {
                            console.error(`Error fetching order ${orderId}:`, orderErr);
                        }
                    }

                    // Build items
                    steps.forEach(step => {
                        if (ordersMap[step.order_id]) {
                            newItems.push({
                                step,
                                order: ordersMap[step.order_id],
                                isNext: false
                            });
                        }
                    });
                }
                setRouteGroupItems(newItems);
            } catch (rgErr) {
                console.error("Error in Route Groups snapshot handler:", rgErr);
            }
        });

        return () => {
            unsubManual();
            unsubRG();
        };
    }, [user, activeTab, refreshTrigger]);

    // Merge and Process
    useEffect(() => {
        try {
            // Combine arrays
            const combined = [...routeGroupItems];
            const routeOrderIds = new Set(routeGroupItems.map(i => i.order.id));

            manualItems.forEach((mItem: RouteItem) => {
                if (!routeOrderIds.has(mItem.order.id)) {
                    combined.push(mItem);
                }
            });

            // Determine "Next" step
            let foundNext = false;
            const processed = combined.map((item: RouteItem) => {
                // Defensive check to prevent crash if step is missing
                if (!item || !item.step) return null;

                const newItem = { ...item, isNext: false };

                if (item.step.status === 'pending' && !foundNext) {
                    newItem.isNext = true;
                    foundNext = true;
                }
                return newItem;
            }).filter((i: RouteItem | null) => i !== null) as RouteItem[];

            setRouteItems(processed);
            setLoading(false);
        } catch (mergeErr) {
            console.error("Error in Task Merge Logic:", mergeErr);
            setLoading(false);
        }
    }, [routeGroupItems, manualItems]);


    const handleTaskPress = async (item: RouteItem) => {
        // First, check if global location services are enabled on the device
        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!servicesEnabled) {
            Alert.alert(
                'Location Services Disabled',
                'Please enable location services in your device settings to continue.',
                [{ text: 'OK' }]
            );
            return;
        }

        // Trigger foreground permission request
        const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
        
        if (fgStatus !== 'granted') {
            Alert.alert(
                'Permission Required',
                'Task tracking requires location access. Please allow "While Using App" in the next screen.',
                [{ text: 'OK' }]
            );
            return;
        }

        // Trigger background permission request (REQUIRED for tracking)
        const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();

        if (bgStatus !== 'granted') {
            Alert.alert(
                'Always Allow Required',
                'To track your delivery in the background, please select "Change to Always Allow" in your system settings.',
                [
                    { text: 'Open Settings', onPress: () => Linking.openSettings() },
                    { text: 'Cancel', style: 'cancel' }
                ]
            );
            return;
        }

        // Ensure tracking is started
        await startLocationTracking();

        // Mark as "On Duty" in Firestore so they appear on the live map
        if (user?.uid) {
            const userRef = doc(firebaseDb, 'profiles', user.uid);
            await updateDoc(userRef, { is_on_duty: true });
        }

        navigation.navigate('TaskDetail', {
            orderId: item.order.id, // Backward compat
            stepId: item.step.id
        });
    };

    const renderHeader = () => (
        <View style={styles.headerContainer}>
            {/* Tab Menu */}
            <View style={styles.tabMenuContainer}>
                <View style={[styles.tabMenu, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'today' && { backgroundColor: colors.primary }]}
                        onPress={() => setActiveTab('today')}
                    >
                        <Text style={[styles.tabText, { color: activeTab === 'today' ? '#fff' : colors.textSecondary }]}>
                            {t('tasks.today')}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'tomorrow' && { backgroundColor: colors.primary }]}
                        onPress={() => setActiveTab('tomorrow')}
                    >
                        <Text style={[styles.tabText, { color: activeTab === 'tomorrow' ? '#fff' : colors.textSecondary }]}>
                            {t('tasks.tomorrow')}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            <Text style={[styles.listTitle, { color: colors.textPrimary }]}>{t('tasks.your_route')}</Text>
            <Text style={[styles.listSubtitle, { color: colors.textSecondary }]}>
                {t('tasks.tasks_scheduled', { count: routeItems.length })}
            </Text>
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <RouteTimeline
                routeItems={routeItems}
                onTaskPress={handleTaskPress}
                refreshing={loading}
                onRefresh={() => {
                    // Pull to refresh could re-trigger the subscriptions or just be a no-op since it's realtime.
                    // For user feedback, we can toggle loading briefly.
                    setLoading(true);
                    setTimeout(() => setLoading(false), 500);
                }}
                ListHeaderComponent={renderHeader()}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    headerContainer: {
        paddingHorizontal: 20,
        paddingTop: 16,
        marginBottom: 16,
    },
    tabMenuContainer: { alignItems: 'center', marginBottom: 20 },
    tabMenu: {
        flexDirection: 'row',
        borderRadius: 12,
        borderWidth: 1,
        padding: 4,
    },
    tab: {
        paddingVertical: 8,
        paddingHorizontal: 24,
        borderRadius: 8,
    },
    tabText: { fontSize: 13, fontWeight: '600' },
    listTitle: { fontSize: 24, fontWeight: '800' },
    listSubtitle: { fontSize: 14, marginTop: 4 },
});
