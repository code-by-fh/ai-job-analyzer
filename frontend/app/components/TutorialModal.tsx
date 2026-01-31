"use client";

import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useLanguage } from './LanguageProvider';

interface Step {
    title: string;
    description: string;
    icon: string;
    color: string;
    target?: string; // CSS Selector
    path?: string;   // Required path for this step
}

interface TutorialModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function TutorialModal({ isOpen, onClose }: TutorialModalProps) {
    const { t } = useLanguage();

    const steps: Step[] = [
        {
            title: t('tutorialWelcomeTitle'),
            description: t('tutorialWelcomeDesc'),
            icon: "✨",
            color: "from-indigo-500 to-purple-600",
        },
        {
            title: t('tutorialNavTitle'),
            description: t('tutorialNavDesc'),
            icon: "🗺️",
            color: "from-blue-500 to-indigo-600",
            target: "#sidebar-nav",
        },
        {
            title: t('tutorialAnalysisTitle'),
            description: t('tutorialAnalysisDesc'),
            icon: "🔍",
            color: "from-purple-500 to-pink-600",
            target: "#search-container",
            path: "/",
        },
        {
            title: t('tutorialSortTitle'),
            description: t('tutorialSortDesc'),
            icon: "⚖️",
            color: "from-amber-500 to-orange-600",
            target: "#sort-controls",
            path: "/",
        },
        {
            title: t('tutorialResultsTitle'),
            description: t('tutorialResultsDesc'),
            icon: "🎯",
            color: "from-emerald-500 to-teal-600",
            target: "#first-job-card",
            path: "/",
        },
        {
            title: t('tutorialAppsTitle'),
            description: t('tutorialAppsDesc'),
            icon: "📁",
            color: "from-teal-500 to-cyan-600",
            target: "#sidebar-nav", // Or more specifically the third link if possible, but #sidebar-nav is safer
            path: "/?filter=applications",
        }
    ];
    const [currentStep, setCurrentStep] = useState(0);
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
    const router = useRouter();
    const pathname = usePathname();
    const observerRef = useRef<MutationObserver | null>(null);

    const step = steps[currentStep];

    // Update target rect when step or pathname changes
    const updateTargetRect = () => {
        if (step.target) {
            const el = document.querySelector(step.target);
            if (el) {
                setTargetRect(el.getBoundingClientRect());
            } else {
                setTargetRect(null);
            }
        } else {
            setTargetRect(null);
        }
    };

    useLayoutEffect(() => {
        if (!isOpen) return;

        // Wait a bit for page transitions if path changes
        const timer = setTimeout(updateTargetRect, 300);

        // Also observe DOM changes (e.g. jobs loading)
        observerRef.current = new MutationObserver(updateTargetRect);
        observerRef.current.observe(document.body, { childList: true, subtree: true });

        window.addEventListener('resize', updateTargetRect);
        window.addEventListener('scroll', updateTargetRect, true);

        return () => {
            clearTimeout(timer);
            observerRef.current?.disconnect();
            window.removeEventListener('resize', updateTargetRect);
            window.removeEventListener('scroll', updateTargetRect, true);
        };
    }, [isOpen, currentStep, pathname]);

    if (!isOpen) return null;

    const nextStep = () => {
        if (currentStep < steps.length - 1) {
            const next = steps[currentStep + 1];
            if (next.path && pathname !== next.path) {
                router.push(next.path);
            }
            setCurrentStep(currentStep + 1);
        } else {
            onClose();
        }
    };

    const prevStep = () => {
        if (currentStep > 0) {
            const prev = steps[currentStep - 1];
            if (prev.path && pathname !== prev.path) {
                router.push(prev.path);
            }
            setCurrentStep(currentStep - 1);
        }
    };

    const progress = ((currentStep + 1) / steps.length) * 100;

    // Calculate bubble position
    let bubbleStyle: React.CSSProperties = {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 100,
    };

    if (targetRect) {
        const margin = 20;
        const isSidebar = step.target === "#sidebar-nav";

        if (isSidebar) {
            bubbleStyle = {
                position: 'fixed',
                top: targetRect.top,
                left: targetRect.right + margin,
                width: '320px',
                zIndex: 101,
            }
        } else if (targetRect.top > window.innerHeight / 2) {
            // Position above
            bubbleStyle = {
                position: 'fixed',
                bottom: window.innerHeight - targetRect.top + margin,
                left: Math.max(margin, Math.min(window.innerWidth - 340, targetRect.left + targetRect.width / 2 - 160)),
                width: '320px',
                zIndex: 101,
            };
        } else {
            // Position below
            bubbleStyle = {
                position: 'fixed',
                top: targetRect.bottom + margin,
                left: Math.max(margin, Math.min(window.innerWidth - 340, targetRect.left + targetRect.width / 2 - 160)),
                width: '320px',
                zIndex: 101,
            };
        }
    }

    return (
        <div className="fixed inset-0 z-[100] pointer-events-none">
            {/* Spotlight Backdrop */}
            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px] pointer-events-auto transition-opacity duration-500">
                {targetRect && (
                    <svg className="absolute inset-0 w-full h-full">
                        <defs>
                            <mask id="spotlight-mask">
                                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                                <rect
                                    x={targetRect.left - 8}
                                    y={targetRect.top - 8}
                                    width={targetRect.width + 16}
                                    height={targetRect.height + 16}
                                    rx="12"
                                    fill="black"
                                    className="transition-all duration-500"
                                />
                            </mask>
                        </defs>
                        <rect x="0" y="0" width="100%" height="100%" fill="black" opacity="0.1" mask="url(#spotlight-mask)" />
                        <rect
                            x={targetRect.left - 8}
                            y={targetRect.top - 8}
                            width={targetRect.width + 16}
                            height={targetRect.height + 16}
                            rx="12"
                            fill="none"
                            stroke="rgba(99, 102, 241, 0.5)"
                            strokeWidth="2"
                            className="transition-all duration-500 animate-pulse"
                        />
                    </svg>
                )}
            </div>

            {/* Content Bubble */}
            <div
                style={bubbleStyle}
                className="pointer-events-auto bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 fade-in duration-300"
            >
                <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800">
                    <div
                        className="h-full bg-indigo-600 transition-all duration-500 ease-out"
                        style={{ width: `${progress}%` }}
                    ></div>
                </div>

                <div className="p-6">
                    <div className="flex items-start gap-4 mb-4">
                        <div className={`w-12 h-12 flex-shrink-0 rounded-xl bg-gradient-to-br ${step.color} flex items-center justify-center text-2xl shadow-lg`}>
                            {step.icon}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">
                                {step.title}
                            </h2>
                            <div className="text-xs font-bold text-slate-400 mt-0.5">{t('stepOf', { n: currentStep + 1, m: steps.length })}</div>
                        </div>
                    </div>

                    <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-8">
                        {step.description}
                    </p>

                    <div className="flex items-center justify-between gap-3">
                        <button
                            onClick={prevStep}
                            disabled={currentStep === 0}
                            className={`text-sm font-semibold transition-all ${currentStep === 0
                                ? 'opacity-0 pointer-events-none'
                                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer'
                                }`}
                        >
                            {t('back')}
                        </button>

                        <div className="flex gap-1.5">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                            >
                                {t('skip')}
                            </button>
                            <button
                                onClick={nextStep}
                                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-lg shadow-lg shadow-indigo-500/25 transition active:scale-95 cursor-pointer"
                            >
                                {currentStep === steps.length - 1 ? t('start') : t('next')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <style jsx global>{`
        #spotlight-mask rect {
            transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }
      `}</style>
        </div>
    );
}
