import { useState, useEffect, useRef } from 'react';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform, Alert } from 'react-native';
import { firebaseDb as db } from './firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from './auth-context';
import { navigate } from '../navigation/navigationRef';

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true
    }),
});

export function usePushNotifications() {
    const { profile, user } = useAuth();
    const [expoPushToken, setExpoPushToken] = useState<string>('');
    const [notification, setNotification] = useState<Notifications.Notification | null>(null);
    const notificationListener = useRef<Notifications.EventSubscription | null>(null);
    const responseListener = useRef<Notifications.EventSubscription | null>(null);

    useEffect(() => {
        // If driver is not authenticated or profile doesn't exist, we don't register devices for them
        if (!user?.uid) return;

        const tenantId = profile?.tenant_id || 'default';

        async function registerForPushNotificationsAsync() {
            if (Platform.OS === 'android') {
                await Notifications.setNotificationChannelAsync('default', {
                    name: 'default',
                    importance: Notifications.AndroidImportance.MAX,
                    vibrationPattern: [0, 250, 250, 250],
                    lightColor: '#FF231F7C',
                });
            }

            if (Device.isDevice) {
                const { status: existingStatus } = await Notifications.getPermissionsAsync();
                let finalStatus = existingStatus;
                if (existingStatus !== 'granted') {
                    // Pre-permission explanation for iOS App Store compliance
                    const userChoseToContinue = await new Promise((resolve) => {
                        Alert.alert(
                            "Enable Notifications",
                            "We use push notifications to alert you when new deliveries are assigned and to remind you of upcoming scheduled pickups.",
                            [
                                { text: "Not Now", style: "cancel", onPress: () => resolve(false) },
                                { text: "Continue", onPress: () => resolve(true) }
                            ]
                        );
                    });
                    
                    if (userChoseToContinue) {
                        const { status } = await Notifications.requestPermissionsAsync();
                        finalStatus = status;
                    }
                }
                
                if (finalStatus !== 'granted') {
                    console.log('Failed to get push token for push notification!');
                    return;
                }

                try {
                    console.log(`Attempting to register push token for tenant: ${tenantId}`);
                    // 1. Get Expo Push Token (using projectId for SDK 54+)
                    const projectId = Constants.expoConfig?.extra?.eas?.projectId || "c7b66be6-92a6-48c8-b841-2a55ec632935";
                    console.log(`Using projectId: ${projectId}`);
                    
                    const expoTokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
                    const expoToken = expoTokenResponse.data;
                    console.log(`Expo Token: ${expoToken}`);
                    
                    // 2. Get Native Device Token (FCM/APNs) - still useful for reference or native logic
                    let deviceToken = '';
                    try {
                        const deviceTokenResponse = await Notifications.getDevicePushTokenAsync();
                        deviceToken = deviceTokenResponse.data;
                        console.log(`Device Token: ${deviceToken}`);
                    } catch (dtError) {
                        console.log("Could not get native device token (usually fine on simulators):", dtError);
                    }
                    
                    setExpoPushToken(expoToken);
                    
                    // Use a more stable device ID for key
                    const deviceId = Device.osBuildId || Device.modelName?.replace(/\s+/g, '_') || expoToken.substring(0, 30);
                    
                    const deviceRef = doc(db, `tenants/${tenantId}/driver_devices`, deviceId);
                    await setDoc(deviceRef, {
                        driver_id: (profile as any)?.id || user!.uid,
                        user_id: user!.uid,
                        expo_push_token: expoToken,
                        fcm_token: deviceToken, 
                        platform: Platform.OS.toLowerCase(),
                        app_version: Constants.expoConfig?.version || '1.0.0',
                        last_seen_at: serverTimestamp(),
                        updated_at: serverTimestamp(),
                        created_at: serverTimestamp(),
                        notifications_enabled: true,
                        status: 'active'
                    }, { merge: true });
                    
                    console.log("Push Device Registered Successfully in Firestore");

                } catch (e) {
                    console.log("Error in registerForPushNotificationsAsync:", e);
                }
            } else {
                console.log('Must use physical device for Push Notifications');
            }
        }

        registerForPushNotificationsAsync();

        // Foreground notification handler
        notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
            console.log('Foreground notification received:', notification.request.content.title);
            setNotification(notification);
        });

        // Background/Opened notification handler
        responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
            const data = response.notification.request.content.data;
            console.log('Notification clicked with data:', data);

            // Deep linking logic
            const { type, order_id, orderId } = data as { type?: string, order_id?: string, orderId?: string };
            const idToUse = order_id || orderId;

            if (type === 'order_assigned' || type === 'pickup_reminder') {
                if (idToUse) {
                    // Match the expected param name in TaskDetailScreen
                    navigate('TaskDetail', { orderId: idToUse });
                }
            } else if (type === 'manual') {
                navigate('Tasks');
            }
        });

        return () => {
            if (notificationListener.current) {
                notificationListener.current.remove();
            }
            if (responseListener.current) {
                responseListener.current.remove();
            }
        };
    }, [user?.uid, profile]);

    return {
        expoPushToken,
        notification
    };
}
