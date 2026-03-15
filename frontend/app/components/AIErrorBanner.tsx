"use client";
import { X, AlertTriangle } from 'lucide-react';

interface AIErrorBannerProps {
    detail: string;
    isAdmin: boolean;
    onDismiss: () => void;
}

export default function AIErrorBanner({ detail, isAdmin, onDismiss }: AIErrorBannerProps) {
    return (
        <div className="glass-card rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-rose-700 dark:text-rose-300">Error</p>
                {isAdmin ? (
                    <p className="text-sm text-rose-600 dark:text-rose-400 mt-0.5 break-words font-mono">{detail}</p>
                ) : (
                    <p className="text-sm text-rose-600 dark:text-rose-400 mt-0.5">
                        An error occurred. Please try again.
                    </p>
                )}
            </div>
            <button
                onClick={onDismiss}
                aria-label="Close"
                className="shrink-0 text-rose-400 hover:text-rose-600 dark:text-rose-500 dark:hover:text-rose-300 transition-colors cursor-pointer"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}
