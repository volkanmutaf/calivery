import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
    useAnimatedStyle,
    withSpring,
    withTiming,
    useSharedValue,
    withRepeat,
    withSequence,
    FadeInDown
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../lib/theme-context';
import { RouteStep, Order } from '../types';
import { useTranslation } from 'react-i18next';

import { BlurView } from 'expo-blur';

interface TaskCardProps {
    step: RouteStep;
    order: Order;
    isNext: boolean; // "Active" task
    isLast: boolean;
    onPress: () => void;
    index: number;
}

const SCREEN_WIDTH = Dimensions.get('window').width;

const TaskCard: React.FC<TaskCardProps> = ({ step, order, isNext, isLast, onPress, index }) => {
    const { colors, theme } = useTheme();
    const { t } = useTranslation();
    const isCompleted = step.status === 'completed';
    const isPickup = step.task_type === 'pickup';
    const isBlurred = !isNext && !isCompleted;

    // Animation Values
    const scale = useSharedValue(0.95);
    const opacity = useSharedValue(0);
    const pulse = useSharedValue(1);

    useEffect(() => {
        // Entry animation
        scale.value = withSpring(1, { damping: 15 });
        opacity.value = withTiming(1, { duration: 400 });

        // Pulse animation for active task
        if (isNext) {
            pulse.value = withRepeat(
                withSequence(
                    withTiming(1.03, { duration: 1000 }),
                    withTiming(1, { duration: 1000 })
                ),
                -1,
                true
            );
        } else {
            pulse.value = withTiming(1);
        }
    }, [isNext]);

    const handlePress = () => {
        if (!isCompleted && isNext) {
            Haptics.selectionAsync();
        }
        onPress();
    };

    const animatedCardStyle = useAnimatedStyle(() => ({
        transform: [{ scale: isNext ? pulse.value : 1 }],
        opacity: opacity.value,
    }));

    // Dynamic Styles based on state
    const getCardBackground = () => {
        if (isNext) return colors.primary + '10'; // 10% opacity primary
        if (isCompleted) return colors.background; // Blend with bg
        return colors.card;
    };

    const getBorderColor = () => {
        if (isNext) return colors.primary;
        if (isCompleted) return colors.divider;
        return colors.divider || '#e0e0e0';
    };

    const getIcon = () => {
        if (isCompleted) return 'checkmark-circle';
        if (isPickup) return 'cube';
        return 'location';
    };

    const getIconColor = () => {
        if (isCompleted) return colors.success;
        if (isNext) return colors.primary;
        return colors.textSecondary;
    };

    return (
        <Animated.View
            entering={FadeInDown.delay(index * 100).springify()}
            style={[styles.container]}
        >
            {/* Timeline Section */}
            <View style={styles.timelineContainer}>
                <View style={[
                    styles.timelineLine,
                    { backgroundColor: isCompleted ? colors.success : colors.divider },
                    isLast && styles.hiddenLine
                ]} />
                <View style={[
                    styles.timelineDot,
                    {
                        borderColor: getIconColor(),
                        backgroundColor: isCompleted ? colors.success : (isNext ? colors.primary : colors.background)
                    },
                    isNext && styles.activeDot
                ]}>
                    {isCompleted && <Ionicons name="checkmark" size={12} color="#fff" />}
                </View>
            </View>

            {/* Card Content Section */}
            <TouchableOpacity
                activeOpacity={0.9}
                onPress={handlePress}
                disabled={!isNext && !isCompleted} // Only Active or Completed tasks are clickable
                style={{ flex: 1 }}
            >
                <Animated.View style={[
                    styles.card,
                    animatedCardStyle,
                    {
                        backgroundColor: getCardBackground(),
                        borderColor: getBorderColor(),
                        elevation: isNext ? 4 : 1,
                        shadowOpacity: isNext ? 0.2 : 0.05,
                        opacity: isCompleted ? 0.7 : 1
                    }
                ]}>
                    {/* Active Accent Bar */}
                    {isNext && <View style={[styles.accentBar, { backgroundColor: colors.primary }]} />}

                    <View style={[
                        styles.headerRow,
                        isBlurred && styles.blurredHeaderRow
                    ]}>
                        <View style={[
                            styles.chip,
                            { backgroundColor: isPickup ? colors.secondary + '20' : colors.info + '20' }
                        ]}>
                            <Text style={[
                                styles.chipText,
                                { color: isPickup ? colors.secondary : colors.info }
                            ]}>
                                {isPickup ? t('tasks.pickup') : t('tasks.dropoff')}
                            </Text>
                        </View>

                        {/* Time / Distance Metadata */}
                        {order.time_window_start && (
                            <View style={styles.metaContainer}>
                                <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                                <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                                    {typeof order.time_window_start === 'object' && 'seconds' in order.time_window_start
                                        ? new Date(order.time_window_start.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                        : String(order.time_window_start)}
                                </Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.mainContent}>
                        <Text style={[
                            styles.title,
                            {
                                color: isCompleted ? colors.textSecondary : colors.textPrimary,
                                textDecorationLine: isCompleted ? 'line-through' : 'none'
                            }
                        ]}>
                            {order.restaurant_name}
                        </Text>
                        <Text
                            numberOfLines={2}
                            style={[styles.address, { color: colors.textSecondary }]}
                        >
                            {isPickup ? order.pickup_address : order.dropoff_address}
                        </Text>

                        {isBlurred && (
                            <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderRadius: 16 }]}>
                                <BlurView
                                    intensity={40}
                                    tint={theme.dark ? 'dark' : 'light'}
                                    style={StyleSheet.absoluteFill}
                                />
                                <View style={[
                                    StyleSheet.absoluteFill, 
                                    { 
                                        backgroundColor: theme.dark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.4)',
                                        justifyContent: 'center',
                                        alignItems: 'center'
                                    }
                                ]}>
                                    <View style={[
                                        styles.lockCircle, 
                                        { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }
                                    ]}>
                                        <Ionicons name="lock-closed" size={24} color={colors.textSecondary} />
                                    </View>
                                </View>
                            </View>
                        )}
                    </View>

                    {/* Footer Actions / Info */}
                    {!isCompleted && !isBlurred && (
                        <View style={styles.footer}>
                            <View style={styles.bagInfo}>
                                <Ionicons name={getIcon()} size={16} color={getIconColor()} />
                                <Text style={[styles.orderId, { color: colors.textSecondary }]}>
                                    #{order.order_code}
                                </Text>
                            </View>

                            {isNext && (
                                <View style={styles.actionPrompt}>
                                    <Text style={[styles.actionText, { color: colors.primary }]}>
                                        {t('tasks.tap_for_details')}
                                    </Text>
                                    <Ionicons name="arrow-forward" size={16} color={colors.primary} />
                                </View>
                            )}
                        </View>
                    )}

                    {isBlurred && (
                        <View style={styles.blurredFooter}>
                            <View style={styles.bagInfo}>
                                <Text style={[styles.orderId, { color: colors.textSecondary }]}>
                                    {t('tasks.complete_previous_to_unlock')}
                                </Text>
                            </View>
                        </View>
                    )}
                </Animated.View>
            </TouchableOpacity>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        marginBottom: 4, // Dense list
    },
    timelineContainer: {
        width: 40,
        alignItems: 'center',
    },
    timelineLine: {
        width: 2,
        flex: 1,
        position: 'absolute',
        top: 20,
        bottom: -20, // Connect to next
        zIndex: -1,
    },
    hiddenLine: {
        backgroundColor: 'transparent',
    },
    timelineDot: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        marginTop: 20, // Align with card top
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
    },
    activeDot: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 4,
        marginTop: 18,
    },
    card: {
        borderRadius: 16,
        padding: 16,
        marginBottom: 16, // Space between cards
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 8,
        flex: 1,
        overflow: 'hidden',
    },
    accentBar: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 6,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    chip: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    chipText: {
        fontSize: 10,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    },
    metaContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    metaText: {
        fontSize: 12,
        fontWeight: '500',
    },
    mainContent: {
        marginBottom: 12,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 4,
    },
    address: {
        fontSize: 14,
        lineHeight: 20,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.05)',
        paddingTop: 12,
    },
    bagInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    orderId: {
        fontSize: 12,
        fontWeight: '600',
    },
    actionPrompt: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    actionText: {
        fontSize: 12,
        fontWeight: '600',
    },
    blurredHeaderRow: {
        justifyContent: 'flex-end',
        gap: 8,
    },
    blurredFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
        opacity: 0.8,
        justifyContent: 'center',
    },
    lockCircle: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    }
});

export default React.memo(TaskCard);
