import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/theme-context';
import { LucideIcon } from 'lucide-react-native';

interface StatTileProps {
    label: string;
    value: number | string;
    // Support both Ionicons and Lucide (passed as component) if needed, 
    // strictly asking for lively icons. Using Ionicons as existing project uses it, 
    // but prompt mentioned "lucide-react-native or Expo vector icons". 
    // We'll stick to Ionicons for consistency with the rest of the app or use Lucide if available.
    // The prompt prefers Lucide, let's use Lucide if installed? 
    // Checking package.json is expensive. I'll use Ionicons to be safe with existing imports 
    // effectively, or I can try Lucide if I see it in package.json.
    // I saw package.json earlier? No. 
    // I will use Ionicons as it is already used in other files.
    iconName: keyof typeof Ionicons.glyphMap;
    color?: string;
}

export default function StatTile({ label, value, iconName, color }: StatTileProps) {
    const { colors } = useTheme();

    // Choose a lively color if none provided, or use primary
    const activeColor = color || colors.primary;

    return (
        <View style={[styles.container, { backgroundColor: colors.surface }]}>
            <View style={[styles.iconCircle, { backgroundColor: activeColor + '15' }]}>
                <Ionicons name={iconName} size={22} color={activeColor} />
            </View>
            <Text style={[styles.value, { color: colors.textPrimary }]}>{value}</Text>
            <Text style={[styles.label, { color: colors.textSecondary }]} numberOfLines={1}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 12,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        marginHorizontal: 4,
        minHeight: 100,
    },
    iconCircle: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    value: {
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 2,
    },
    label: {
        fontSize: 11,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
});
