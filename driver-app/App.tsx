import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text } from 'react-native';
import { AuthProvider } from './src/lib/auth-context';
import AppNavigator from './src/navigation/AppNavigator';
import { PushNotificationManager } from './src/components/PushNotificationManager';
import { initI18n } from './src/i18n';

export default function App() {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    initI18n().then(() => setIsInitialized(true));
  }, []);

  if (!isInitialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
        <Text style={{ color: '#fff' }}>Initializing...</Text>
      </View>
    );
  }

  return (
    <AuthProvider>
      <StatusBar style="light" />
      <PushNotificationManager />
      <AppNavigator />
    </AuthProvider>
  );
}
