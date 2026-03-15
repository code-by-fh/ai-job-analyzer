import { TranslationKey } from './languages';

export interface NavItemConfig {
    href: string;
    icon: string;
    /**
     * The key to use for translation.
     * If not provided, use `labelLiteral`.
     */
    labelKey?: TranslationKey;
    /**
     * Fallback literal label if no key is provided.
     */
    labelLiteral?: string;
    /**
     * If true, this item requires admin privileges.
     */
    requiresAdmin?: boolean;
    /**
     * If defined, specifies the required value of the 'filter' query parameter.
     * If explicitly null, specifies that the 'filter' parameter must be absent or not equal to 'applications'.
     */
    filterParam?: string | null;
    /**
     * Verification strategy for active state.
     */
    matchType?: 'exact' | 'startsWith';
    /**
     * Tailwind color class for the icon (e.g. 'text-blue-500')
     */
    color?: string;
}

export const MAIN_NAV_ITEMS: NavItemConfig[] = [
    {
        href: '/',
        icon: 'LayoutDashboard',
        labelKey: 'dashboard',
        matchType: 'exact',
        color: 'text-blue-500',
    },
    {
        href: '/listings',
        icon: 'List',
        labelKey: 'listings',
        matchType: 'startsWith',
        color: 'text-emerald-500',
    },
    {
        href: '/profile',
        icon: 'User',
        labelKey: 'profile',
        matchType: 'startsWith',
        color: 'text-violet-500',
    },
    {
        href: '/settings',
        icon: 'Settings',
        labelKey: 'settings',
        matchType: 'startsWith',
        color: 'text-slate-500',
    },
    {
        href: '/account',
        icon: 'Key',
        labelKey: 'account',
        matchType: 'startsWith',
        color: 'text-cyan-500',
    },
    {
        href: '/companies',
        icon: 'Building2',
        labelKey: 'companies',
        matchType: 'startsWith',
        color: 'text-orange-500',
    },
    {
        href: '/archive',
        icon: 'Archive',
        labelKey: 'archivePageTitle',
        matchType: 'startsWith',
        color: 'text-slate-400',
    },
];

export const ADMIN_NAV_ITEMS: NavItemConfig[] = [
    {
        href: '/admin/users',
        icon: 'ShieldCheck',
        labelKey: 'userManagement',
        matchType: 'startsWith',
        requiresAdmin: true,
        color: 'text-rose-500',
    },
    {
        href: '/admin/settings',
        icon: 'Settings2',
        labelLiteral: 'System Settings',
        matchType: 'startsWith',
        requiresAdmin: true,
        color: 'text-indigo-500',
    }
];
