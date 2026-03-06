import React from 'react';

interface PageWrapperProps {
    children: React.ReactNode;
    className?: string;
}

export default function PageWrapper({ children, className = '' }: PageWrapperProps) {
    return (
        <div className={`space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ${className}`.trim()}>
            {children}
        </div>
    );
}
