import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { firebaseDb } from '../lib/firebase';
import { useAuth } from '../lib/auth-context';
import { useTheme } from '../lib/theme-context';
import { Order } from '../types';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

export default function HistoryScreen() {
    const navigation = useNavigation<any>();
    const { t } = useTranslation();
    const { user } = useAuth();
    const { colors } = useTheme();
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchHistory = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const ordersSnap = await getDocs(
                query(
                    collection(firebaseDb, 'orders'),
                    where('assigned_driver_id', '==', user.uid),
                    where('status', '==', 'delivered'),
                    orderBy('updated_at', 'desc'),
                    limit(50)
                )
            );
            const ordersData: Order[] = [];
            ordersSnap.forEach((doc) => {
                ordersData.push({ id: doc.id, ...doc.data() } as Order);
            });
            setOrders(ordersData);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchHistory(); }, [user]);

    const formatTime = (timestamp: any) => {
        if (!timestamp) return '--:--';
        try {
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            return format(date, 'h:mm a');
        } catch {
            return '--:--';
        }
    };

    const renderOrder = ({ item }: { item: any }) => (
        <View
            style={[styles.orderCard, { backgroundColor: colors.card, borderColor: colors.divider }]}
        >
            <View style={styles.cardHeader}>
                <View style={styles.restaurantRow}>
                    <Ionicons name="fast-food" size={20} color={colors.info} style={{ marginRight: 8 }} />
                    <Text style={[styles.restaurantName, { color: colors.textPrimary }]}>{item.restaurant_name}</Text>
                </View>
                <Text style={[styles.payout, { color: colors.success }]}>${item.payout_amount.toFixed(2)}</Text>
            </View>

            <View style={styles.cardMiddle}>
                <Text style={[styles.orderCode, { color: colors.textSecondary }]}>{item.order_code}</Text>
                <Text style={[styles.date, { color: colors.textSecondary }]}>{item.scheduled_date}</Text>
            </View>

            {/* Pickup / Dropoff Times */}
            <View style={[styles.timesRow, { borderTopColor: colors.divider }]}>
                <View style={styles.timeItem}>
                    <Ionicons name="cube-outline" size={16} color={colors.primary} />
                    <Text style={[styles.timeLabel, { color: colors.textSecondary }]}>{t('history.pickup_time')}</Text>
                    <Text style={[styles.timeValue, { color: colors.textPrimary }]}>{item.pickup_time ? formatTime(item.pickup_time) : formatTime(item.created_at)}</Text>
                </View>
                <View style={styles.timeSeparator}>
                    <Ionicons name="arrow-forward" size={14} color={colors.textSecondary} />
                </View>
                <View style={styles.timeItem}>
                    <Ionicons name="location-outline" size={16} color={colors.success} />
                    <Text style={[styles.timeLabel, { color: colors.textSecondary }]}>{t('history.dropoff_time')}</Text>
                    <Text style={[styles.timeValue, { color: colors.textPrimary }]}>{formatTime(item.updated_at)}</Text>
                </View>
            </View>
        </View>
    );

    const EmptyState = () => (
        <View style={styles.emptyContainer}>
            <View style={[styles.emptyIconBg, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
                <Ionicons name="time-outline" size={64} color={colors.textSecondary} />
            </View>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('history.no_history')}</Text>
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <FlatList
                data={orders}
                keyExtractor={(item) => item.id}
                renderItem={renderOrder}
                refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchHistory} tintColor={colors.primary} />}
                contentContainerStyle={orders.length === 0 ? styles.listContentEmpty : styles.listContent}
                ListEmptyComponent={!loading ? <EmptyState /> : null}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    listContent: { padding: 16 },
    listContentEmpty: { flex: 1, padding: 16 },

    orderCard: {
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    restaurantRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    restaurantName: { fontSize: 16, fontWeight: '600' },
    payout: { fontWeight: '700', fontSize: 16 },

    cardMiddle: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    orderCode: { fontSize: 13 },
    date: { fontSize: 12 },

    timesRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1
    },
    timeItem: { alignItems: 'center', flex: 1 },
    timeLabel: { fontSize: 11, marginTop: 4 },
    timeValue: { fontSize: 13, fontWeight: '600', marginTop: 2 },
    timeSeparator: { paddingHorizontal: 8 },

    emptyContainer: { alignItems: 'center', paddingTop: 80 },
    emptyIconBg: {
        width: 120,
        height: 120,
        borderRadius: 60,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 1,
    },
    emptyText: { fontSize: 16, fontWeight: '500' },
});
