import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Alert, Linking, Platform, Switch } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth-context';
import { useTheme } from '../lib/theme-context';
import { DriverService, Driver } from '../lib/driverService';
import InfoRow from '../components/InfoRow';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import { firebaseStorage, firebaseDb } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { ActivityIndicator } from 'react-native';
import { startLocationTracking, stopLocationTracking } from '../lib/location-task';

export default function AccountScreen() {
    const { t } = useTranslation();
    const { user, logout } = useAuth();
    const { colors } = useTheme();
    const [driver, setDriver] = useState<Driver | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const prevDriverRef = useRef<Driver | null>(null);

    useEffect(() => {
        if (!user?.uid) return;

        console.log('Subscribing to driver data for:', user.uid);
        const unsubscribe = DriverService.subscribeToDriver(
            user.uid,
            (data) => {
                setDriver(data);
                setLoading(false);
                
                // If they are supposed to be "On Duty" but app just opened,
                // we should try to ensure the background task is actually running.
                if (data?.is_on_duty && data?.is_active) {
                    console.log('Driver is on duty in Firestore, ensuring task is started...');
                    startLocationTracking().catch(err => {
                        console.error('Failed to auto-restart tracking:', err);
                    });
                }
            },
            (err) => {
                console.error('Driver subscription error:', err);
                setError('Failed to load driver data');
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [user?.uid]);

    // Monitor for approval/rejection
    useEffect(() => {
        if (!driver) return;

        const prev = prevDriverRef.current;
        if (prev && prev.pending_photo_url && !driver.pending_photo_url) {
            // Pending status cleared. Check if photo URL changed.
            // If photo_url changed to the pending one (or just changed), it's approved.
            // If photo_url is same as old, it's rejected.

            if (driver.photo_url !== prev.photo_url) {
                Alert.alert('Photo Approved', 'Your new profile photo is now live!');
            } else {
                // Rejected
                const reason = driver.rejection_reason || 'Photo did not meet requirements.';
                Alert.alert('Photo Rejected', `Reason: ${reason}`);
            }
        }

        prevDriverRef.current = driver;
    }, [driver]);

    const handleUpdatePhone = async (newPhone: string) => {
        if (!driver || !user?.uid) return;

        // Simple validation
        if (newPhone.length < 10) {
            Alert.alert('Invalid Phone', 'Please enter a valid phone number.');
            throw new Error('Invalid phone');
        }

        try {
            await DriverService.updatePhone(user.uid, newPhone);
            // Toast or success message could go here
        } catch (error) {
            Alert.alert('Update Failed', 'Could not update phone number. Please try again.');
            throw error;
        }
    };

    const handleContactDispatch = () => {
        // This number should be from Env or Config
        const phoneNumber = '5551234567';
        const link = Platform.OS === 'android' ? `tel:${phoneNumber}` : `telprompt:${phoneNumber}`;
        Linking.openURL(link);
    };

    const handlePickImage = async () => {
        try {
            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (permissionResult.granted === false) {
                Alert.alert('Permission to access camera roll is required!');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.5,
            });

            if (!result.canceled) {
                uploadImage(result.assets[0].uri);
            }
        } catch (e) {
            console.error(e);
            Alert.alert('Error picking image');
        }
    };

    const uploadImage = async (uri: string) => {
        if (!user?.uid) return;
        setUploading(true);
        try {
            const response = await fetch(uri);
            const blob = await response.blob();

            const storageRef = ref(firebaseStorage, `profile_photos/${user.uid}/pending.jpg`);

            // Explicitly set content type to satisfy storage rules
            const metadata = {
                contentType: 'image/jpeg',
            };

            console.log('Starting upload to:', storageRef.fullPath);
            await uploadBytes(storageRef, blob, metadata);
            console.log('Upload complete');

            const downloadURL = await getDownloadURL(storageRef);
            console.log('Got download URL:', downloadURL);

            // Update firestore
            const userRef = doc(firebaseDb, 'profiles', user.uid);
            await updateDoc(userRef, {
                pending_photo_url: downloadURL
            });
            console.log('Firestore updated');

            Alert.alert('Success', 'Profile photo uploaded and sent for approval.');
        } catch (e: any) {
            console.error('Upload flow error:', e);
            console.error('Error code:', e.code);
            console.error('Error message:', e.message);
            Alert.alert('Upload Failed', e.message || 'Please try again.');
        } finally {
            setUploading(false);
        }
    };

    const handleToggleDuty = async (value: boolean) => {
        if (!user?.uid || !driver) return;

        try {
            console.log('Toggling duty to:', value);
            if (value) {
                // Starting Duty
                const started = await startLocationTracking();
                if (!started) {
                    Alert.alert(
                        'Permission Required',
                        'Location access is required for deliveries. \n\n1. Allow "While Using App"\n2. Then select "Change to Always Allow" in system settings.',
                        [
                            { text: 'Open Settings', onPress: () => Linking.openSettings() },
                            { text: 'Cancel', style: 'cancel' }
                        ]
                    );
                    return;
                }
                Alert.alert('On Duty', 'Your location is now being tracked for dispatch.');
            } else {
                // Stopping Duty
                await stopLocationTracking();
                Alert.alert('Off Duty', 'Tracking has been disabled.');
            }

            // Update Firestore
            const userRef = doc(firebaseDb, 'profiles', user.uid);
            await updateDoc(userRef, {
                is_on_duty: value
            });
        } catch (e: any) {
            console.error('Error toggling duty:', e);
            Alert.alert('Update Failed', e.message || 'Could not update duty status.');
        }
    };

    if (loading) {
        return (
            <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
                <Text style={{ color: colors.textPrimary }}>Loading profile...</Text>
            </View>
        );
    }

    if (error || !driver) {
        return (
            <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
                <Text style={{ color: colors.error, marginBottom: 16 }}>{error || 'Driver profile not found.'}</Text>
                <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
                    <Text style={{ color: colors.primary }}>Sign Out</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // Compute Working Days
    const now = new Date();
    const createdAt = new Date(driver.created_at);
    // Safe check if created_at is valid
    const isValidDate = !isNaN(createdAt.getTime());
    const workingDays = isValidDate
        ? Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)))
        : 0;

    return (
        <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: colors.surface }]}>
                <View style={{ position: 'relative' }}>
                    <Image
                        source={{ uri: driver.photo_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(driver.username) }}
                        style={styles.avatar}
                    />
                    <TouchableOpacity
                        style={[styles.cameraBtn, { backgroundColor: colors.primary }]}
                        onPress={handlePickImage}
                        disabled={uploading}
                    >
                        {uploading ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Ionicons name="camera" size={20} color="#fff" />
                        )}
                    </TouchableOpacity>
                </View>

                <Text style={[styles.name, { color: colors.textPrimary }]}>{driver.username}</Text>

                <View style={[
                    styles.badge,
                    { backgroundColor: driver.is_active ? colors.success + '20' : colors.error + '20' }
                ]}>
                    <Text style={[
                        styles.badgeText,
                        { color: driver.is_active ? colors.success : colors.error }
                    ]}>
                        {driver.is_active ? 'ACTIVE' : 'DISABLED'}
                    </Text>
                </View>

                {/* On Duty Toggle */}
                {driver.is_active && (
                    <View style={[styles.onDutyContainer, { backgroundColor: colors.surface, borderColor: colors.divider + '30' }]}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.onDutyLabel, { color: colors.textPrimary }]}>
                                {driver.is_on_duty ? 'ON DUTY' : 'OFF DUTY'}
                            </Text>
                            <Text style={[styles.onDutySub, { color: colors.textSecondary }]}>
                                {driver.is_on_duty ? 'Location tracking active' : 'Tracking is disabled'}
                            </Text>
                        </View>
                        <Switch
                            value={driver.is_on_duty}
                            onValueChange={handleToggleDuty}
                            trackColor={{ false: '#767577', true: colors.primary + '80' }}
                            thumbColor={driver.is_on_duty ? colors.primary : '#f4f3f4'}
                            ios_backgroundColor="#3e3e3e"
                        />
                    </View>
                )}

                {!driver.is_active && (
                    <View style={[styles.banner, { backgroundColor: colors.error + '15', borderColor: colors.error + '30' }]}>
                        <Ionicons name="alert-circle" size={20} color={colors.error} style={{ marginRight: 8 }} />
                        <Text style={[styles.bannerText, { color: colors.error }]}>Account Disabled — Contact Dispatch</Text>
                    </View>
                )}
            </View>

            {/* Notification Banners Section - Moved out of Header to prevent overlap */}
            {driver.pending_photo_url && (
                <View style={[styles.section, { marginTop: -12 }]}>
                    <View style={[styles.banner, { backgroundColor: colors.warning + '15', borderColor: colors.warning + '30' }]}>
                        <Ionicons name="time" size={20} color={colors.warning} style={{ marginRight: 8 }} />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.bannerText, { color: colors.warning }]}>Photo Pending Approval</Text>
                            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                                Admin is reviewing your photo.
                            </Text>
                        </View>
                    </View>
                </View>
            )}

            {/* Quick Stats */}
            <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Quick Stats</Text>
                <View style={styles.statsRow}>
                    <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
                        <Ionicons name="calendar" size={24} color={colors.warning || '#f59e0b'} />
                        <Text style={[styles.statValue, { color: colors.textPrimary }]}>{workingDays}</Text>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Days Active</Text>
                    </View>
                </View>
            </View>

            {/* Account Info */}
            <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Account Info</Text>
                <View style={[styles.card, { backgroundColor: colors.surface }]}>
                    <InfoRow
                        icon="person"
                        label="Name"
                        value={driver.username}
                        disabled
                    />
                    <InfoRow
                        icon="mail"
                        label="Email"
                        value={driver.email}
                        disabled
                    />
                    <InfoRow
                        icon="call"
                        label="Phone"
                        value={driver.phone}
                        editable={driver.is_active}
                        onSave={handleUpdatePhone}
                        disabled={!driver.is_active}
                    />
                    <InfoRow
                        icon="location"
                        label="Base Address"
                        value={driver.driver_base_address}
                        disabled
                    />
                </View>
            </View>

            {/* Support */}
            <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Support</Text>
                <View style={[styles.card, { backgroundColor: colors.surface }]}>
                    <TouchableOpacity style={styles.supportButton} onPress={handleContactDispatch}>
                        <View style={[styles.supportIcon, { backgroundColor: colors.primary + '15' }]}>
                            <Ionicons name="headset" size={24} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.supportLabel, { color: colors.textPrimary }]}>Contact Dispatch</Text>
                            <Text style={[styles.supportSub, { color: colors.textSecondary }]}>Call for immediate assistance</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={{ height: 40 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        padding: 24,
        alignItems: 'center',
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        marginBottom: 24,
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
        marginBottom: 16,
        borderWidth: 3,
        borderColor: '#ffffff20',
        backgroundColor: '#ccc'
    },
    cameraBtn: {
        position: 'absolute',
        bottom: 16,
        right: 0,
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: '#fff',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
    name: {
        fontSize: 24,
        fontWeight: '700',
        marginBottom: 8,
    },
    badge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        marginBottom: 12,
    },
    badgeText: {
        fontSize: 12,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    },
    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        marginTop: 8,
        borderWidth: 1,
        width: '100%',
        justifyContent: 'center',
    },
    bannerText: {
        fontWeight: '600',
        fontSize: 14,
    },
    section: {
        paddingHorizontal: 16,
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        textTransform: 'uppercase',
        marginBottom: 12,
        letterSpacing: 0.5,
        marginLeft: 4,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    statCard: {
        flex: 1,
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
    },
    statValue: {
        fontSize: 28,
        fontWeight: '700',
        marginTop: 8,
    },
    statLabel: {
        fontSize: 12,
        marginTop: 4,
        fontWeight: '500',
    },
    card: {
        borderRadius: 16,
        overflow: 'hidden',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
    },
    supportButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
    },
    supportIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    supportLabel: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 2,
    },
    supportSub: {
        fontSize: 13,
    },
    logoutBtn: {
        marginTop: 16,
        padding: 12,
    },
    onDutyContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        width: '100%',
        marginTop: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
    },
    onDutyLabel: {
        fontSize: 16,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    },
    onDutySub: {
        fontSize: 12,
        marginTop: 2,
    }
});
