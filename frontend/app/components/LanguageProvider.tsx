"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language, translations, TranslationKey } from '../lib/languages';

type LanguageContextType = {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: TranslationKey, variables?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [language, setLanguageState] = useState<Language>('de'); // Default to German for this user base

    useEffect(() => {
        const savedLang = localStorage.getItem('language') as Language | null;
        if (savedLang && (savedLang === 'en' || savedLang === 'de')) {
            setLanguageState(savedLang);
        } else {
            // Check browser language
            const browserLang = navigator.language.split('-')[0];
            if (browserLang === 'en' || browserLang === 'de') {
                setLanguageState(browserLang as Language);
            }
        }
    }, []);

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
        localStorage.setItem('language', lang);
    };

    const t = (key: TranslationKey, variables?: Record<string, string | number>): string => {
        let text = translations[language][key] || translations['en'][key] || key;

        if (variables) {
            Object.entries(variables).forEach(([k, v]) => {
                text = text.replace(`{${k}}`, String(v));
            });
        }

        return text;
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}
