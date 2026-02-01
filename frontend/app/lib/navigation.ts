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
        icon: '🏠',
        labelKey: 'dashboard',
        matchType: 'exact',
        filterParam: null // Represents "Dashboard" (no applications filter)
    },
    {
        href: '/?filter=applications',
        icon: '📁',
        labelKey: 'applications',
        matchType: 'exact',
        filterParam: 'applications'
    },
    {
        href: '/settings',
        icon: '⚙️',
        labelKey: 'settings',
        matchType: 'exact'
    }
];

export const ADMIN_NAV_ITEMS: NavItemConfig[] = [
    {
        href: '/admin/users',
        icon: '🛡️',
        labelKey: 'adminUsers',
        matchType: 'startsWith',
        requiresAdmin: true
    },
    {
        href: '/admin/settings',
        icon: '🔧',
        labelLiteral: 'System Settings',
        matchType: 'startsWith',
        requiresAdmin: true
    }
];
