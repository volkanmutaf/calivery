import React from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { TactileButton } from '../components/TactileButton';
import { useTheme } from '../lib/theme-context';

export default function ButtonDemoScreen() {
    const { colors } = useTheme();

    const handlePress = (msg: string) => {
        console.log(`Pressed: ${msg}`);
    };

    return (
        <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
            <Text style={[styles.heading, { color: colors.textPrimary }]}>Primary Buttons</Text>
            <View style={styles.row}>
                <TactileButton label="Small" size="sm" onPress={() => handlePress('Small')} />
                <TactileButton label="Medium" size="md" onPress={() => handlePress('Medium')} />
                <TactileButton label="Large" size="lg" onPress={() => handlePress('Large')} />
            </View>

            <Text style={[styles.heading, { color: colors.textPrimary }]}>Variants</Text>
            <View style={styles.gap}>
                <TactileButton label="Secondary Action" variant="secondary" onPress={() => handlePress('Secondary')} />
                <TactileButton label="Danger Zone" variant="danger" onPress={() => handlePress('Danger')} leftIcon="warning" />
                <TactileButton label="Ghost Button" variant="ghost" onPress={() => handlePress('Ghost')} />
            </View>

            <Text style={[styles.heading, { color: colors.textPrimary }]}>States & Icons</Text>
            <View style={styles.gap}>
                <TactileButton
                    label="Navigation"
                    leftIcon="navigate"
                    onPress={() => handlePress('Nav')}
                    variant="primary"
                />
                <TactileButton
                    label="Loading..."
                    loading={true}
                    onPress={() => { }}
                />
                <TactileButton
                    label="Disabled"
                    disabled={true}
                    onPress={() => { }}
                />
                <TactileButton
                    label="With Right Icon"
                    rightIcon="arrow-forward"
                    onPress={() => handlePress('Right Icon')}
                />
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: { padding: 20, paddingBottom: 50 },
    heading: { fontSize: 20, fontWeight: 'bold', marginVertical: 16 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
    gap: { gap: 12 }
});
