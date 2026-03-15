import React, { useEffect, useState } from 'react';
import {
    StyleSheet,
    View,
    Text,
    ActivityIndicator,
    LayoutChangeEvent,
    Platform,
} from 'react-native';
import {
    Gesture,
    GestureDetector,
    GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    runOnJS,
    interpolate,
    Extrapolation,
    withTiming,
    useAnimatedReaction,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

// Constants
const SLIDER_HEIGHT = 55;
const THUMB_WIDTH = 50;
const PADDING = 4;
const DEFAULT_BG_COLOR = '#e0e0e0';
const DEFAULT_ACTIVE_COLOR = '#4CAF50';
const DEFAULT_TEXT_COLOR = '#757575';
const DEFAULT_THUMB_COLOR = '#ffffff';

interface SlideToCompleteProps {
    onComplete: () => void;
    disabled?: boolean;
    loading?: boolean;
    text?: string;
    completedText?: string;
    textColor?: string;
    activeColor?: string;
    backgroundColor?: string;
    thumbColor?: string;
    autoReset?: boolean;
}

export const SlideToComplete: React.FC<SlideToCompleteProps> = ({
    onComplete,
    disabled = false,
    loading = false,
    text = 'Slide to complete',
    completedText = 'Completed',
    textColor = DEFAULT_TEXT_COLOR,
    activeColor = DEFAULT_ACTIVE_COLOR,
    backgroundColor = DEFAULT_BG_COLOR,
    thumbColor = DEFAULT_THUMB_COLOR,
    autoReset = false,
}) => {
    const [sliderWidth, setSliderWidth] = useState(0);
    const [isCompleted, setIsCompleted] = useState(false);

    // Shared Values
    const translateX = useSharedValue(0);
    const isDragging = useSharedValue(false);
    const progress = useSharedValue(0);

    // Maximum drag distance
    const maxDrag = Math.max(0, sliderWidth - THUMB_WIDTH - PADDING * 2);

    // Reset logic
    const resetSlider = () => {
        'worklet';
        translateX.value = withSpring(0, { damping: 20 });
        progress.value = withSpring(0);
        isDragging.value = false;
    };

    const handleComplete = () => {
        setIsCompleted(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onComplete();

        if (autoReset) {
            setTimeout(() => {
                setIsCompleted(false);
                runOnJS(resetSlider)();
            }, 1000);
        }
    };

    // Gesture definition
    const panGesture = Gesture.Pan()
        .enabled(!disabled && !loading && !isCompleted)
        .onStart(() => {
            isDragging.value = true;
        })
        .onUpdate((event) => {
            if (maxDrag > 0) {
                translateX.value = Math.max(0, Math.min(event.translationX, maxDrag));
                progress.value = translateX.value / maxDrag;
            }
        })
        .onEnd(() => {
            isDragging.value = false;
            if (translateX.value > maxDrag * 0.9) {
                // Success
                translateX.value = withSpring(maxDrag, { damping: 20 });
                progress.value = withSpring(1);
                runOnJS(handleComplete)();
            } else {
                // Reset
                translateX.value = withSpring(0, { damping: 20 });
                progress.value = withSpring(0);
            }
        });

    // Animated Styles
    const thumbStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateX: translateX.value }],
        };
    });

    const backgroundStyle = useAnimatedStyle(() => {
        return {
            width: translateX.value + THUMB_WIDTH,
        };
    });

    const textStyle = useAnimatedStyle(() => {
        return {
            opacity: interpolate(
                translateX.value,
                [0, maxDrag * 0.5],
                [1, 0],
                Extrapolation.CLAMP
            ),
        };
    });

    const completedContainerStyle = useAnimatedStyle(() => {
        return {
            opacity: withTiming(isCompleted ? 1 : 0, { duration: 300 }),
            zIndex: isCompleted ? 2 : -1
        }
    })

    // Measure layout
    const onLayout = (event: LayoutChangeEvent) => {
        setSliderWidth(event.nativeEvent.layout.width);
    };

    return (
        <GestureHandlerRootView style={{ width: '100%' }}>
            <View
                style={[
                    styles.container,
                    { backgroundColor: disabled ? '#f0f0f0' : backgroundColor },
                ]}
                onLayout={onLayout}
            >
                {/* Background Fill */}
                <Animated.View
                    style={[
                        styles.backgroundFill,
                        { backgroundColor: activeColor },
                        backgroundStyle,
                    ]}
                />

                {/* Text Label */}
                <View style={styles.textContainer} pointerEvents="none">
                    <Animated.Text
                        style={[
                            styles.text,
                            { color: disabled ? '#999' : textColor },
                            textStyle,
                        ]}
                    >
                        {text}
                    </Animated.Text>
                </View>

                {/* Completed State Overlay */}
                <Animated.View style={[styles.completedContainer, completedContainerStyle]} pointerEvents="none">
                    <Text style={styles.completedText}>{completedText}</Text>
                </Animated.View>

                {/* Draggable Thumb */}
                <GestureDetector gesture={panGesture}>
                    <Animated.View
                        style={[
                            styles.thumb,
                            { backgroundColor: thumbColor },
                            thumbStyle,
                        ]}
                    >
                        {loading ? (
                            <ActivityIndicator color={activeColor} size="small" />
                        ) : (
                            <View style={[styles.thumbIcon, { backgroundColor: activeColor }]} />
                        )}
                    </Animated.View>
                </GestureDetector>
            </View>
        </GestureHandlerRootView>
    );
};

const styles = StyleSheet.create({
    container: {
        height: SLIDER_HEIGHT,
        borderRadius: SLIDER_HEIGHT / 2,
        justifyContent: 'center',
        padding: PADDING,
        overflow: 'hidden',
        width: '100%',
    },
    backgroundFill: {
        position: 'absolute',
        left: PADDING,
        top: PADDING,
        bottom: PADDING,
        borderRadius: (SLIDER_HEIGHT - PADDING * 2) / 2,
        height: SLIDER_HEIGHT - PADDING * 2,
    },
    thumb: {
        width: THUMB_WIDTH,
        height: THUMB_WIDTH,
        borderRadius: THUMB_WIDTH / 2,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.15,
        shadowRadius: 3,
        elevation: 3,
    },
    thumbIcon: {
        width: 12,
        height: 12,
        borderRadius: 6,
        opacity: 0.5
    },
    textContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    text: {
        fontSize: 16,
        fontWeight: '600',
    },
    completedContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent'
    },
    completedText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#fff'
    }
});
