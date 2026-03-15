import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme as useDeviceColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// --- Color Palettes ---

export const LightTheme = {
    dark: false,
    colors: {
        background: '#FFFFFF',
        surface: '#F5F5F5',
        card: '#FFFFFF',
        primary: '#6200EE',
        secondary: '#018786',
        textPrimary: '#000000',
        textSecondary: '#5F6368',
        divider: '#E0E0E0',
        error: '#B00020',

        // Status colors (kept consistent or adapted)
        success: '#10b981',
        warning: '#f59e0b',
        info: '#3b82f6',
        disabled: '#9CA3AF',
    }
};

export const DarkTheme = {
    dark: true,
    colors: {
        background: '#121212',
        surface: '#1E1E1E',
        card: '#242424',
        primary: '#BB86FC',
        secondary: '#03DAC6',
        textPrimary: '#FFFFFF',
        textSecondary: '#B3B3B3',
        divider: '#2C2C2C',
        error: '#CF6679',

        // Status colors
        success: '#10b981',
        warning: '#f59e0b',
        info: '#3b82f6',
        disabled: '#6B7280',
    }
};

type ThemeType = typeof LightTheme;
export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextData {
    theme: ThemeType;
    mode: ThemeMode;
    setMode: (mode: ThemeMode) => void;
    colors: ThemeType['colors'];
}

const ThemeContext = createContext<ThemeContextData>({} as ThemeContextData);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
    const deviceColorScheme = useDeviceColorScheme();
    const [mode, setMode] = useState<ThemeMode>('system');
    const [theme, setTheme] = useState<ThemeType>(DarkTheme); // Default to dark initially

    useEffect(() => {
        loadThemeObj();
    }, []);

    useEffect(() => {
        updateTheme(mode);
    }, [mode, deviceColorScheme]);

    const loadThemeObj = async () => {
        try {
            const storedMode = await AsyncStorage.getItem('app_theme_mode');
            if (storedMode) {
                setMode(storedMode as ThemeMode);
            }
        } catch (e) {
            console.error('Failed to load theme preference', e);
        }
    };

    const updateTheme = (currentMode: ThemeMode) => {
        let targetTheme = DarkTheme;
        if (currentMode === 'light') {
            targetTheme = LightTheme;
        } else if (currentMode === 'dark') {
            targetTheme = DarkTheme;
        } else {
            // System
            targetTheme = deviceColorScheme === 'light' ? LightTheme : DarkTheme;
        }
        setTheme(targetTheme);
    };

    const handleSetMode = async (newMode: ThemeMode) => {
        setMode(newMode);
        try {
            await AsyncStorage.setItem('app_theme_mode', newMode);
        } catch (e) {
            console.error('Failed to save theme preference', e);
        }
    };

    return (
        <ThemeContext.Provider value={{ theme, mode, setMode: handleSetMode, colors: theme.colors }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
