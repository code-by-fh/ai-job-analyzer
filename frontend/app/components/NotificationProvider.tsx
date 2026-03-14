"use client";
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface NotificationContextType {
    errorDetail: string | null;
    showError: (detail: string) => void;
    clearError: () => void;
}

const NotificationContext = createContext<NotificationContextType>({
    errorDetail: null,
    showError: () => {},
    clearError: () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
    const [errorDetail, setErrorDetail] = useState<string | null>(null);

    const showError = useCallback((detail: string) => setErrorDetail(detail), []);
    const clearError = useCallback(() => setErrorDetail(null), []);

    return (
        <NotificationContext.Provider value={{ errorDetail, showError, clearError }}>
            {children}
        </NotificationContext.Provider>
    );
}

export function useNotification() {
    return useContext(NotificationContext);
}
