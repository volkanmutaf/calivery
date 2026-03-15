'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

export type NotificationType = 'success' | 'error' | 'info';

interface NotificationState {
    show: boolean;
    message: string;
    type: NotificationType;
}

interface NotificationContextType {
    showNotification: (message: string, type?: NotificationType) => void;
    hideNotification: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
    const [notification, setNotification] = useState<NotificationState>({
        show: false,
        message: '',
        type: 'info'
    });

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (notification.show) {
            timer = setTimeout(() => {
                hideNotification();
            }, 5000); // 5 seconds auto-dismiss
        }
        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [notification.show]);

    const showNotification = (message: string, type: NotificationType = 'info') => {
        setNotification({ show: true, message, type });
    };

    const hideNotification = () => {
        setNotification((prev) => ({ ...prev, show: false }));
    };

    return (
        <NotificationContext.Provider value={{ showNotification, hideNotification }}>
            {children}
            {notification.show && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity">
                    <div className="bg-surface border border-border-light dark:border-border-dark p-6 rounded-2xl shadow-2xl max-w-sm w-full mx-4 flex flex-col items-center animate-in fade-in zoom-in duration-200">
                        <div className="flex flex-col items-center text-center space-y-4">
                            {notification.type === 'success' && <CheckCircle className="w-12 h-12 text-green-500" />}
                            {notification.type === 'error' && <XCircle className="w-12 h-12 text-red-500" />}
                            {notification.type === 'info' && <Info className="w-12 h-12 text-blue-500" />}
                            
                            <p className="text-text-main font-medium text-lg leading-relaxed">
                                {notification.message}
                            </p>
                        </div>
                        
                        <button
                            onClick={hideNotification}
                            className="mt-6 w-full py-2.5 px-4 bg-brand-primary hover:bg-brand-primary/90 text-white rounded-lg font-medium transition-colors"
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}
        </NotificationContext.Provider>
    );
}

export function useNotification() {
    const context = useContext(NotificationContext);
    if (context === undefined) {
        throw new Error('useNotification must be used within a NotificationProvider');
    }
    return context;
}
