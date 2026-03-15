import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Dimensions } from 'react-native';
import { collection, query, where, getDocs, orderBy, onSnapshot } from 'firebase/firestore';
import { firebaseDb } from '../lib/firebase';
import { useAuth } from '../lib/auth-context';
import { useTheme } from '../lib/theme-context';
import { Order, PayAdjustment, AdjustmentType } from '../types';
import { useTranslation } from 'react-i18next';
import { format, startOfWeek, endOfWeek, addDays, eachDayOfInterval } from 'date-fns';
import { enUS, tr, es, pt } from 'date-fns/locale';
import { LineChart } from 'react-native-chart-kit';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

const screenWidth = Dimensions.get('window').width;

export default function EarningsScreen() {
    const { t, i18n } = useTranslation();
    const { user } = useAuth();
    const { colors, theme } = useTheme();
    const navigation = useNavigation<any>();
    const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
    const [loading, setLoading] = useState(true);

    // Locale configuration
    const locales: Record<string, any> = { en: enUS, tr: tr, es: es, pt: pt };
    const currentLocale = locales[i18n.language] || enUS;

    // Day Data
    const [todayOrders, setTodayOrders] = useState<Order[]>([]);
    const [todayAdjustments, setTodayAdjustments] = useState<PayAdjustment[]>([]);

    // Week Data
    const [weekOrders, setWeekOrders] = useState<Order[]>([]);
    const [weekAdjustments, setWeekAdjustments] = useState<PayAdjustment[]>([]);
    const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));

    // Dynamic Chart Config
    const CHART_CONFIG = {
        backgroundColor: colors.background,
        backgroundGradientFrom: colors.surface,
        backgroundGradientTo: colors.background,
        decimalPlaces: 0,
        color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
        labelColor: (opacity = 1) => theme.dark ? `rgba(179, 179, 179, ${opacity})` : `rgba(95, 99, 104, ${opacity})`,
        style: { borderRadius: 16 },
        propsForDots: { r: '4', strokeWidth: '2', stroke: colors.success }
    };

    // Listeners for Day View
    useEffect(() => {
        if (!user || viewMode !== 'day') return;
        setLoading(true);
        const todayStr = format(new Date(), 'yyyy-MM-dd');

        const qOrders = query(
            collection(firebaseDb, 'orders'),
            where('assigned_driver_id', '==', user.uid),
            where('status', '==', 'delivered'),
            where('scheduled_date', '==', todayStr)
        );

        const unsubOrders = onSnapshot(qOrders, (snap) => {
            const orders: Order[] = [];
            snap.forEach(doc => orders.push({ id: doc.id, ...doc.data() } as Order));
            setTodayOrders(orders);
            setLoading(false);
        });

        const qAdj = query(
            collection(firebaseDb, 'pay_adjustments'),
            where('driver_id', '==', user.uid),
            where('date', '==', todayStr)
        );

        const unsubAdj = onSnapshot(qAdj, (snap) => {
            const adjs: PayAdjustment[] = [];
            snap.forEach(doc => adjs.push({ id: doc.id, ...doc.data() } as PayAdjustment));
            setTodayAdjustments(adjs);
        });

        return () => { unsubOrders(); unsubAdj(); };
    }, [user, viewMode]);

    // Fetch for Week View
    useEffect(() => {
        if (!user || viewMode !== 'week') return;
        fetchWeekData();
    }, [user, viewMode, currentWeekStart]);

    const fetchWeekData = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
            const startStr = format(currentWeekStart, 'yyyy-MM-dd');
            const endStr = format(weekEnd, 'yyyy-MM-dd');

            const qOrders = query(
                collection(firebaseDb, 'orders'),
                where('assigned_driver_id', '==', user.uid),
                where('status', '==', 'delivered'),
                where('scheduled_date', '>=', startStr),
                where('scheduled_date', '<=', endStr)
            );

            const ordersSnap = await getDocs(qOrders);
            const orders: Order[] = [];
            ordersSnap.forEach(doc => orders.push({ id: doc.id, ...doc.data() } as Order));
            setWeekOrders(orders);

            const qAdj = query(
                collection(firebaseDb, 'pay_adjustments'),
                where('driver_id', '==', user.uid),
                where('date', '>=', startStr),
                where('date', '<=', endStr)
            );

            const adjSnap = await getDocs(qAdj);
            const adjs: PayAdjustment[] = [];
            adjSnap.forEach(doc => adjs.push({ id: doc.id, ...doc.data() } as PayAdjustment));
            setWeekAdjustments(adjs);

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    // Calculations
    const calculateTotal = (orders: Order[], adjs: PayAdjustment[], type?: AdjustmentType | 'delivery') => {
        if (type === 'delivery') {
            return orders.reduce((sum, o) => sum + o.payout_amount, 0);
        }
        if (type) {
            return adjs.filter(a => a.type === type).reduce((sum, a) => sum + a.amount, 0);
        }
        return orders.reduce((sum, o) => sum + o.payout_amount, 0) +
            adjs.reduce((sum, a) => sum + a.amount, 0);
    };

    const BreakdownRow = ({ label, amount }: { label: string, amount: number }) => (
        <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{label}</Text>
            <Text style={[styles.rowAmount, { color: colors.textPrimary }]}>${amount.toFixed(2)}</Text>
        </View>
    );

    const getDayView = () => {
        const total = calculateTotal(todayOrders, todayAdjustments);

        return (
            <ScrollView contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={loading} tintColor={colors.primary} />}>
                <Text style={[styles.dateLabel, { color: colors.textPrimary }]}>{format(new Date(), 'EEEE, MMM d', { locale: currentLocale })}</Text>

                {todayOrders.length === 0 && todayAdjustments.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <View style={[styles.emptyIconBg, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
                            <Ionicons name="cash-outline" size={64} color={colors.textSecondary} />
                        </View>
                        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('earnings.no_pay_today')}</Text>
                    </View>
                ) : (
                    <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.divider }]}>
                        <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>{t('earnings.todays_earnings')}</Text>
                        <Text style={[styles.bigTotal, { color: colors.success }]}>${total.toFixed(2)}</Text>

                        <View style={[styles.breakdown, { borderTopColor: colors.divider }]}>
                            <BreakdownRow label={t('earnings.delivery_pay')} amount={calculateTotal(todayOrders, [], 'delivery')} />
                            <BreakdownRow label={t('earnings.tips')} amount={calculateTotal([], todayAdjustments, 'tip')} />
                            <BreakdownRow label={t('earnings.calivery_contribution')} amount={calculateTotal([], todayAdjustments, 'contribution')} />
                            <BreakdownRow label={t('earnings.adjustment_pay')} amount={calculateTotal([], todayAdjustments, 'adjustment')} />
                            <BreakdownRow label={t('earnings.bonus_pay')} amount={calculateTotal([], todayAdjustments, 'bonus')} />
                        </View>
                    </View>
                )}
            </ScrollView>
        );
    };

    const getWeekView = () => {
        const total = calculateTotal(weekOrders, weekAdjustments);
        const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });

        const days = eachDayOfInterval({ start: currentWeekStart, end: weekEnd });
        const chartLabels = days.map(d => format(d, 'EEE', { locale: currentLocale }));
        const chartData = days.map(d => {
            const dateStr = format(d, 'yyyy-MM-dd');
            const dayOrders = weekOrders.filter(o => o.scheduled_date === dateStr);
            const dayAdjs = weekAdjustments.filter(a => a.date === dateStr);
            return calculateTotal(dayOrders, dayAdjs);
        });

        return (
            <ScrollView contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchWeekData} tintColor={colors.primary} />}>
                <Text style={[styles.dateLabel, { color: colors.textPrimary }]}>
                    {format(currentWeekStart, 'MMM d', { locale: currentLocale })} - {format(weekEnd, 'MMM d, yyyy', { locale: currentLocale })}
                </Text>

                <View style={styles.chartContainer}>
                    <LineChart
                        data={{
                            labels: chartLabels,
                            datasets: [{ data: chartData.length > 0 ? chartData : [0] }]
                        }}
                        width={screenWidth - 32}
                        height={220}
                        chartConfig={CHART_CONFIG}
                        bezier
                        style={styles.chart}
                    />
                </View>

                <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.divider, marginTop: 16 }]}>
                    <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>{t('earnings.weekly_earnings')}</Text>
                    <Text style={[styles.bigTotal, { color: colors.success }]}>${total.toFixed(2)}</Text>

                    <View style={[styles.breakdown, { borderTopColor: colors.divider }]}>
                        <BreakdownRow label={t('earnings.delivery_pay')} amount={calculateTotal(weekOrders, [], 'delivery')} />
                        <BreakdownRow label={t('earnings.tips')} amount={calculateTotal([], weekAdjustments, 'tip')} />
                        <BreakdownRow label={t('earnings.calivery_contribution')} amount={calculateTotal([], weekAdjustments, 'contribution')} />
                        <BreakdownRow label={t('earnings.adjustment_pay')} amount={calculateTotal([], weekAdjustments, 'adjustment')} />
                        <BreakdownRow label={t('earnings.bonus_pay')} amount={calculateTotal([], weekAdjustments, 'bonus')} />
                    </View>
                </View>

                <TouchableOpacity
                    style={[styles.activityButton, { backgroundColor: colors.surface, borderColor: colors.divider }]}
                    onPress={() => navigation.navigate('EarningsActivity', {
                        startDate: format(currentWeekStart, 'yyyy-MM-dd'),
                        endDate: format(weekEnd, 'yyyy-MM-dd')
                    })}
                >
                    <Text style={[styles.activityButtonText, { color: colors.primary }]}>{t('earnings.view_activity')}</Text>
                </TouchableOpacity>
            </ScrollView>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Tab Menu */}
            <View style={styles.tabMenuContainer}>
                <View style={[styles.tabMenu, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
                    <TouchableOpacity
                        style={[styles.tab, viewMode === 'day' && { backgroundColor: colors.primary }]}
                        onPress={() => setViewMode('day')}
                    >
                        <Text style={[styles.tabText, { color: viewMode === 'day' ? '#fff' : colors.textSecondary }]}>
                            {t('earnings.day')}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tab, viewMode === 'week' && { backgroundColor: colors.primary }]}
                        onPress={() => setViewMode('week')}
                    >
                        <Text style={[styles.tabText, { color: viewMode === 'week' ? '#fff' : colors.textSecondary }]}>
                            {t('earnings.week')}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {viewMode === 'day' ? getDayView() : getWeekView()}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    tabMenuContainer: { alignItems: 'center', paddingVertical: 16 },
    tabMenu: {
        flexDirection: 'row',
        borderRadius: 12,
        borderWidth: 1,
        padding: 4,
    },
    tab: {
        paddingVertical: 10,
        paddingHorizontal: 24,
        borderRadius: 8,
    },
    tabText: { fontSize: 14, fontWeight: '600' },
    scrollContent: { padding: 16 },
    dateLabel: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 },

    emptyContainer: { padding: 40, alignItems: 'center' },
    emptyText: { fontSize: 16, fontStyle: 'italic' },
    emptyIconBg: {
        width: 120,
        height: 120,
        borderRadius: 60,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 1,
    },

    summaryCard: { borderRadius: 20, padding: 20, borderWidth: 1 },
    totalLabel: { fontSize: 14, textTransform: 'uppercase', marginBottom: 4 },
    bigTotal: { fontSize: 36, fontWeight: 'bold', marginBottom: 20 },
    breakdown: { gap: 12, borderTopWidth: 1, paddingTop: 16 },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    rowLabel: {},
    rowAmount: { fontWeight: '600' },
    chartContainer: { alignItems: 'center', marginBottom: 16 },
    chart: { borderRadius: 16, marginVertical: 8 },

    activityButton: { marginTop: 24, padding: 16, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
    activityButtonText: { fontSize: 15, fontWeight: '600' },
});
