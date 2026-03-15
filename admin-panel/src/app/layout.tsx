'use client';

import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { NotificationProvider } from '@/lib/notification-context';
import ThemeInit from "@/components/ThemeInit";
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Loading from '@/components/Loading';
import { UIProvider, useUI } from '@/lib/ui-context';
import { TenantProvider, useTenant } from '@/lib/tenant-context';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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

function AppContent({ children }: { children: React.ReactNode }) {
    const { user, role, loading } = useAuth();
    const { sidebarCollapsed } = useUI();
    const { isFeatureEnabled, loading: tenantLoading } = useTenant();
    const router = useRouter();
    const pathname = usePathname();

    const isLoginPage = pathname === '/login';
    const isTrackingPage = pathname.startsWith('/tracking/');
    const isSuperAdminPage = pathname.startsWith('/super-admin');

    useEffect(() => {
        if (loading) return;

        // Redirect to login if not authenticated
        if (!user && !isLoginPage && !isTrackingPage) {
            router.push('/login');
            return;
        }

        // Super admin should go to their own panel
        if (user && role === 'super_admin' && !isSuperAdminPage && !isSharePage) {
            router.push('/super-admin');
            return;
        }

        // Protect specific dashboard roles
        if (user && !isSuperAdminPage && !isLoginPage && !isTrackingPage && 
            !['admin', 'tenant_admin', 'dispatcher', 'driver'].includes(role || '')) {
            router.push('/login?error=unauthorized');
        }
    }, [user, role, loading, pathname, router, isLoginPage, isTrackingPage, isSuperAdminPage]);

    // Route protection: redirect if feature is disabled
    useEffect(() => {
        if (loading || tenantLoading || isLoginPage || isTrackingPage || isSuperAdminPage) return;

        for (const [routePrefix, featureKey] of Object.entries(ROUTE_FEATURE_MAP)) {
            if (pathname.startsWith(routePrefix) && !isFeatureEnabled(featureKey)) {
                router.push('/');
                return;
            }
        }
    }, [pathname, loading, tenantLoading, isFeatureEnabled, router, isLoginPage, isSharePage, isSuperAdminPage]);

    if (loading || (tenantLoading && !isLoginPage && !isSharePage)) {
        return <Loading />;
    }

    // Public or auth-less pages
    if (isLoginPage || isTrackingPage) {
        return <>{children}</>;
    }

    // Super Admin layout (minimal sidebar or just content)
    if (isSuperAdminPage) {
        return role === 'super_admin' ? <>{children}</> : null;
    }

    // Dashboard layout for normal users
    if (!user || !['admin', 'tenant_admin', 'dispatcher', 'driver'].includes(role || '')) {
        return null; // Redirecting...
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-text-main`}
      >
        <ThemeInit />
        <AuthProvider>
          <NotificationProvider>
            <UIProvider>
                <TenantProvider>
                    <AppContent>{children}</AppContent>
                </TenantProvider>
            </UIProvider>
          </NotificationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
