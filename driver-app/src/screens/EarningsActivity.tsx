import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { firebaseDb } from '../lib/firebase';
import { useAuth } from '../lib/auth-context';
import { useTheme } from '../lib/theme-context';
import { Order } from '../types';
import { format, parseISO } from 'date-fns';
import { enUS, tr, es, pt } from 'date-fns/locale';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

type PayAdjustment = {
    id: string;
    type: 'tip' | 'contribution' | 'adjustment' | 'bonus';
    amount: number;
    date: string;
    created_at: any;
    driver_id: string;
};

type ActivityItem =
    | { kind: 'order'; data: Order; sortDate: Date }
    | { kind: 'adjustment'; data: PayAdjustment; sortDate: Date };

type FilterType = 'All' | 'Completed' | 'Tips' | 'Calivery Contribution' | 'Adjustment Pay' | 'Bonus Pay';

export default function EarningsActivityScreen() {
    const route = useRoute<any>();
    const navigation = useNavigation();
    const { t, i18n } = useTranslation();
    const { user } = useAuth();
    const { colors } = useTheme();
    const { startDate, endDate } = route.params || {};

    const locales: Record<string, any> = { en: enUS, tr: tr, es: es, pt: pt };
    const currentLocale = locales[i18n.language] || enUS;

    const [items, setItems] = useState<ActivityItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<FilterType>('All');
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    const dateRangeLabel = useMemo(() => {
        if (!startDate || !endDate) return '';
        const start = parseISO(startDate);
        const end = parseISO(endDate);
        return `${format(start, 'MMM d', { locale: currentLocale })} - ${format(end, 'MMM d', { locale: currentLocale })}`;
    }, [startDate, endDate, currentLocale]);

    const fetchActivity = async () => {
        if (!user || !startDate || !endDate) return;
        setLoading(true);
        try {
            const ordersQ = query(
                collection(firebaseDb, 'orders'),
                where('assigned_driver_id', '==', user.uid),
                where('status', '==', 'delivered'),
                orderBy('updated_at', 'desc')
            );
            const ordersSnap = await getDocs(ordersQ);

            const adjQ = query(
                collection(firebaseDb, 'pay_adjustments'),
                where('driver_id', '==', user.uid),
            );
            const adjSnap = await getDocs(adjQ);

            const fetchedItems: ActivityItem[] = [];

            ordersSnap.forEach(doc => {
                const data = doc.data() as any;
                if (data.scheduled_date >= startDate && data.scheduled_date <= endDate) {
                    const sortDate = data.updated_at?.toDate ? data.updated_at.toDate() : new Date();
                    fetchedItems.push({ kind: 'order', data: { ...data, id: doc.id } as Order, sortDate });
                }
            });

            adjSnap.forEach(doc => {
                const data = doc.data() as any;
                if (data.date >= startDate && data.date <= endDate) {
                    const sortDate = data.created_at?.toDate ? data.created_at.toDate() : new Date();
                    fetchedItems.push({ kind: 'adjustment', data: { ...data, id: doc.id } as PayAdjustment, sortDate });
                }
            });

            fetchedItems.sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime());
            setItems(fetchedItems);

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchActivity(); }, [user, startDate, endDate]);

    const filterKeyMap: Record<FilterType, string> = {
        'All': 'filter_all',
        'Completed': 'filter_completed',
        'Tips': 'filter_tips',
        'Calivery Contribution': 'filter_contribution',
        'Adjustment Pay': 'filter_adjustment',
        'Bonus Pay': 'filter_bonus',
    };

    const filteredItems = useMemo(() => {
        if (filter === 'All') return items;
        return items.filter(item => {
            if (filter === 'Completed') return item.kind === 'order';
            if (item.kind === 'adjustment') {
                const type = item.data.type;
                if (filter === 'Tips' && type === 'tip') return true;
                if (filter === 'Calivery Contribution' && type === 'contribution') return true;
                if (filter === 'Adjustment Pay' && type === 'adjustment') return true;
                if (filter === 'Bonus Pay' && type === 'bonus') return true;
            }
            return false;
        });
    }, [items, filter]);

    const getTypeLabel = (item: ActivityItem) => {
        if (item.kind === 'order') return t('earnings_activity.filter_completed');
        switch (item.data.type) {
            case 'tip': return t('earnings_activity.filter_tips');
            case 'contribution': return t('earnings_activity.filter_contribution');
            case 'adjustment': return t('earnings_activity.filter_adjustment');
            case 'bonus': return t('earnings_activity.filter_bonus');
            default: return 'Adjustment';
        }
    };

    const renderItem = ({ item }: { item: ActivityItem }) => {
        const isOrder = item.kind === 'order';
        const label = getTypeLabel(item);
        const amount = isOrder ? item.data.payout_amount : item.data.amount;

        return (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.divider }]}>
                <View style={styles.row}>
                    <View style={styles.leftCol}>
                        <Text style={[styles.typeLabel, { color: colors.textPrimary }]}>{label}</Text>
                        <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>
                            {format(item.sortDate, 'MMM d', { locale: currentLocale })} • {format(item.sortDate, 'h:mm a', { locale: currentLocale })}
                        </Text>
                        <Text style={[styles.sourceLabel, { color: colors.textSecondary }]}>
                            {isOrder ? item.data.restaurant_name : t('earnings_activity.source_system')}
                        </Text>
                    </View>
                    <View style={styles.rightCol}>
                        <Text style={[styles.amount, { color: colors.success }]}>${amount.toFixed(2)}</Text>
                        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                    </View>
                </View>
            </View>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.headerContainer, { borderBottomColor: colors.divider }]}>
                <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{t('earnings_activity.title')}</Text>
                <Text style={[styles.headerDate, { color: colors.textSecondary }]}>{dateRangeLabel}</Text>

                <TouchableOpacity
                    style={[styles.filterButton, { backgroundColor: colors.primary + '20' }]}
                    onPress={() => setIsFilterOpen(true)}
                >
                    <Text style={[styles.filterButtonText, { color: colors.primary }]}>{t(`earnings_activity.${filterKeyMap[filter]}`)}</Text>
                    <Ionicons name="chevron-down" size={14} color={colors.primary} />
                </TouchableOpacity>
            </View>

            <FlatList
                data={filteredItems}
                keyExtractor={(item, index) => index.toString()}
                renderItem={renderItem}
                contentContainerStyle={items.length === 0 ? styles.emptyList : styles.listContent}
                ListEmptyComponent={
                    !loading ? (
                        <View style={styles.emptyState}>
                            <View style={[styles.emptyIconBg, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
                                <Ionicons name="documents-outline" size={48} color={colors.textSecondary} />
                            </View>
                            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t('earnings_activity.no_activity')}</Text>
                            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                                {t('earnings_activity.no_activity_desc')}
                            </Text>
                        </View>
                    ) : null
                }
            />

            <Modal visible={isFilterOpen} transparent animationType="fade">
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setIsFilterOpen(false)}>
                    <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
                        <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{t('earnings_activity.filter_title')}</Text>
                        {(['All', 'Completed', 'Tips', 'Calivery Contribution', 'Adjustment Pay', 'Bonus Pay'] as FilterType[]).map((f) => (
                            <TouchableOpacity
                                key={f}
                                style={[styles.filterOption, { borderBottomColor: colors.divider }]}
                                onPress={() => { setFilter(f); setIsFilterOpen(false); }}
                            >
                                <Text style={[styles.filterOptionText, { color: filter === f ? colors.primary : colors.textSecondary }]}>
                                    {t(`earnings_activity.${filterKeyMap[f]}`)}
                                </Text>
                                {filter === f && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                            </TouchableOpacity>
                        ))}
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    headerContainer: { padding: 20, borderBottomWidth: 1 },
    headerTitle: { fontSize: 24, fontWeight: '700', marginBottom: 4 },
    headerDate: { fontSize: 16, marginBottom: 16 },

    filterButton: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 6
    },
    filterButtonText: { fontSize: 13, fontWeight: '600' },

    listContent: { padding: 16 },
    emptyList: { flex: 1, justifyContent: 'center', padding: 16 },

    card: {
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
    },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    leftCol: { flex: 1 },
    rightCol: { flexDirection: 'row', alignItems: 'center', gap: 8 },

    typeLabel: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
    dateLabel: { fontSize: 12, marginBottom: 4 },
    sourceLabel: { fontSize: 13 },

    amount: { fontSize: 16, fontWeight: '700' },

    emptyState: { alignItems: 'center', marginTop: 40 },
    emptyIconBg: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 1 },
    emptyTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
    emptySub: { fontSize: 14, textAlign: 'center', maxWidth: 260, lineHeight: 20 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
    filterOption: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1 },
    filterOptionText: { fontSize: 16 },
});
