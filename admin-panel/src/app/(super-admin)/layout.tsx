'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Shield, LogOut, ChevronLeft } from 'lucide-react';
import Loading from '@/components/Loading';

function SuperAdminContent({ children }: { children: React.ReactNode }) {
    const { user, role, loading, logout } = useAuth();
    const router = useRouter();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        }
        if (!loading && user && role !== 'super_admin') {
            router.push('/');
        }
    }, [user, role, loading, router]);

    if (loading) {
        return <Loading />;
    }

    if (!user || role !== 'super_admin') {
        return null;
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Super Admin Sidebar */}
            <aside
                className={`fixed left-0 top-0 h-screen bg-card border-r border-divider text-text-main transition-all duration-300 z-50 flex flex-col ${sidebarCollapsed ? 'w-16' : 'w-64'
                    }`}
            >
                {/* Header */}
                <div className="p-4 border-b border-divider/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex-shrink-0">
                            <Shield size={20} className="text-white" />
                        </div>
                        {!sidebarCollapsed && (
                            <div className="overflow-hidden">
                                <p className="font-bold text-sm text-text-main truncate">Super Admin</p>
                                <p className="text-xs text-text-muted truncate">Platform Control</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Nav */}
                <nav className="flex-1 p-3">
                    <div
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-violet-500/10 text-violet-400 cursor-default"
                    >
                        <Shield size={20} />
                        {!sidebarCollapsed && <span className="font-medium text-sm">Control Panel</span>}
                    </div>
                </nav>

                {/* Footer */}
                <div className="p-3 border-t border-divider/50 space-y-1">
                    <button
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-text-muted hover:text-text-main hover:bg-surface/50 transition-all"
                    >
                        <ChevronLeft size={20} className={`transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} />
                        {!sidebarCollapsed && <span className="text-sm">Collapse</span>}
                    </button>
                    <button
                        onClick={logout}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-400 hover:bg-red-500/10 transition-all"
                    >
                        <LogOut size={20} />
                        {!sidebarCollapsed && <span className="text-sm">Sign Out</span>}
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className={`min-h-screen transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
                {children}
            </main>
        </div>
    );
}

export default function SuperAdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <SuperAdminContent>{children}</SuperAdminContent>
    );
}
