'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Loading from '@/components/Loading';
import { UIProvider, useUI } from '@/lib/ui-context';
import { TenantProvider, useTenant } from '@/lib/tenant-context';

// Map route prefixes to feature flag keys
const ROUTE_FEATURE_MAP: Record<string, string> = {
    '/payouts': 'payouts',
    '/earnings': 'payouts',
    '/pay-adjustments': 'payouts',
    '/finance': 'reports',
    '/logs': 'reports',
    '/assignments': 'auto_assign',
    '/drivers': 'driver_tracking',
    '/live-tracking': 'driver_tracking',
};

function DashboardContent({ children }: { children: React.ReactNode }) {
    const { user, role, loading } = useAuth();
    const { sidebarCollapsed } = useUI();
    const { isFeatureEnabled, loading: tenantLoading } = useTenant();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        }
        // Super admin should go to their own panel
        if (!loading && user && role === 'super_admin') {
            router.push('/super-admin');
            return;
        }
        if (!loading && user && !['admin', 'tenant_admin', 'dispatcher', 'driver'].includes(role || '')) {
            router.push('/login?error=unauthorized');
        }
    }, [user, role, loading, router]);

    // Route protection: redirect if feature is disabled
    useEffect(() => {
        if (loading || tenantLoading) return;
        for (const [routePrefix, featureKey] of Object.entries(ROUTE_FEATURE_MAP)) {
            if (pathname.startsWith(routePrefix) && !isFeatureEnabled(featureKey)) {
                router.push('/');
                return;
            }
        }
    }, [pathname, loading, tenantLoading, isFeatureEnabled, router]);

    if (loading || tenantLoading) {
        return <Loading />;
    }

    if (!user || !['admin', 'tenant_admin', 'dispatcher', 'driver'].includes(role || '')) {
        return null;
    }

    return (
        <div className="min-h-screen bg-background">
            <Sidebar />
            <main className={`min-h-screen transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
                {children}
            </main>
        </div>
    );
}

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <UIProvider>
            <TenantProvider>
                <DashboardContent>{children}</DashboardContent>
            </TenantProvider>
        </UIProvider>
    );
}
