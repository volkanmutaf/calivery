import React from 'react';
import { NavigationContainer, useNavigation, DrawerActions, DefaultTheme } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth-context';
import { TenantProvider, useTenant } from '../lib/tenant-context';
import { ThemeProvider, useTheme } from '../lib/theme-context';
import { navigationRef } from './navigationRef';
import LoginScreen from '../screens/LoginScreen';
import TasksScreen from '../screens/TasksScreen';
import TaskDetailScreen from '../screens/TaskDetailScreen';
import HistoryScreen from '../screens/HistoryScreen';
import EarningsScreen from '../screens/EarningsScreen';
import EarningsActivityScreen from '../screens/EarningsActivity';
import AccountScreen from '../screens/AccountScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { useTranslation } from 'react-i18next';

const Drawer = createDrawerNavigator();
const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// --- Theme Aware Header Button ---
const DrawerButton = () => {
    const navigation = useNavigation();
    const { colors } = useTheme();
    return (
        <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.dispatch(DrawerActions.toggleDrawer())}
        >
            <Ionicons name="menu" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
    );
};

// --- Theme Aware Tab Icon ---
const TabIcon = ({ label, focused }: { label: string; focused: boolean }) => {
    const { t } = useTranslation();
    const { colors } = useTheme();

    const iconNames: Record<string, keyof typeof Ionicons.glyphMap> = {
        Tasks: focused ? 'clipboard' : 'clipboard-outline',
        History: focused ? 'time' : 'time-outline',
        Earnings: focused ? 'wallet' : 'wallet-outline',
        Account: focused ? 'person' : 'person-outline'
    };

    // Using explicit color logic for active/inactive state
    // Per request: Active should be vibrant (referencing existing orange/gold or primary)
    // In dark mode: existing is #f59e0b (Orange), inactive #64748b (Slate)
    // In light mode: maybe Primary or Secondary from new palette?
    // Let's stick to the user's Primary/Secondary or maintain the App's branding color if preferred.
    // The user provided Primary #6200EE (Purple) for light. 
    // However, existing app uses Orange (#f59e0b). 
    // I will try to respect the new palette but keep indicators clear.

    const activeColor = colors.primary; // Dynamically uses #6200EE (Light) or #BB86FC (Dark)
    const inactiveColor = colors.textSecondary;

    return (
        <View style={styles.tabIconContainer}>
            <Ionicons
                name={iconNames[label] || 'clipboard-outline'}
                size={24}
                color={focused ? activeColor : inactiveColor}
            />
            <Text style={[
                styles.tabLabelText,
                { color: focused ? activeColor : inactiveColor }
            ]} numberOfLines={1}>
                {t(`navigation.${label.toLowerCase()}`)}
            </Text>
        </View>
    );
};

function TasksTabNavigator() {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const { isFeatureEnabled } = useTenant();

    const commonOptions = {
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: '600' as const, fontSize: 17 },
        headerTitleAlign: 'center' as const,
        headerShadowVisible: false,
        headerLeft: () => <DrawerButton />,
    };

    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                tabBarIcon: ({ focused }) => <TabIcon label={route.name} focused={focused} />,
                tabBarShowLabel: false,
                tabBarStyle: [styles.tabBar, { backgroundColor: colors.surface, borderTopColor: colors.divider }],
                tabBarItemStyle: styles.tabBarItem,
                ...commonOptions
            })}
        >
            <Tab.Screen name="Tasks" component={TasksScreen} options={{ title: t('tasks.title') }} />
            <Tab.Screen name="History" component={HistoryScreen} options={{ title: t('navigation.history') }} />
            {isFeatureEnabled('payouts') && (
                <Tab.Screen name="Earnings" component={EarningsScreen} options={{ title: t('navigation.earnings') }} />
            )}
            <Tab.Screen name="Account" component={AccountScreen} options={{ title: t('navigation.account') }} />
        </Tab.Navigator>
    );
}

function TaskStackNavigator() {
    const { t } = useTranslation();
    const { colors } = useTheme();

    const commonScreenOptions: NativeStackNavigationOptions = {
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        headerTitleAlign: 'center',
        headerBackTitle: '',
        headerShadowVisible: false,
    };

    return (
        <Stack.Navigator screenOptions={commonScreenOptions}>
            <Stack.Screen name="TasksTabs" component={TasksTabNavigator} options={{ headerShown: false }} />
            <Stack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ title: t('task_detail.title') }} />
            <Stack.Screen name="EarningsActivity" component={EarningsActivityScreen} options={{ title: 'Earnings Activity' }} />
        </Stack.Navigator>
    );
}

