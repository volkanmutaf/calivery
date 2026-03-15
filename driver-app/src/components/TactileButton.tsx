import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
    interpolateColor,
    interpolate,
    Extrapolate,
    runOnJS
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface TactileButtonProps {
    onPress: () => void;
    onLongPress?: () => void;
    label: string;
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    disabled?: boolean;
    leftIcon?: React.ComponentProps<typeof Ionicons>['name'];
    rightIcon?: React.ComponentProps<typeof Ionicons>['name'];
    style?: ViewStyle;
    textStyle?: TextStyle;
    longPressDelay?: number;
}

const AnimatedView = Animated.createAnimatedComponent(View);

export function TactileButton({
    onPress,
    onLongPress,
    label,
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    leftIcon,
    rightIcon,
    style,
    textStyle,
    longPressDelay = 500
}: TactileButtonProps) {
    // Shared values for animation state
    const isPressed = useSharedValue(0); // 0 = idle, 1 = pressed
    const scale = useSharedValue(1);
    const translateY = useSharedValue(0);

    // Haptic feedback helper
    const triggerHaptic = () => {
        // Run on JS thread
        if (!disabled) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
    };

    // Gesture Definition
    const tapGesture = useMemo(() => {
        const gesture = Gesture.Tap()
            .maxDuration(10000) // Allow long holds without failing
            .onBegin(() => {
                if (disabled || loading) return;
                isPressed.value = 1;
                scale.value = withSpring(0.97, { damping: 10, stiffness: 300 });
                translateY.value = withSpring(1, { damping: 10, stiffness: 300 });
                runOnJS(triggerHaptic)();
            })
            .onFinalize(() => {
                if (disabled || loading) return;
                isPressed.value = 0; // Reset state
                scale.value = withSpring(1, { damping: 12, stiffness: 300 });
                translateY.value = withSpring(0, { damping: 12, stiffness: 300 });
            })
            .onEnd(() => {
                if (disabled || loading) return;
                runOnJS(onPress)();
            });

        return gesture;
    }, [disabled, loading, onPress]);

    // Combine with long press if needed
    const longPressGesture = useMemo(() => {
        if (!onLongPress) return null;

        return Gesture.LongPress()
            .minDuration(longPressDelay)
            .onStart(() => {
                if (disabled || loading) return;
                runOnJS(triggerHaptic)();
                runOnJS(onLongPress)();
            });
    }, [onLongPress, disabled, loading, longPressDelay]);

    // Determine effective gesture
    // For simplicity, we just use tap logic for visual feedback even for long press
    // But to properly support both, we might need race/simultaneous. 
    // Given the prompt asks for "Press interaction... On release... spring back", 
    // the Tap gesture covers the "On release" logic best.
    // If onLongPress is provided, we can compose them. 
    // However, Gesture.Tap calls onEnd only on rapid taps usually.
    // Let's stick to the prompt requirements: "On press down... On release...".
    // We can use the lower-level touches in .onBegin/.onFinalize of a generic gesture 
    // or just stick to the Tap gesture which handles "onEnd" for the action.

    // Refined gesture logic for "Tactile" feel:
    // We strictly use the press state for visuals, and onEnd for action.
    const gesture = Gesture.Simultaneous(
        tapGesture,
        longPressGesture || Gesture.Tap() // dummy if null
    );

    // Dynamic Styles based on variant
    const getVariantStyles = () => {
        switch (variant) {
            case 'secondary':
                return { bg: '#F3F4F6', text: '#1F2937', border: 'transparent' };
            case 'ghost':
                return { bg: 'transparent', text: '#4B5563', border: 'transparent' };
            case 'danger':
                return { bg: '#FEE2E2', text: '#EF4444', border: 'transparent' };
            case 'primary':
            default:
                return { bg: '#FF4500', text: '#FFFFFF', border: 'transparent' }; // Carivery Orange
        }
    };

    const colors = getVariantStyles();

    // Animated Styles
    const animatedStyle = useAnimatedStyle(() => {
        const opacity = disabled ? 0.6 : 1;

        return {
            transform: [
                { scale: scale.value },
                { translateY: translateY.value }
            ],
            opacity,
        };
    });

    const getSizeStyles = () => {
        switch (size) {
            case 'sm': return { paddingVertical: 8, paddingHorizontal: 16, fontSize: 13, iconSize: 16 };
            case 'lg': return { paddingVertical: 16, paddingHorizontal: 32, fontSize: 18, iconSize: 24 };
            case 'md':
            default: return { paddingVertical: 12, paddingHorizontal: 24, fontSize: 16, iconSize: 20 };
        }
    };

    const sizeSpec = getSizeStyles();

    return (
        <GestureDetector gesture={gesture}>
            <AnimatedView style={[
                styles.container,
                {
                    backgroundColor: colors.bg,
                    borderRadius: 12, // Modern rounded corners
                    paddingVertical: sizeSpec.paddingVertical,
                    paddingHorizontal: sizeSpec.paddingHorizontal,
                },
                style,
                animatedStyle
            ]}>
                {loading ? (
                    <ActivityIndicator size="small" color={colors.text} />
                ) : (
                    <View style={styles.contentContainer}>
                        {leftIcon && (
                            <Ionicons
                                name={leftIcon}
                                size={sizeSpec.iconSize}
                                color={colors.text}
                                style={{ marginRight: 8 }}
                            />
                        )}
                        <Text style={[
                            styles.label,
                            {
                                color: colors.text,
                                fontSize: sizeSpec.fontSize
                            },
                            textStyle
                        ]}>
                            {label}
                        </Text>
                        {rightIcon && (
                            <Ionicons
                                name={rightIcon}
                                size={sizeSpec.iconSize}
                                color={colors.text}
                                style={{ marginLeft: 8 }}
                            />
                        )}
                    </View>
                )}
            </AnimatedView>
        </GestureDetector>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        // Shadow for depth
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    contentContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    label: {
        fontWeight: '600',
        textAlign: 'center',
    }
});
