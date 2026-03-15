import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Linking, Image, ActivityIndicator } from 'react-native';
import { collection, query, where, getDocs, orderBy, doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { firebaseDb, firebaseStorage, firebaseFunctions } from '../lib/firebase';
import { useAuth } from '../lib/auth-context';
import { useTheme } from '../lib/theme-context';
import { Order, RouteStep } from '../types';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useRoute, useNavigation } from '@react-navigation/native';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { SlideToComplete } from '../components/SlideToComplete';
import { TactileButton } from '../components/TactileButton';

export default function TaskDetailScreen() {
    const route = useRoute<any>();
    const navigation = useNavigation<any>();
    const { t } = useTranslation();
    const { user, profile } = useAuth();
    const { colors } = useTheme();
    // stepId is now the primary driver. orderId kept for fallback/context if needed.
    const { orderId, stepId } = route.params;

    const [order, setOrder] = useState<Order | null>(null);
    const [currentStep, setCurrentStep] = useState<RouteStep | null>(null);
    const [taskPhoto, setTaskPhoto] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [completing, setCompleting] = useState(false);
    const [loading, setLoading] = useState(true);

    const fetchDetails = async () => {
        try {
            // 1. Fetch Order Details directly
            const orderDoc = await getDoc(doc(firebaseDb, 'orders', orderId));
            if (!orderDoc.exists()) {
                Alert.alert("Error", "Order not found");
                navigation.goBack();
                return;
            }
            const orderData = { id: orderDoc.id, ...orderDoc.data() } as Order;
            setOrder(orderData);

            // 2. Fetch the specific step if stepId is provided, or infer it
            if (stepId) {
                // Check if it's a manual step
                if (stepId.startsWith('manual_')) {
                    const type = stepId.includes('_pickup') ? 'pickup' : 'dropoff';
                    const isCompleted = orderData.status === 'delivered' || (type === 'pickup' && orderData.status !== 'assigned' && orderData.status !== 'new');

                    setCurrentStep({
                        id: stepId,
                        sequence_index: 0,
                        order_id: orderData.id,
                        task_type: type as any,
                        address: type === 'pickup' ? orderData.pickup_address : orderData.dropoff_address,
                        lat: type === 'pickup' ? orderData.pickup_lat : orderData.dropoff_lat,
                        lng: type === 'pickup' ? orderData.pickup_lng : orderData.dropoff_lng,
                        status: isCompleted ? 'completed' : 'pending',
                        required_photo_type: type === 'pickup' ? 'pickup' : 'delivery',
                        completed_at: null
                    });
                }
                else if (orderData.route_group_id) {
                    const stepsSnap = await getDocs(
                        query(collection(firebaseDb, 'route_groups', orderData.route_group_id, 'steps'), orderBy('sequence_index', 'asc'))
                    );

                    const allSteps: RouteStep[] = [];
                    stepsSnap.forEach((doc) => {
                        allSteps.push({ id: doc.id, ...doc.data() } as RouteStep);
                    });

                    const targetStep = allSteps.find(s => s.id === stepId);
                    setCurrentStep(targetStep || null);
                }
            } else {
                // Fallback logic
                if (orderData.route_group_id) {
                    // ... existing fallback
                } else {
                    // Manual order fallback - assume pickup if not started
                    const type = (orderData.status === 'new' || orderData.status === 'assigned') ? 'pickup' : 'dropoff';
                    setCurrentStep({
                        id: `manual_${orderData.id}_${type}`,
                        sequence_index: 0,
                        order_id: orderData.id,
                        task_type: type,
                        address: type === 'pickup' ? orderData.pickup_address : orderData.dropoff_address,
                        lat: type === 'pickup' ? orderData.pickup_lat : orderData.dropoff_lat,
                        lng: type === 'pickup' ? orderData.pickup_lng : orderData.dropoff_lng,
                        status: 'pending',
                        required_photo_type: type === 'pickup' ? 'pickup' : 'delivery',
                        completed_at: null
                    });
                }
            }

        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchDetails(); }, [orderId, stepId]);

    const takePhoto = async () => {
        try {
            const permission = await ImagePicker.requestCameraPermissionsAsync();
            if (!permission.granted) {
                Alert.alert('Permission required', 'Camera permission is required');
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: 'images' as any,
                quality: 0.7,
            });

            if (!result.canceled && result.assets[0]) {
                let uri = result.assets[0].uri;
                try {
                    const manipResult = await manipulateAsync(
                        uri,
                        [{ resize: { width: 1024 } }],
                        { compress: 0.7, format: SaveFormat.JPEG }
                    );
                    uri = manipResult.uri;
                } catch (resizeError) {
                    console.error("Resize error:", resizeError);
                }
                setTaskPhoto(uri);
            }
        } catch (error: any) {
            console.error("Camera Error:", error);
            Alert.alert("Camera Error", error.message || "Failed to open camera");
        }
    };

    const handleSwipeComplete = async () => {
        if (!currentStep || !user) return; // Removed order.route_group_id check

        // Validation: Photo optional for now as requested
        // if (currentStep.task_type === 'dropoff' && !taskPhoto) {
        //     Alert.alert('Photo Required', 'Please take a photo before completing this step');
        //     return;
        // }

        setCompleting(true);
        try {
            let path = '';

            if (taskPhoto) {
                const blob: Blob = await new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.onload = function () { resolve(xhr.response); };
                    xhr.onerror = function (e) { reject(new TypeError('Network request failed')); };
                    xhr.responseType = 'blob';
                    xhr.open('GET', taskPhoto, true);
                    xhr.send(null);
                });

                const cleanDriverName = profile?.username?.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'unknown_driver';
                const cleanRestaurantName = order?.restaurant_name?.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'unknown_rest';
                const formattedDate = format(new Date(), 'MMddyyyyHHmm');

                const folderName = `${formattedDate}_${cleanDriverName}_${cleanRestaurantName}`;
                path = `photos/${folderName}/${currentStep.task_type}.jpg`;

                const storageRef = ref(firebaseStorage, path);
                const metadata = { contentType: 'image/jpeg' };
                await uploadBytes(storageRef, blob, metadata);
            }

            if (order?.route_group_id && !currentStep.id.startsWith('manual_')) {
                // Standard Route Group Flow
                const completeStep = httpsCallable(firebaseFunctions, 'driverCompleteStep');
                await completeStep({
                    route_group_id: order.route_group_id,
                    step_id: currentStep.id,
                    photo_storage_path: path || null,
                });

                // Find interior Next Step Logic...
                const stepsSnap = await getDocs(
                    query(collection(firebaseDb, 'route_groups', order.route_group_id, 'steps'), orderBy('sequence_index', 'asc'))
                );
                const allSteps = stepsSnap.docs.map(d => ({ id: d.id, ...d.data() } as RouteStep));
                const currentIndex = allSteps.findIndex(s => s.id === currentStep.id);
                // The backend handles status update, but we need to know the next pending step
                // The next step in sequence might already be completed if out of order, but generally it's the next index.
                // Let's find the first pending step AFTER this one.
                const nextStep = allSteps.slice(currentIndex + 1).find(s => s.status !== 'completed');

                if (!nextStep) {
                    Alert.alert(
                        `${t('route.completed_title')} 🎉`,
                        t('route.completed_message'),
                        [{ text: 'OK', onPress: () => navigation.goBack() }]
                    );
                } else {
                    // Reverted back to manual selection per user request
                    navigation.goBack();
                }

            } else {
                // Manual Order Flow
                if (!order) return;

                const nextStatus = currentStep.task_type === 'pickup' ? 'in_progress' : 'delivered';

                // Try to update directly
                await updateDoc(doc(firebaseDb, 'orders', order.id), {
                    status: nextStatus,
                    last_event_time: new Date(),
                    [`${currentStep.task_type}_completed_at`]: new Date(),
                    ...(path ? { [`${currentStep.task_type}_photo_path`]: path } : {})
                } as any);

                // Manual Next Step Logic
                if (currentStep.task_type === 'pickup') {
                    // Reverted back to manual selection per user request
                    navigation.goBack();
                } else {
                    Alert.alert(
                        `${t('route.completed_title')} 🎉`,
                        t('route.completed_message'),
                        [{ text: 'OK', onPress: () => navigation.goBack() }]
                    );
                }
            }

        } catch (error: any) {
            console.error("Complete Error:", error);
            Alert.alert(t('common.error_title'), error.message || 'Failed to complete step');
            setCompleting(false); // Only reset if error, otherwise we are navigating away
        }
    };

    const openNavigation = (lat: number, lng: number) => {
        Alert.alert(t('task_detail.open_navigation'), 'Choose your navigation app', [
            { text: 'Google Maps', onPress: () => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`) },
            { text: 'Apple Maps', onPress: () => Linking.openURL(`http://maps.apple.com/?daddr=${lat},${lng}`) },
            { text: 'Waze', onPress: () => Linking.openURL(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`) },
            { text: 'Cancel', style: 'cancel' },
        ]);
    };

    if (loading) {
        return <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.primary} /></View>;
    }

    if (!order || !currentStep) {
        return <View style={[styles.container, { backgroundColor: colors.background }]}><Text style={styles.errorText}>{t('task_detail.order_not_found')}</Text></View>;
    }

    const isStepCompleted = currentStep.status === 'completed';
    const isPickup = currentStep.task_type === 'pickup';
    // Use proper coords depending on step type
    const lat = isPickup ? order.pickup_lat : order.dropoff_lat;
    const lng = isPickup ? order.pickup_lng : order.dropoff_lng;
    const address = isPickup ? order.pickup_address : order.dropoff_address;

    const formatTime = (dateAny: any) => {
        if (!dateAny) return 'N/A';
        try {
            if (typeof dateAny.toDate === 'function') {
                return format(dateAny.toDate(), 'h:mm a');
            }
            if (dateAny instanceof Date) {
                return format(dateAny, 'h:mm a');
            }
            if (typeof dateAny === 'object' && 'seconds' in dateAny) {
                return format(new Date(dateAny.seconds * 1000), 'h:mm a');
            }
            return String(dateAny);
        } catch (e) {
            return 'N/A';
        }
    };

    return (
        <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Context Header */}
            <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
                <View style={styles.stepBadge}>
                    <Text style={styles.stepBadgeText}>{t('task_detail.step_label', { number: currentStep.sequence_index + 1 })}</Text>
                </View>
                <Text style={[styles.restaurantName, { color: colors.textPrimary }]}>
                    {isPickup ? `${t('task_detail.pickup')}: ${order.restaurant_name}` : `${t('task_detail.delivery')}: Customer`}
                </Text>
                <Text style={[styles.orderRef, { color: colors.textSecondary }]}>{t('task_detail.order_ref', { code: order.order_code })}</Text>

                {/* Admin Notes Alert */}
                {order.admin_notes && (
                    <View style={{
                        marginTop: 12,
                        backgroundColor: '#FEF3C7',
                        padding: 12,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: '#F59E0B',
                        width: '100%'
                    }}>
                        <Text style={{ color: '#D97706', fontWeight: 'bold', marginBottom: 4, fontSize: 13 }}>
                            📝 {t('task_detail.additional_note')}
                        </Text>
                        <Text style={{ color: '#92400E', fontSize: 14 }}>
                            {order.admin_notes}
                        </Text>
                    </View>
                )}
            </View>

            {/* Main Action Card */}
            <View style={[
                styles.card,
                {
                    backgroundColor: colors.card,
                    borderColor: isStepCompleted ? colors.success : colors.primary,
                    opacity: isStepCompleted ? 0.8 : 1
                }
            ]}>
                <View style={styles.cardHeader}>
                    <Text style={[styles.cardTitle, { color: isStepCompleted ? colors.success : colors.primary }]}>
                        {isStepCompleted
                            ? (isPickup ? t('task_detail.pickup_completed') : t('task_detail.delivery_completed'))
                            : (isPickup ? t('task_detail.go_to_restaurant') : t('task_detail.go_to_customer'))
                        }
                    </Text>
                </View>

                <Text style={[styles.address, { color: colors.textPrimary }]}>{address}</Text>

                <TactileButton
                    label={t('task_detail.open_navigation')}
                    leftIcon="map"
                    variant="primary"
                    onPress={() => openNavigation(lat, lng)}
                    disabled={isStepCompleted} // Disable if completed
                    style={{
                        marginBottom: 16,
                        backgroundColor: isStepCompleted ? colors.disabled : colors.info,
                        borderColor: isStepCompleted ? colors.disabled : colors.info
                    }}
                    textStyle={{ color: '#FFFFFF' }}
                />

                {/* Photo Section */}
                <View style={styles.photoSection}>
                    {!isStepCompleted && (
                        <TactileButton
                            label={taskPhoto ? t('task_detail.retake_photo') : (isPickup ? t('task_detail.take_pickup_photo') : t('task_detail.take_dropoff_photo_opt'))}
                            leftIcon="camera"
                            variant="primary"
                            onPress={takePhoto}
                            style={{ flex: 1, backgroundColor: colors.secondary, borderColor: colors.secondary }}
                            textStyle={{ color: '#FFFFFF' }}
                        />
                    )}

                    {taskPhoto && (
                        <Image source={{ uri: taskPhoto }} style={[styles.photoPreview, isStepCompleted && { opacity: 0.7 }]} />
                    )}
                </View>

                {/* Swipe Action */}
                <View style={styles.swipeSection}>
                    {isStepCompleted ? (
                        <View style={[styles.completedBanner, { backgroundColor: colors.success + '20' }]}>
                            <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                            <Text style={[styles.completedText, { color: colors.success }]}>
                                {t('common.completed')}
                            </Text>
                        </View>
                    ) : (
                        <SlideToComplete
                            onComplete={handleSwipeComplete}
                            text={isPickup ? t('task_detail.swipe_pickup') : t('task_detail.swipe_dropoff')}
                            loading={completing}
                            activeColor={colors.primary}
                            disabled={false}
                        />
                    )}
                </View>

            </View>


            {/* Schedule & Payout Info */}
            <View style={[styles.infoSection, { backgroundColor: colors.surface }]}>
                <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t('task_detail.scheduled_time')}:</Text>
                    <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
                        {isPickup ? formatTime(order.time_window_start) : formatTime(order.time_window_end)}
                    </Text>
                </View>
                <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t('task_detail.payout')}:</Text>
                    <Text style={[styles.infoValue, { color: colors.success }]}>${(order.payout_amount || 0).toFixed(2)}</Text>
                </View>
            </View>

        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    errorText: { textAlign: 'center', marginTop: 40, fontSize: 16 },
    header: { padding: 20, borderBottomWidth: 1, alignItems: 'center' },
    stepBadge: { backgroundColor: '#F59E0B', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 8 },
    stepBadgeText: { fontWeight: 'bold', fontSize: 12 },
    restaurantName: { fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
    orderRef: { fontSize: 14, marginTop: 4 },

    card: { margin: 16, padding: 20, borderRadius: 16, borderWidth: 2 },
    cardHeader: { marginBottom: 16, alignItems: 'center' },
    cardTitle: { fontSize: 22, fontWeight: '800', textTransform: 'uppercase' },
    address: { fontSize: 16, lineHeight: 24, textAlign: 'center', marginBottom: 20 },

    navButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 14, borderRadius: 12, marginBottom: 20 },
    navButtonText: { fontWeight: 'bold', fontSize: 16 },

    photoSection: { marginBottom: 24 },
    photoButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 12 },
    photoButtonText: { fontWeight: '600' },
    photoPreview: { width: '100%', height: 200, borderRadius: 12, backgroundColor: '#eee' },

    swipeSection: { marginTop: 8 },

    infoSection: { padding: 20, marginTop: 8 },
    infoTitle: { fontSize: 14, fontWeight: '600', marginBottom: 12, textTransform: 'uppercase' },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    infoLabel: { fontSize: 14 },
    infoValue: { fontSize: 14, fontWeight: '600' },
    completedBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderRadius: 12,
        gap: 8,
    },
    completedText: {
        fontSize: 18,
        fontWeight: 'bold',
        letterSpacing: 1,
    }
});
