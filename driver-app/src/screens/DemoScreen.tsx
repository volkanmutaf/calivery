import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, Alert, SafeAreaView } from 'react-native';
import { SlideToComplete } from '../components/SlideToComplete';

export default function DemoScreen() {
    const [resetKey, setResetKey] = useState(0);

    const handleComplete = (label: string) => {
        console.log(`${label} completed`);
        // Alert.alert('Completed', `${label} action triggered!`);
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView contentContainerStyle={styles.container}>
                <Text style={styles.header}>Slide To Complete Demo</Text>

                <View style={styles.section}>
                    <Text style={styles.label}>Default</Text>
                    <SlideToComplete
                        key={`default-${resetKey}`}
                        onComplete={() => handleComplete('Default')}
                    />
                </View>

                <View style={styles.section}>
                    <Text style={styles.label}>Custom Colors (Red/Dark)</Text>
                    <SlideToComplete
                        key={`custom-${resetKey}`}
                        onComplete={() => handleComplete('Custom')}
                        activeColor="#D32F2F"
                        backgroundColor="#333"
                        textColor="#fff"
                        thumbColor="#FFCDD2"
                        text="Slide to Delete"
                    />
                </View>

                <View style={styles.section}>
                    <Text style={styles.label}>Disabled</Text>
                    <SlideToComplete
                        onComplete={() => { }}
                        disabled={true}
                        text="Disabled Slider"
                    />
                </View>

                <View style={styles.section}>
                    <Text style={styles.label}>Loading</Text>
                    <SlideToComplete
                        onComplete={() => { }}
                        loading={true}
                        activeColor="#1976D2"
                        text="Processing..."
                    />
                </View>

                <View style={styles.section}>
                    <Text style={styles.label}>Auto Reset (1s)</Text>
                    <SlideToComplete
                        onComplete={() => handleComplete('Auto Reset')}
                        autoReset={true}
                        activeColor="#7B1FA2"
                        text="Slide to Auto Reset"
                    />
                </View>

                <View style={styles.spacer} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#fff',
    },
    container: {
        padding: 20,
        gap: 20,
    },
    header: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 10,
        textAlign: 'center',
    },
    section: {
        marginBottom: 20,
    },
    label: {
        fontSize: 16,
        marginBottom: 8,
        color: '#333',
        fontWeight: '500',
    },
    spacer: {
        height: 50,
    },
});
