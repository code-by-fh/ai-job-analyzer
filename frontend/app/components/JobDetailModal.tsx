"use client";
import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import JobCard from './JobCard/JobCard';
import type { JobCardProps } from './JobCard/types';

interface JobDetailModalProps extends JobCardProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function JobDetailModal({ isOpen, onClose, ...jobCardProps }: JobDetailModalProps) {
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-5xl max-h-[90vh] flex flex-col animate-in zoom-in duration-300">
                {/* Close button outside/on top of the card */}
                <button 
                    onClick={onClose}
                    className="absolute -top-12 right-0 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors cursor-pointer"
                    title="Close"
                >
                    <X className="w-6 h-6" />
                </button>
                
                <div className="overflow-y-auto rounded-3xl shadow-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <JobCard {...jobCardProps} />
                </div>
            </div>
            
            {/* Click outside to close */}
            <div 
                className="absolute inset-0 -z-10" 
                onClick={onClose}
            />
        </div>
    );
}
