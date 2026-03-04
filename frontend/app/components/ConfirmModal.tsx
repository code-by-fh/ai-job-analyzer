"use client";
import React, { useEffect, useState } from 'react';
import { useLanguage } from './LanguageProvider';

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
    children?: React.ReactNode;
}

export default function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText,
    cancelText,
    isDestructive = false,
    children
}: ConfirmModalProps) {
    const { t } = useLanguage();
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            setIsVisible(true);
        } else {
            document.body.style.overflow = 'unset';
            const timer = setTimeout(() => setIsVisible(false), 300);
            return () => {
                clearTimeout(timer);
                document.body.style.overflow = 'unset';
            };
        }

        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    if (!isVisible) return null;

    return (
        <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal */}
            <div className={`
                relative w-full max-w-sm bg-white dark:bg-slate-900/90 backdrop-blur-xl 
                border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl 
                transform transition-all duration-300 scale-100
                ${isOpen ? 'translate-y-0 scale-100' : 'translate-y-4 scale-95'}
            `}>
                <div className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className={`
                            w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0
                            ${isDestructive
                                ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400'
                                : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400'}
                        `}>
                            {isDestructive ? '⚠️' : 'ℹ️'}
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                            {title}
                        </h3>
                    </div>

                    <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-6">
                        {message}
                    </p>

                    {children && <div className="mb-6">{children}</div>}

                    <div className="flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                        >
                            {cancelText || t('cancel')}
                        </button>
                        <button
                            onClick={() => {
                                onConfirm();
                                onClose();
                            }}
                            className={`
                                px-4 py-2 text-sm font-bold text-white rounded-xl shadow-lg transition-transform active:scale-95 cursor-pointer
                                ${isDestructive
                                    ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-500/20'
                                    : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20'}
                            `}
                        >
                            {confirmText || t('confirm')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
