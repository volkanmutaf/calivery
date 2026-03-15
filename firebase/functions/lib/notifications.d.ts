import { SendManualNotificationRequest } from './types';
/**
 * sendManualNotification
 * Called from Admin Panel to send ad-hoc notifications.
 */
export declare const sendManualNotification: import("firebase-functions/v2/https").CallableFunction<SendManualNotificationRequest, any>;
/**
 * Triggered when an Order is Assigned
 * Consolidates multiple assignments into a single "Route Updated" notification.
 */
export declare const onOrderAssignedNotification: import("firebase-functions/v2/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").Change<import("firebase-functions/v2/firestore").QueryDocumentSnapshot> | undefined, {
    orderId: string;
}>>;
/**
 * Pickup Reminder Cron
 * Runs every 5 minutes to find orders scheduled within the next hour.
 */
export declare const pickupReminderCron: import("firebase-functions/v2/scheduler").ScheduleFunction;
//# sourceMappingURL=notifications.d.ts.map