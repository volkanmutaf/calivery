
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useTenant } from '@/lib/tenant-context';
import { useUI } from '@/lib/ui-context';
import {
    LayoutDashboard,
    Package,
    Users,
    UserCog,
    Route,
    DollarSign,
    FileText,
    Settings,
    LogOut,
    ChevronLeft,
    ChevronRight,
    Banknote,
    History,
    Shield,
    Bell,
    MapPin
} from 'lucide-react';


export default function Sidebar() {

    const pathname = usePathname();
    const { profile, role, logout } = useAuth();
    const { isFeatureEnabled, tenant } = useTenant();
    const { sidebarCollapsed, toggleSidebar } = useUI();

    const navSections = [
        {
            title: 'Main',
            items: [
                { href: '/', label: 'Dashboard', icon: LayoutDashboard },
                { href: '/orders', label: 'Orders', icon: Package },
                { href: '/live-tracking', label: 'Live Tracking', icon: MapPin, featureKey: 'driver_tracking' },
                { href: '/assignments', label: 'Assignments', icon: Route, featureKey: 'auto_assign' },
                { href: '/drivers', label: 'Drivers', icon: UserCog },
                { href: '/notifications', label: 'Notifications', icon: Bell },
                { href: '/logs', label: 'Logs', icon: FileText, featureKey: 'reports' },
                { href: '/settings', label: 'Settings', icon: Settings },
            ]
        },
        {
            title: 'Finance & Pay',
            items: [
                { href: '/finance', label: 'Finance', icon: DollarSign, featureKey: 'reports' },
                { href: '/earnings', label: 'Driver Earnings', icon: DollarSign, featureKey: 'payouts' },
                { href: '/pay-adjustments', label: 'Pay Adjustments', icon: DollarSign, featureKey: 'payouts' },
            ]
        },
        {
            title: 'Payouts',
            items: [
                { href: '/payouts/weekly', label: 'Weekly Payroll', icon: Banknote, featureKey: 'payouts' },
                { href: '/payouts/history', label: 'Payout History', icon: History, featureKey: 'payouts' },
            ]
        }
    ];

    // Add Super Admin section if role is super_admin
    const allSections = [...navSections];
    if (role === 'super_admin') {
        allSections.unshift({
            title: 'Platform',
            items: [
                { href: '/super-admin', label: 'Super Admin', icon: Shield },
            ]
        });
    }

    // Filter nav sections by feature flags
    const filteredSections = allSections.map(section => ({
        ...section,
        items: section.items.filter(item =>
            !item.featureKey || isFeatureEnabled(item.featureKey)
        ),
    })).filter(section => section.items.length > 0);

    return (
        <aside
            className={`fixed left-0 top-0 h-screen bg-card border-r border-divider text-text-main transition-all duration-300 z-50 flex flex-col ${sidebarCollapsed ? 'w-16' : 'w-64'
                } `}
        >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-divider">
                {!sidebarCollapsed && (
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-20 h-20 shrink-0 flex items-center justify-center -ml-2">
                            <img src={tenant?.logo_url || '/logo-nb.png'} alt={tenant?.brand_name || 'Calivery'} className="w-20 h-20 object-contain drop-shadow-md" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="font-bold text-xl truncate">{tenant?.brand_name || 'Calivery'}</h1>
                            <p className="text-xs text-text-muted truncate">Admin Panel</p>
                        </div>
                    </div>
                )}
                {sidebarCollapsed && (
                    <div className="w-12 h-12 shrink-0 flex items-center justify-center mx-auto">
                        <img src={tenant?.logo_url || '/logo-nb.png'} alt={tenant?.brand_name || 'Calivery'} className="w-12 h-12 object-contain drop-shadow-md" />
                    </div>
                )}
                <button
                    onClick={toggleSidebar}
                    className="p-1.5 rounded-lg hover:bg-surface transition-colors absolute right-2 top-4 text-text-muted hover:text-text-main z-10 bg-card border border-divider shadow-sm"
                    style={sidebarCollapsed ? { right: '-12px', top: '24px' } : {}}
                >
                    {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={18} />}
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-4 px-2 overflow-y-auto overflow-x-hidden">
                <div className="space-y-6">
                    {filteredSections.map((section, idx) => (
                        <div key={section.title}>
                            {!sidebarCollapsed && idx > 0 && (
                                <div className="px-3 mb-2 mt-2">
                                    <div className="h-px bg-divider/50 mb-4" />
                                    <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">{section.title}</h3>
                                </div>
                            )}
                            {sidebarCollapsed && idx > 0 && <div className="h-px bg-divider/50 mx-2 my-2" />}

                            <ul className="space-y-1">
                                {section.items.map((item) => {
                                    const isActive = pathname === item.href ||
                                        (item.href !== '/' && pathname.startsWith(item.href));
                                    const Icon = item.icon;

                                    return (
                                        <li key={item.href}>
                                            <Link
                                                href={item.href}
                                                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${isActive
                                                    ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
                                                    : 'hover:bg-surface text-text-muted hover:text-text-main'
                                                    } `}
                                                title={sidebarCollapsed ? item.label : undefined}
                                            >
                                                <Icon size={20} className="shrink-0" />
                                                {!sidebarCollapsed && <span className="font-medium truncate">{item.label}</span>}
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </div>
            </nav>

            {/* User section */}
            <div className="p-4 border-t border-divider">
                {!sidebarCollapsed ? (
                    <div className="flex items-center gap-3 mb-3 overflow-hidden">
                        <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center font-semibold text-slate-900">
                            {profile?.username?.charAt(0).toUpperCase() || 'A'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-medium truncate text-text-main">{profile?.username || 'Admin'}</p>
                            <p className="text-xs text-text-muted truncate">{profile?.email || 'admin@calivery.com'}</p>
                        </div>
                    </div>
                ) : (
                    <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center font-semibold text-slate-900 mx-auto mb-3">
                        {profile?.username?.charAt(0).toUpperCase() || 'A'}
                    </div>
                )}
                <button
                    onClick={logout}
                    className={`flex items-center gap-3 w-full px-3 py-2 rounded-xl text-text-muted hover:bg-red-500/10 hover:text-red-400 transition-colors ${sidebarCollapsed ? 'justify-center' : ''
                        } `}
                    title={sidebarCollapsed ? 'Sign Out' : undefined}
                >
                    <LogOut size={18} className="shrink-0" />
                    {!sidebarCollapsed && <span className="text-sm truncate">Sign Out</span>}
                </button>
            </div>
        </aside>
    );
}
