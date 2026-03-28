"use client";
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface NotificationContextType {
    errorDetail: string | null;
    successDetail: string | null;
    showError: (detail: string) => void;
    showSuccess: (detail: string) => void;
    clearError: () => void;
    clearSuccess: () => void;
}

const NotificationContext = createContext<NotificationContextType>({
    errorDetail: null,
    successDetail: null,
    showError: () => {},
    showSuccess: () => {},
    clearError: () => {},
    clearSuccess: () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
    const [errorDetail, setErrorDetail] = useState<string | null>(null);
    const [successDetail, setSuccessDetail] = useState<string | null>(null);

    const showError = useCallback((detail: string) => setErrorDetail(detail), []);
    const clearError = useCallback(() => setErrorDetail(null), []);

    const showSuccess = useCallback((detail: string) => {
        setSuccessDetail(detail);
        setTimeout(() => setSuccessDetail(null), 5000);
    }, []);
    const clearSuccess = useCallback(() => setSuccessDetail(null), []);

    return (
        <NotificationContext.Provider value={{ 
            errorDetail, 
            successDetail, 
            showError, 
            showSuccess, 
            clearError, 
            clearSuccess 
        }}>
            {children}
        </NotificationContext.Provider>
    );
}

export function useNotification() {
    return useContext(NotificationContext);
}
