import React from 'react';

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    children?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, children }: PageHeaderProps) {
    return (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/50 pb-6">
            <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{title}</h1>
                {subtitle && <p className="text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>}
            </div>
            {children && <div>{children}</div>}
        </div>
    );
}