function CustomDrawerContent({ state, navigation }: any) {
    const { profile, logout } = useAuth();
    const { t } = useTranslation();
    const { colors } = useTheme();

    return (
        <View style={[styles.drawerContent, { backgroundColor: colors.background }]}>
            <View style={[styles.drawerHeader, { borderBottomColor: colors.divider }]}>
                <View style={[styles.avatar, { backgroundColor: profile?.photo_url ? 'transparent' : colors.primary, overflow: 'hidden' }]}>
                    {profile?.photo_url ? (
                        <Image
                            source={{ uri: profile.photo_url }}
                            style={{ width: '100%', height: '100%' }}
                        />
                    ) : (
                        <Text style={[styles.avatarText, { color: colors.surface }]}>
                            {profile?.username?.charAt(0).toUpperCase() || 'D'}
                        </Text>
                    )}
                </View>
                <Text style={[styles.drawerName, { color: colors.textPrimary }]}>{profile?.username || 'Driver'}</Text>
                <Text style={[styles.drawerEmail, { color: colors.textSecondary }]}>{profile?.email || ''}</Text>
            </View>

            <View style={styles.drawerItems}>
                {state.routes.map((route: any, index: number) => {
                    const focused = state.index === index;
                    const icons: Record<string, string> = { Tasks: 'clipboard-outline', Settings: 'settings-outline' };
                    const iconName = icons[route.name] || 'list-outline';

                    const activeBg = colors.primary + '20'; // 12% opacity roughly if hex, need simple workaround or utility
                    // Simple hack for hex+opacity if strict hex provided: just using opacity on View if possible, or rgba.
                    // For now, simpler active state styling:

                    return (
                        <TouchableOpacity
                            key={route.key}
                            style={[
                                styles.drawerItem,
                                focused && { backgroundColor: activeBg } // Might fail if hex not 6 chars. assuming well formed.
                            ]}
                            onPress={() => navigation.navigate(route.name)}
                        >
                            <Ionicons
                                name={iconName as any}
                                size={22}
                                color={focused ? colors.primary : colors.textSecondary}
                                style={{ marginRight: 12 }}
                            />
                            <Text style={[
                                styles.drawerItemText,
                                { color: focused ? colors.primary : colors.textSecondary, fontWeight: focused ? '600' : '500' }
                            ]}>
                                {t(`navigation.${route.name.toLowerCase()}`)}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            <TouchableOpacity
                style={[styles.logoutButton, { backgroundColor: colors.error + '15', borderColor: colors.error + '30' }]}
                onPress={logout}
            >
                <Ionicons name="log-out-outline" size={22} color={colors.error} style={{ marginRight: 12 }} />
                <Text style={[styles.logoutText, { color: colors.error }]}>{t('common.sign_out')}</Text>
            </TouchableOpacity>
        </View>
    );
}

function MainDrawerNavigator() {
    const { t } = useTranslation();
    const { colors } = useTheme();

    return (
        <Drawer.Navigator
            drawerContent={(props) => <CustomDrawerContent {...props} />}
            screenOptions={{
                drawerStyle: { backgroundColor: colors.background, width: 280 },
                headerShown: false,
                drawerType: 'front',
            }}
        >
            <Drawer.Screen name="Tasks" component={TaskStackNavigator} />
            <Drawer.Screen
                name="Settings"
                component={SettingsScreen}
                options={{
                    headerShown: true,
                    headerStyle: { backgroundColor: colors.surface },
                    headerTintColor: colors.textPrimary,
                    headerTitleAlign: 'center',
                    headerShadowVisible: false,
                    headerLeft: () => <DrawerButton />,
                    title: t('navigation.settings')
                }}
            />
        </Drawer.Navigator>
    );
}

function AppContent() {
    const { user, loading } = useAuth();
    const { theme } = useTheme();

    if (loading) {
        return (
            <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
                <Text style={{ color: theme.colors.textPrimary }}>Loading...</Text>
            </View>
        );
    }

    // Adapt React Navigation Theme
    const NavTheme = {
        ...DefaultTheme,
        dark: theme.dark,
        colors: {
            ...DefaultTheme.colors,
            primary: theme.colors.primary,
            background: theme.colors.background,
            card: theme.colors.surface,
            text: theme.colors.textPrimary,
            border: theme.colors.divider,
            notification: theme.colors.error,
        },
    };

    return (
        <NavigationContainer theme={NavTheme} ref={navigationRef}>
            {user ? <MainDrawerNavigator /> : <LoginScreen />}
        </NavigationContainer>
    );
}

export default function AppNavigator() {
    return (
        <ThemeProvider>
            <TenantProvider>
                <AppContent />
            </TenantProvider>
        </ThemeProvider>
    );
}

const styles = StyleSheet.create({
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    headerButton: { marginLeft: 16, padding: 4 },
    tabBar: {
        borderTopWidth: 1,
        height: 70,
        paddingBottom: 4,
        paddingTop: 10,
        elevation: 0,
    },
    tabBarItem: { paddingHorizontal: 0, flex: 1 },
    tabIconContainer: { alignItems: 'center', justifyContent: 'center', flex: 1, minWidth: 50 },
    tabLabelText: { fontSize: 10, marginTop: 4, textAlign: 'center' },

    drawerContent: { flex: 1, paddingTop: 60 },
    drawerHeader: { padding: 24, borderBottomWidth: 1, alignItems: 'center' },
    avatar: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', marginBottom: 12, elevation: 4 },
    avatarText: { fontSize: 32, fontWeight: '700' },
    drawerName: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
    drawerEmail: { fontSize: 13 },

    drawerItems: { flex: 1, paddingTop: 24 },
    drawerItem: { flexDirection: 'row', alignItems: 'center', padding: 16, marginHorizontal: 16, marginBottom: 4, borderRadius: 12 },
    drawerItemText: { fontSize: 15 },

    logoutButton: { flexDirection: 'row', alignItems: 'center', padding: 16, marginHorizontal: 16, marginBottom: 40, borderRadius: 12, borderWidth: 1 },
    logoutText: { fontSize: 15, fontWeight: '600' },
});
