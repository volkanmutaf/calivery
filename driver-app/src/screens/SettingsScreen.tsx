import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../lib/theme-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, DrawerActions } from '@react-navigation/native';

export default function SettingsScreen() {
    const { t, i18n } = useTranslation();
    const { mode, setMode, colors } = useTheme();
    const navigation = useNavigation<any>();

    const changeLanguage = async (lang: string) => {
        await i18n.changeLanguage(lang);
        await AsyncStorage.setItem('language', lang);
    };

    const handleThemeChange = (value: 'system' | 'light' | 'dark') => {
        setMode(value);
        // Navigate back to Tasks after theme selection
        navigation.dispatch(DrawerActions.jumpTo('Tasks'));
    };

    const ThemeOption = ({ label, value, icon }: { label: string, value: 'system' | 'light' | 'dark', icon: string }) => {
        const isActive = mode === value;
        return (
            <TouchableOpacity
                style={[
                    styles.themeOption,
                    { backgroundColor: isActive ? colors.primary + '20' : colors.surface, borderColor: isActive ? colors.primary : colors.divider }
                ]}
                onPress={() => handleThemeChange(value)}
            >
                <Ionicons name={icon as any} size={24} color={isActive ? colors.primary : colors.textSecondary} />
                <Text style={[styles.themeOptionText, { color: isActive ? colors.primary : colors.textSecondary }]}>{label}</Text>
                {isActive && <Ionicons name="checkmark-circle" size={18} color={colors.primary} style={styles.checkIcon} />}
            </TouchableOpacity>
        );
    };

    return (
        <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>

            {/* Theme Section */}
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('settings.theme')}</Text>
                <View style={styles.themeGrid}>
                    <ThemeOption label="System" value="system" icon="phone-portrait-outline" />
                    <ThemeOption label="Light" value="light" icon="sunny-outline" />
                    <ThemeOption label="Dark" value="dark" icon="moon-outline" />
                </View>
            </View>

            {/* Language Section */}
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('settings.language')}</Text>
                <View style={styles.langGrid}>
                    {['en', 'tr', 'es', 'pt'].map((lang) => (
                        <TouchableOpacity
                            key={lang}
                            style={[
                                styles.langButton,
                                {
                                    backgroundColor: i18n.language === lang ? colors.primary + '20' : colors.background,
                                    borderColor: i18n.language === lang ? colors.primary : colors.divider
                                }
                            ]}
                            onPress={() => changeLanguage(lang)}
                        >
                            <Text style={[
                                styles.langText,
                                { color: i18n.language === lang ? colors.primary : colors.textSecondary }
                            ]}>
                                {lang === 'en' ? 'English' : lang === 'tr' ? 'Türkçe' : lang === 'es' ? 'Español' : 'Português'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>About</Text>
                <Text style={[styles.aboutText, { color: colors.textSecondary }]}>Calivery Driver App v1.0.0</Text>
                <Text style={[styles.aboutText, { color: colors.textSecondary }]}>California Catering Delivery</Text>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 16 },
    section: { borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1 },
    sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 16 },

    // Theme Styles
    themeGrid: { gap: 12 },
    themeOption: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1 },
    themeOptionText: { fontSize: 16, fontWeight: '500', marginLeft: 12, flex: 1 },
    checkIcon: { marginLeft: 8 },

    // Language Styles
    langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    langButton: { width: '48%', padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
    langText: { fontWeight: '500' },

    aboutText: { fontSize: 14, marginBottom: 4 },
});
