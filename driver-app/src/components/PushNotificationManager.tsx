import React from 'react';
import { usePushNotifications } from '../lib/usePushNotifications';

export function PushNotificationManager() {
    usePushNotifications();
    return null;
}
