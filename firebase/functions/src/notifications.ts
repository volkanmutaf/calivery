import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { SendManualNotificationRequest, SendManualNotificationResponse, Order } from './types';

// Lazy load Expo to handle ESM compatibility in CJS environment
let expoInstance: any = null;
async function getExpo() {
    if (!expoInstance) {
        const { Expo } = await import('expo-server-sdk');
        expoInstance = new Expo();
    }
    return expoInstance;
}

// Ensure admin is initialized (it might be already in index.ts but good practice)
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

// ============================================
// Helper Functions
// ============================================

function getTenantId(auth: { uid: string; token: Record<string, unknown> } | undefined): string {
    if (!auth) return 'default';
    return (auth.token?.tenant_id as string) || 'default';
}

async function verifyAdminOrDispatcher(uid: string | undefined): Promise<void> {
    if (!uid) {
        throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    const doc = await db.collection('profiles').doc(uid).get();
    if (!doc.exists) {
        throw new HttpsError('permission-denied', 'Profile not found');
    }
    const role = doc.data()?.role;
    // For now, only admins, super_admins, and tenant_admins can send
    if (role !== 'admin' && role !== 'super_admin' && role !== 'tenant_admin' && role !== 'dispatcher') {
        throw new HttpsError('permission-denied', 'Admin or Dispatcher access required');
    }
}

/**
 * Common function to send a multicast notification via FCM and Expo
 */
async function sendPushNotification(
    tenantId: string,
    tokens: string[],
    title: string,
    body: string,
    data: { [key: string]: string } = {}
) {
    if (tokens.length === 0) return { successCount: 0, failureCount: 0 };

    const expo = await getExpo();
    const { Expo } = await import('expo-server-sdk'); // Import class reference safely

    const expoTokens = tokens.filter(t => Expo.isExpoPushToken(t));
    const fcmTokens = tokens.filter(t => !Expo.isExpoPushToken(t));

    let successCount = 0;
    let failureCount = 0;

    // 1. Send via FCM
    if (fcmTokens.length > 0) {
        try {
            const message = {
                notification: { title, body },
                data,
                tokens: fcmTokens,
            };
            const response = await admin.messaging().sendEachForMulticast(message);
            successCount += response.successCount;
            failureCount += response.failureCount;

            // Optionally mark invalid FCM tokens as inactive
            const fcmTokensToRemove: string[] = [];
            response.responses.forEach((res, idx) => {
                if (!res.success) {
                    const errCode = res.error?.code;
                    if (errCode === 'messaging/invalid-registration-token' || errCode === 'messaging/registration-token-not-registered') {
                        fcmTokensToRemove.push(fcmTokens[idx]);
                    }
                }
            });

            if (fcmTokensToRemove.length > 0) {
                const devicesSnap = await db.collection(`tenants/${tenantId}/driver_devices`)
                    .where('fcm_token', 'in', fcmTokensToRemove)
                    .get();
                const batch = db.batch();
                devicesSnap.docs.forEach(doc => {
                    batch.update(doc.ref, { status: 'inactive', updated_at: admin.firestore.FieldValue.serverTimestamp() });
                });
                await batch.commit();
            }
        } catch (e) {
            console.error("FCM Send Error:", e);
            failureCount += fcmTokens.length;
        }
    }

    // 2. Send via Expo
    if (expoTokens.length > 0) {
        const messages: any[] = expoTokens.map(token => ({
            to: token,
            sound: 'default' as const,
            title,
            body,
            data,
        }));

        const chunks = expo.chunkPushNotifications(messages);
        for (const chunk of chunks) {
            try {
                const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                ticketChunk.forEach((ticket: any) => {
                    if (ticket.status === 'ok') {
                        successCount++;
                    } else {
                        failureCount++;
                        console.error("Expo Ticket Error:", ticket.details);
                    }
                });
            } catch (error) {
                console.error("Expo Send Error:", error);
                failureCount += chunk.length;
            }
        }
    }

    return {
        successCount,
        failureCount
    };
}

// ============================================
// Cloud Functions
// ============================================

/**
 * sendManualNotification
 * Called from Admin Panel to send ad-hoc notifications.
 */
export const sendManualNotification = onCall<SendManualNotificationRequest>(
    { region: 'us-central1', cors: true },
    async (request): Promise<SendManualNotificationResponse> => {
        await verifyAdminOrDispatcher(request.auth?.uid);

        const payload = request.data;
        const tenantId = getTenantId(request.auth);

        if (payload.tenant_id !== tenantId && tenantId !== 'default' && !(request.auth?.token.super_admin)) {
             throw new HttpsError('permission-denied', 'Cross-tenant notifications not allowed');
        }

        const effectiveTenantId = payload.tenant_id || tenantId;

        if (!payload.title || !payload.body) {
            throw new HttpsError('invalid-argument', 'Title and body are required.');
        }

        let devicesQuery = db.collection(`tenants/${effectiveTenantId}/driver_devices`)
            .where('status', '==', 'active')
            .where('notifications_enabled', '==', true);

        if (payload.target_type === 'specific_driver') {
            if (!payload.target_driver_id) {
                throw new HttpsError('invalid-argument', 'target_driver_id is required for specific_driver');
            }
            devicesQuery = devicesQuery.where('driver_id', '==', payload.target_driver_id);
        }

        const devicesSnap = await devicesQuery.get();
        const tokens: string[] = [];
        devicesSnap.docs.forEach(doc => {
            const d = doc.data();
            if (d.expo_push_token) tokens.push(d.expo_push_token);
            else if (d.fcm_token) tokens.push(d.fcm_token);
        });
        const uniqueTokens = Array.from(new Set(tokens));

        const result = await sendPushNotification(
            effectiveTenantId, 
            uniqueTokens, 
            payload.title, 
            payload.body,
            { type: 'manual' }
        );

        // Record history
        const logRef = db.collection(`tenants/${effectiveTenantId}/notification_logs`).doc();
        await logRef.set({
            type: 'manual',
            title: payload.title,
            body: payload.body,
            target_type: payload.target_type,
            target_driver_id: payload.target_driver_id || null,
            sent_by_user_id: request.auth?.uid || payload.sender_user_id,
            total_targeted: tokens.length,
            total_success: result.successCount,
            total_failed: result.failureCount,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            status: tokens.length === 0 ? 'no_targets' : 'sent'
        });

        return {
            success: true,
            total_targeted: tokens.length,
            total_success: result.successCount,
            total_failed: result.failureCount
        };
    }
);

/**
 * Triggered when an Order is Assigned
 * Consolidates multiple assignments into a single "Route Updated" notification.
 */
export const onOrderAssignedNotification = onDocumentUpdated(
    { document: 'orders/{orderId}', region: 'us-central1' },
    async (event) => {
        const orderId = event.params.orderId;
        const before = event.data?.before.data() as Order;
        const after = event.data?.after.data() as Order;

        if (!before || !after) return;

        // Condition: wasn't assigned before, but is now
        if (before.status === 'new' && after.status === 'assigned' && after.assigned_driver_id) {
            
            const tenantId = after.tenant_id || 'default';
            const driverId = after.assigned_driver_id;

            // Debounce check: Don't send if we sent one in the last 2 minutes
            const profileRef = db.collection('profiles').doc(driverId);
            const profileSnap = await profileRef.get();
            const now = admin.firestore.Timestamp.now();

            if (profileSnap.exists) {
                const profileData = profileSnap.data();
                const lastNotified = profileData?.last_assigned_notification_at;
                
                if (lastNotified) {
                    const diffSeconds = now.seconds - lastNotified.seconds;
                    if (diffSeconds < 120) {
                        console.log(`Debouncing assignment notification for driver ${driverId}. Last sent ${diffSeconds}s ago.`);
                        return;
                    }
                }
            }

            // Update profile with last notification time BEFORE sending (to handle race conditions better)
            await profileRef.update({
                last_assigned_notification_at: now,
                updated_at: now
            });

            const devicesSnap = await db.collection(`tenants/${tenantId}/driver_devices`)
                .where('driver_id', '==', driverId)
                .where('status', '==', 'active')
                .where('notifications_enabled', '==', true)
                .get();

            const tokens: string[] = [];
            devicesSnap.docs.forEach(doc => {
                const d = doc.data();
                if (d.expo_push_token) tokens.push(d.expo_push_token);
                else if (d.fcm_token) tokens.push(d.fcm_token);
            });
            const uniqueTokens = Array.from(new Set(tokens));

            if (uniqueTokens.length > 0) {
                const title = "New Route Assigned";
                const body = "Your delivery route has been updated. Open the app to see your new tasks!";
                const result = await sendPushNotification(tenantId, uniqueTokens, title, body, {
                    type: 'order_assigned',
                    order_id: orderId, // Still pass first order ID for context, but message is generic
                    tenant_id: tenantId
                });

                const logRef = db.collection(`tenants/${tenantId}/notification_logs`).doc();
                await logRef.set({
                    type: 'order_assigned',
                    title,
                    body,
                    target_type: 'specific_driver',
                    target_driver_id: driverId,
                    sent_by_user_id: 'system',
                    total_targeted: tokens.length,
                    total_success: result.successCount,
                    total_failed: result.failureCount,
                    created_at: admin.firestore.FieldValue.serverTimestamp(),
                    status: 'sent'
                });
            }
        }
    }
);

/**
 * Pickup Reminder Cron
 * Runs every 5 minutes to find orders scheduled within the next hour.
 */
export const pickupReminderCron = onSchedule(
    { schedule: 'every 5 minutes', region: 'us-central1' },
    async (event) => {
        const now = admin.firestore.Timestamp.now();
        
        // Orders generally use time_window_start
        const ordersSnap = await db.collection('orders')
            .where('status', 'in', ['assigned'])
            .where('reminder_sent', '!=', true)
            .get();

        const promises = ordersSnap.docs.map(async (doc) => {
            const order = doc.data() as Order & { reminder_sent?: boolean };
            
            if (order.reminder_sent) return;

            // Only notify if within next 1 hour
            // Check if time_window_start exists and is between now and +60 mins
            if (order.time_window_start) {
                const startTime = order.time_window_start.toMillis();
                const nowTime = now.toMillis();
                const timeDiffMins = (startTime - nowTime) / 60000;

                if (timeDiffMins > 0 && timeDiffMins <= 60) {
                    const tenantId = order.tenant_id || 'default';
                    const driverId = order.assigned_driver_id;

                    if (!driverId) return;

                    const devicesSnap = await db.collection(`tenants/${tenantId}/driver_devices`)
                        .where('driver_id', '==', driverId)
                        .where('status', '==', 'active')
                        .where('notifications_enabled', '==', true)
                        .get();

                    const tokens: string[] = [];
                    devicesSnap.docs.forEach(d => {
                        const data = d.data();
                        if (data.expo_push_token) tokens.push(data.expo_push_token);
                        else if (data.fcm_token) tokens.push(data.fcm_token);
                    });
                    const uniqueTokens = Array.from(new Set(tokens));

                    if (uniqueTokens.length > 0) {
                        const title = "Upcoming Pickup Reminder";
                        const body = "Your scheduled delivery pickup starts in 1 hour. Get ready!";
                        
                        const result = await sendPushNotification(tenantId, uniqueTokens, title, body, {
                            type: 'pickup_reminder',
                            order_id: doc.id,
                            tenant_id: tenantId
                        });

                        const logRef = db.collection(`tenants/${tenantId}/notification_logs`).doc();
                        await logRef.set({
                            type: 'pickup_reminder',
                            title,
                            body,
                            target_type: 'specific_driver',
                            target_driver_id: driverId,
                            sent_by_user_id: 'system_cron',
                            total_targeted: tokens.length,
                            total_success: result.successCount,
                            total_failed: result.failureCount,
                            created_at: admin.firestore.FieldValue.serverTimestamp(),
                            status: 'sent'
                        });
                    }

                    // Mark as sent whether we succeeded or driver had no device
                    await doc.ref.update({
                        reminder_sent: true,
                        updated_at: admin.firestore.FieldValue.serverTimestamp()
                    });
                }
            }
        });

        await Promise.all(promises);
    }
);
