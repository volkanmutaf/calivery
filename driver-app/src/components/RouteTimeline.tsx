import React from 'react';
import { View, FlatList, StyleSheet, Text } from 'react-native';
import TaskCard from './TaskCard';
import { RouteStep, Order } from '../types';
import { useTheme } from '../lib/theme-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

export interface RouteItem {
    step: RouteStep;
    order: Order;
    isNext: boolean;
}

interface RouteTimelineProps {
    routeItems: RouteItem[];
    onTaskPress: (item: RouteItem) => void;
    refreshing?: boolean;
    onRefresh?: () => void;
    ListHeaderComponent?: React.ReactElement;
}

const RouteTimeline: React.FC<RouteTimelineProps> = ({
    routeItems,
    onTaskPress,
    refreshing = false,
    onRefresh,
    ListHeaderComponent
}) => {
    const { colors } = useTheme();
    const { t } = useTranslation();

    const renderItem = ({ item, index }: { item: RouteItem; index: number }) => {
        return (
            <TaskCard
                step={item.step}
                order={item.order}
                isNext={item.isNext}
                isLast={index === routeItems.length - 1}
                onPress={() => onTaskPress(item)}
                index={index}
            />
        );
    };

    const renderEmpty = () => (
        <View style={styles.emptyContainer}>
            <View style={[styles.emptyIconBg, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
                <Ionicons name="map-outline" size={64} color={colors.textSecondary} />
            </View>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {t('tasks.no_tasks') || "No tasks for today"}
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                You're all caught up!
            </Text>
        </View>
    );

    return (
        <FlatList
            data={routeItems}
            keyExtractor={(item) => item.step.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            refreshing={refreshing}
            onRefresh={onRefresh}
            ListHeaderComponent={ListHeaderComponent}
            ListEmptyComponent={renderEmpty}
            showsVerticalScrollIndicator={false}
            initialNumToRender={10}
            maxToRenderPerBatch={5}
            windowSize={5}
        />
    );
};

const styles = StyleSheet.create({
    listContent: {
        paddingBottom: 40,
    },
    emptyContainer: {
        alignItems: 'center',
        paddingTop: 60,
        paddingHorizontal: 20,
    },
    emptyIconBg: {
        width: 120,
        height: 120,
        borderRadius: 60,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 1,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
        textAlign: 'center',
    },
});

export default RouteTimeline;
