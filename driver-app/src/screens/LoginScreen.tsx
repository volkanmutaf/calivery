import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Image, Modal, SafeAreaView, StatusBar } from 'react-native';
import { useAuth } from '../lib/auth-context';
import { useTheme, ThemeMode } from '../lib/theme-context';
import { LinearGradient } from 'expo-linear-gradient';
import { httpsCallable } from 'firebase/functions';
import { firebaseFunctions } from '../lib/firebase';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

const LANGUAGES = [
    { code: 'en', label: 'English', flag: '🇺🇸' },
    { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
    { code: 'pt', label: 'Português', flag: '🇧🇷' },
    { code: 'es', label: 'Español', flag: '🇪🇸' },
];

export default function LoginScreen() {
    const { t, i18n } = useTranslation();
    const { colors, theme, mode, setMode } = useTheme();
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [showLanguages, setShowLanguages] = useState(false);
    const { signIn } = useAuth();

    // Determine gradient colors based on theme
    const gradientColors: [string, string, string] = theme.dark
        ? ['#141C2E', '#1e293b', '#141C2E']
        : ['#f8fafc', '#e2e8f0', '#f8fafc'];

    // Dynamic logo based on theme
    const logoSource = theme.dark
        ? require('../../assets/caliverylogolight.png')
        : require('../../assets/caliverylogodark.png');

    // Get current language flag
    const getCurrentFlag = () => {
        const lang = LANGUAGES.find(l => l.code === i18n.language);
        return lang?.flag || '🇺🇸';
    };

    const handleLogin = async () => {
        if (!identifier || !password) {
            setError(t('auth.required_fields'));
            return;
        }
        setError(null);
        setLoading(true);
        try {
            let emailToUse = identifier;

            if (!identifier.includes('@')) {
                const getUserByUsername = httpsCallable(firebaseFunctions, 'getUserByUsername');
                const result = await getUserByUsername({ username: identifier });
                const data = result.data as { email: string | null; found: boolean };

                if (!data.found || !data.email) {
                    throw { code: 'auth/user-not-found' };
                }
                emailToUse = data.email;
            }

            await signIn(emailToUse, password);
        } catch (err: any) {
            if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                setError(t('auth.wrong_password'));
            } else if (err.code === 'auth/user-not-found') {
                setError(t('auth.user_not_found'));
            } else if (err.code === 'auth/too-many-requests') {
                setError(t('auth.too_many_requests'));
            } else if (err.code === 'auth/account-suspended') {
                setError(t('auth.account_suspended'));
            } else {
                setError(err.message || t('auth.login_failed'));
            }
        } finally {
            setLoading(false);
        }
    };

    const handleLanguageChange = (langCode: string) => {
        i18n.changeLanguage(langCode);
    };

    const handleThemeChange = (themeMode: ThemeMode) => {
        setMode(themeMode);
    };

    return (
        <LinearGradient colors={gradientColors} style={styles.container}>
            <StatusBar
                barStyle={theme.dark ? 'light-content' : 'dark-content'}
                backgroundColor={theme.dark ? '#141C2E' : '#f8fafc'}
            />
            <SafeAreaView style={styles.safeArea}>
                {/* Settings Button - Top Left */}
                <TouchableOpacity
                    style={[styles.settingsButton, { backgroundColor: colors.surface, borderColor: colors.divider }]}
                    onPress={() => setShowSettings(true)}
                >
                    <Ionicons name="settings-outline" size={24} color={colors.textSecondary} />
                </TouchableOpacity>

                {/* Language Button - Top Right */}
                <TouchableOpacity
                    style={[styles.languageButton, { backgroundColor: colors.surface, borderColor: colors.divider }]}
                    onPress={() => setShowLanguages(true)}
                >
                    <Text style={{ fontSize: 20 }}>{getCurrentFlag()}</Text>
                </TouchableOpacity>

                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.content}>
                    <View style={styles.logoContainer}>
                        <Image
                            source={logoSource}
                            style={styles.logo}
                            resizeMode="contain"
                        />
                        <Text style={[styles.slogan, { color: colors.textSecondary }]}>{t('auth.slogan')}</Text>

                        {/* Developer Shortcuts */}
                        <View style={{ marginTop: 20, width: '100%', paddingHorizontal: 20 }}>
                            <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginBottom: 8 }}>Developer Access</Text>
                            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center' }}>
                                <TouchableOpacity
                                    onPress={() => {
                                        setIdentifier('berat@calivery.app');
                                        setPassword('berat123');
                                        signIn('berat@calivery.app', 'berat123');
                                    }}
                                    style={{ backgroundColor: 'rgba(245, 158, 11, 0.2)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)' }}
                                >
                                    <Text style={{ color: '#fbbf24', fontSize: 12, fontWeight: '600' }}>Login as Berat</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => {
                                        setIdentifier('driver@calivery.app');
                                        setPassword('driver123');
                                        signIn('driver@calivery.app', 'driver123');
                                    }}
                                    style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)' }}
                                >
                                    <Text style={{ color: '#34d399', fontSize: 12, fontWeight: '600' }}>Login as Driver</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.divider }]}>
                        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{t('common.sign_in')}</Text>

                        {error && (
                            <View style={[styles.errorBox, { backgroundColor: colors.error + '20', borderColor: colors.error + '40' }]}>
                                <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
                            </View>
                        )}

                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('common.email_placeholder')}</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.divider, color: colors.textPrimary }]}
                                placeholder={t('common.email_placeholder')}
                                placeholderTextColor={colors.textSecondary}
                                value={identifier}
                                onChangeText={setIdentifier}
                                autoCapitalize="none"
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('common.password_placeholder')}</Text>
                            <View style={styles.passwordContainer}>
                                <TextInput
                                    style={[styles.input, { flex: 1, backgroundColor: colors.surface, borderColor: colors.divider, color: colors.textPrimary }]}
                                    placeholder="••••••••"
                                    placeholderTextColor={colors.textSecondary}
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry={!showPassword}
                                />
                                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                                    <Text style={styles.eyeText}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
                            <LinearGradient colors={['#f59e0b', '#ea580c']} style={styles.buttonGradient}>
                                {loading ? (
                                    <ActivityIndicator color="#0f172a" />
                                ) : (
                                    <Text style={styles.buttonText}>{t('common.sign_in')}</Text>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>

                    <Text style={[styles.footer, { color: colors.textSecondary }]}>{t('auth.login_subtitle')}</Text>
                </KeyboardAvoidingView>
            </SafeAreaView>

            {/* Settings Modal */}
            <Modal visible={showSettings} transparent animationType="fade">
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setShowSettings(false)}
                >
                    <View style={[styles.modalContent, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
                        <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{t('settings.theme')}</Text>

                        {/* Theme Section */}
                        <View style={styles.themeRow}>
                            {[
                                { value: 'system' as ThemeMode, label: t('settings.theme_system'), icon: 'phone-portrait-outline' },
                                { value: 'light' as ThemeMode, label: t('settings.theme_light'), icon: 'sunny-outline' },
                                { value: 'dark' as ThemeMode, label: t('settings.theme_dark'), icon: 'moon-outline' },
                            ].map((opt) => (
                                <TouchableOpacity
                                    key={opt.value}
                                    style={[
                                        styles.themeButton,
                                        { backgroundColor: colors.background, borderColor: colors.divider },
                                        mode === opt.value && { backgroundColor: colors.primary + '20', borderColor: colors.primary }
                                    ]}
                                    onPress={() => handleThemeChange(opt.value)}
                                >
                                    <Ionicons
                                        name={opt.icon as any}
                                        size={20}
                                        color={mode === opt.value ? colors.primary : colors.textSecondary}
                                    />
                                    <Text style={[
                                        styles.themeLabel,
                                        { color: colors.textSecondary },
                                        mode === opt.value && { color: colors.primary, fontWeight: '600' }
                                    ]}>{opt.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <TouchableOpacity
                            style={[styles.doneButton, { backgroundColor: colors.primary }]}
                            onPress={() => setShowSettings(false)}
                        >
                            <Text style={styles.doneButtonText}>Done</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Language Modal */}
            <Modal visible={showLanguages} transparent animationType="fade">
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setShowLanguages(false)}
                >
                    <View style={[styles.modalContent, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
                        <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{t('settings.language')}</Text>

                        {LANGUAGES.map((lang) => (
                            <TouchableOpacity
                                key={lang.code}
                                style={[
                                    styles.languageOption,
                                    { backgroundColor: colors.background, borderColor: colors.divider },
                                    i18n.language === lang.code && { backgroundColor: colors.primary + '20', borderColor: colors.primary }
                                ]}
                                onPress={() => { handleLanguageChange(lang.code); setShowLanguages(false); }}
                            >
                                <Text style={{ fontSize: 24, marginRight: 12 }}>{lang.flag}</Text>
                                <Text style={[
                                    { fontSize: 16, color: colors.textSecondary },
                                    i18n.language === lang.code && { color: colors.primary, fontWeight: '600' }
                                ]}>{lang.label}</Text>
                                {i18n.language === lang.code && (
                                    <Ionicons name="checkmark" size={20} color={colors.primary} style={{ marginLeft: 'auto' }} />
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                </TouchableOpacity>
            </Modal>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    settingsButton: {
        position: 'absolute',
        top: 50,
        left: 20,
        zIndex: 10,
        padding: 8,
        borderRadius: 12,
        borderWidth: 1,
    },
    languageButton: {
        position: 'absolute',
        top: 50,
        right: 20,
        zIndex: 10,
        padding: 8,
        borderRadius: 12,
        borderWidth: 1,
    },
    content: { flex: 1, justifyContent: 'center', padding: 24 },
    logoContainer: { alignItems: 'center', marginBottom: 32 },
    logo: { width: 320, height: 130, marginBottom: 12 },
    slogan: { fontSize: 18, fontStyle: 'italic', textAlign: 'center' },
    card: { borderRadius: 24, padding: 24, borderWidth: 1 },
    cardTitle: { fontSize: 20, fontWeight: '600', marginBottom: 20 },
    errorBox: { borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1 },
    errorText: { fontSize: 14 },
    inputGroup: { marginBottom: 16 },
    label: { fontSize: 14, marginBottom: 8, fontWeight: '500' },
    input: { borderRadius: 12, padding: 16, borderWidth: 1, fontSize: 16 },
    passwordContainer: { flexDirection: 'row', alignItems: 'center' },
    eyeButton: { position: 'absolute', right: 16 },
    eyeText: { fontSize: 20 },
    button: { marginTop: 8, borderRadius: 12, overflow: 'hidden' },
    buttonGradient: { padding: 16, alignItems: 'center' },
    buttonText: { color: '#0f172a', fontSize: 16, fontWeight: '600' },
    footer: { textAlign: 'center', marginTop: 24, fontSize: 14 },

    // Modal Styles
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalContent: { borderRadius: 24, padding: 24, width: '100%', maxWidth: 400, borderWidth: 1 },
    modalTitle: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 24 },
    sectionTitle: { fontSize: 14, marginBottom: 12, textTransform: 'uppercase', fontWeight: '600' },
    optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    optionButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
    optionFlag: { fontSize: 18, marginRight: 8 },
    optionLabel: { fontSize: 14 },
    themeRow: { flexDirection: 'row', gap: 8 },
    themeButton: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12, borderWidth: 1 },
    themeLabel: { marginTop: 6, fontSize: 12 },
    doneButton: { marginTop: 24, padding: 14, borderRadius: 12, alignItems: 'center' },
    doneButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    languageOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
});
