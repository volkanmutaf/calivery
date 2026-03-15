import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './locales/en.json';
import tr from './locales/tr.json';
import es from './locales/es.json';
import pt from './locales/pt.json';

const resources = {
    en: { translation: en },
    tr: { translation: tr },
    es: { translation: es },
    pt: { translation: pt },
};

export const initI18n = async () => {
    let savedLanguage = await AsyncStorage.getItem('language');

    if (!savedLanguage) {
        const deviceLocales = getLocales();
        const deviceLanguage = deviceLocales && deviceLocales.length > 0 ? deviceLocales[0].languageCode : 'en';
        savedLanguage = deviceLanguage && ['en', 'tr', 'es', 'pt'].includes(deviceLanguage)
            ? deviceLanguage
            : 'en';
    }

    await i18n
        .use(initReactI18next)
        .init({
            resources,
            lng: savedLanguage,
            fallbackLng: 'en',
            compatibilityJSON: 'v4',
            interpolation: {
                escapeValue: false,
            },
            react: {
                useSuspense: false,
            },
        } as any);
};

export default i18n;
