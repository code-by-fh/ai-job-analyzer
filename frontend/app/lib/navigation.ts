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
}

export const MAIN_NAV_ITEMS: NavItemConfig[] = [
    {
        href: '/',
        icon: 'LayoutDashboard',
        labelKey: 'dashboard',
        matchType: 'exact',
    },
    {
        href: '/listings',
        icon: 'List',
        labelKey: 'listings',
        matchType: 'startsWith',
    },
    {
        href: '/profile',
        icon: 'User',
        labelKey: 'profile',
        matchType: 'startsWith',
    },
    {
        href: '/settings',
        icon: 'Settings',
        labelKey: 'settings',
        matchType: 'startsWith',
    },
    {
        href: '/account',
        icon: 'Key',
        labelKey: 'account',
        matchType: 'startsWith',
    },
    {
        href: '/companies',
        icon: 'Building2',
        labelKey: 'companies',
        matchType: 'startsWith',
    },
    {
        href: '/archive',
        icon: 'Archive',
        labelKey: 'archiv',
        matchType: 'startsWith',
    },
];

export const ADMIN_NAV_ITEMS: NavItemConfig[] = [
    {
        href: '/admin/users',
        icon: 'ShieldCheck',
        labelKey: 'userManagement',
        matchType: 'startsWith',
        requiresAdmin: true
    },
    {
        href: '/admin/settings',
        icon: 'Settings2',
        labelLiteral: 'System Settings',
        matchType: 'startsWith',
        requiresAdmin: true
    }
];
