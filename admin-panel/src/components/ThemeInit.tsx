'use client';

import { useEffect } from 'react';

export default function ThemeInit() {
    useEffect(() => {
        const applyTheme = () => {
            const savedSettings = localStorage.getItem('calivery_settings');
            let theme = 'dark'; // Default
            if (savedSettings) {
                try {
                    const parsed = JSON.parse(savedSettings);
                    if (parsed.theme) theme = parsed.theme;
                } catch { }
            }

            if (theme === 'dark') {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        };

        applyTheme();

        // Listen for storage events to sync across tabs
        window.addEventListener('storage', applyTheme);
        return () => window.removeEventListener('storage', applyTheme);
    }, []);

    return null;
}
