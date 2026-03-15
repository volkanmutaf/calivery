'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { firebaseDb, firebaseFunctions } from '@/lib/firebase';
import { useNotification } from '@/lib/notification-context';
import {
    Shield,
    Plus,
    Settings as SettingsIcon,
    UserPlus,
    RefreshCw,
    X,
    Check,
    Building2,
    Palette,
    Users,
    Zap,
    ChevronDown,
    ChevronUp,
    Eye,
    EyeOff,
    Mail,
    Trash2,
    ShieldBan,
    CheckCircle,
    AlertTriangle
} from 'lucide-react';
import type { Tenant, FeatureFlags, TenantLimits } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────

interface TenantWithId extends Tenant {
    id: string;
    admins?: { uid: string; email: string; username: string }[];
}

interface TenantConfigData {
    features: FeatureFlags;
    limits: TenantLimits;
}

const DEFAULT_FEATURES: FeatureFlags = {
    driver_tracking: true,
    payouts: true,
    reports: true,
    sms_notifications: false,
    analytics: false,
    auto_assign: false,
};

const DEFAULT_LIMITS: TenantLimits = {
    max_drivers: 100,
    max_dispatchers: 10,
};

const FEATURE_LABELS: Record<keyof FeatureFlags, string> = {
    driver_tracking: 'Driver Tracking',
    payouts: 'Payouts',
    reports: 'Reports',
    sms_notifications: 'SMS Notifications',
    analytics: 'Analytics',
    auto_assign: 'Auto Assignment',
};

// ─── Page Component ────────────────────────────────────────────────────

export default function SuperAdminPage() {
    const { role, loading: authLoading } = useAuth();
    const { showNotification } = useNotification();

    // ── State ─────────────────────────────────────────────────────────
    const [tenants, setTenants] = useState<TenantWithId[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedTenant, setExpandedTenant] = useState<string | null>(null);

    // Modal states
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [showCreateAdminModal, setShowCreateAdminModal] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [showAdminPassword, setShowAdminPassword] = useState(false);

    // Create tenant form
    const [createForm, setCreateForm] = useState({
        tenant_id: '',
        name: '',
        brand_name: '',
        logo_url: '',
        primary_color: '#F59E0B',
        secondary_color: '#10B981',
    });

    // Config editor state
    const [configTenantId, setConfigTenantId] = useState('');
    const [configFeatures, setConfigFeatures] = useState<FeatureFlags>({ ...DEFAULT_FEATURES });
    const [configLimits, setConfigLimits] = useState<TenantLimits>({ ...DEFAULT_LIMITS });

    // Assign admin form
    const [assignForm, setAssignForm] = useState({
        uid: '',
        tenant_id: '',
        role: 'tenant_admin' as 'tenant_admin' | 'dispatcher' | 'driver',
    });

    // Create admin form
    const [createAdminForm, setCreateAdminForm] = useState({
        email: '',
        password: '',
        username: '',
        tenant_id: '',
        role: 'tenant_admin' as 'tenant_admin' | 'dispatcher' | 'driver',
    });

    // ── Fetch Tenants ─────────────────────────────────────────────────
    const fetchTenants = useCallback(async () => {
        setLoading(true);
        try {
            const snap = await getDocs(collection(firebaseDb, 'tenants'));
            const tenantsData: TenantWithId[] = [];
            snap.forEach((d) => {
                tenantsData.push({ id: d.id, ...d.data() } as TenantWithId);
            });
            tenantsData.sort((a, b) => a.name.localeCompare(b.name));

            // Fetch active admins and tenant_admins
            const profilesSnap = await getDocs(query(
                collection(firebaseDb, 'profiles'),
                where('role', 'in', ['admin', 'tenant_admin'])
            ));

            const adminsByTenant = new Map<string, { uid: string; email: string; username: string }[]>();

            profilesSnap.forEach(doc => {
                const data = doc.data();
                if (data.tenant_id && data.is_active !== false) {
                    if (!adminsByTenant.has(data.tenant_id)) {
                        adminsByTenant.set(data.tenant_id, []);
                    }
                    adminsByTenant.get(data.tenant_id)!.push({
                        uid: doc.id,
                        email: data.email || 'No email',
                        username: data.username || 'No name'
                    });
                }
            });

            for (const tenant of tenantsData) {
                tenant.admins = adminsByTenant.get(tenant.id) || [];
            }

            setTenants(tenantsData);
        } catch (error) {
            console.error('Error fetching tenants:', error);
            showNotification('Failed to load tenants', 'error');
        } finally {
            setLoading(false);
        }
    }, [showNotification]);

    useEffect(() => {
        if (!authLoading && role === 'super_admin') {
            fetchTenants();
        }
    }, [role, authLoading, fetchTenants]);

    // ── Handlers ──────────────────────────────────────────────────────

    const handleCreateTenant = async () => {
        if (!createForm.tenant_id || !createForm.name || !createForm.brand_name) {
            showNotification('Please fill in all required fields', 'error');
            return;
        }

        if (!/^[a-z0-9_-]+$/.test(createForm.tenant_id)) {
            showNotification('Tenant ID must be lowercase alphanumeric with dashes/underscores only', 'error');
            return;
        }

        setActionLoading(true);
        try {
            const fn = httpsCallable(firebaseFunctions, 'createTenant');
            await fn(createForm);
            showNotification('Tenant created successfully', 'success');
            setShowCreateModal(false);
            setCreateForm({
                tenant_id: '', name: '', brand_name: '', logo_url: '',
                primary_color: '#F59E0B', secondary_color: '#10B981',
            });
            fetchTenants();
        } catch (error: unknown) {
            const err = error as { message?: string };
            showNotification(err.message || 'Failed to create tenant', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const openConfigEditor = async (tenantId: string) => {
        setConfigTenantId(tenantId);
        setActionLoading(true);
        try {
            const configDoc = await getDoc(
                doc(firebaseDb, 'tenants', tenantId, 'config', 'settings')
            );
            if (configDoc.exists()) {
                const data = configDoc.data() as TenantConfigData;
                setConfigFeatures({ ...DEFAULT_FEATURES, ...data.features });
                setConfigLimits({ ...DEFAULT_LIMITS, ...data.limits });
            } else {
                setConfigFeatures({ ...DEFAULT_FEATURES });
                setConfigLimits({ ...DEFAULT_LIMITS });
            }
            setShowConfigModal(true);
        } catch (error) {
            console.error('Error loading config:', error);
            showNotification('Failed to load tenant config', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleSaveConfig = async () => {
        setActionLoading(true);
        try {
            const fn = httpsCallable(firebaseFunctions, 'updateTenantConfig');
            await fn({
                tenant_id: configTenantId,
                features: configFeatures,
                limits: configLimits,
            });
            showNotification('Tenant configuration updated', 'success');
            setShowConfigModal(false);
        } catch (error: unknown) {
            const err = error as { message?: string };
            showNotification(err.message || 'Failed to update config', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleAssignRole = async () => {
        if (!assignForm.uid || !assignForm.tenant_id || !assignForm.role) {
            showNotification('Please fill in all fields', 'error');
            return;
        }

        setActionLoading(true);
        try {
            const fn = httpsCallable(firebaseFunctions, 'setTenantClaims');
            await fn(assignForm);
            showNotification('User role assigned successfully', 'success');
            setShowAssignModal(false);
            setAssignForm({ uid: '', tenant_id: '', role: 'tenant_admin' });
        } catch (error: unknown) {
            const err = error as { message?: string };
            showNotification(err.message || 'Failed to assign role', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleCreateAdmin = async () => {
        const { email, password, username, tenant_id, role: adminRole } = createAdminForm;

        if (!email || !password || !username || !tenant_id || !adminRole) {
            showNotification('Please fill in all fields', 'error');
            return;
        }

        if (password.length < 6) {
            showNotification('Password must be at least 6 characters', 'error');
            return;
        }

        setActionLoading(true);
        try {
            const fn = httpsCallable(firebaseFunctions, 'createTenantAdmin');
            const result = await fn(createAdminForm);
            const data = result.data as { success: boolean; uid: string };
            showNotification(`User created successfully! UID: ${data.uid}`, 'success');
            setShowCreateAdminModal(false);
            setCreateAdminForm({ email: '', password: '', username: '', tenant_id: '', role: 'tenant_admin' });
            setShowAdminPassword(false);
        } catch (error: unknown) {
            const err = error as { message?: string };
            showNotification(err.message || 'Failed to create user', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleToggleTenantStatus = async (tenantId: string, currentStatus: string) => {
        if (!confirm(`Are you sure you want to ${currentStatus === 'active' ? 'suspend' : 'activate'} this tenant?`)) return;

        setActionLoading(true);
        try {
            const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
            const fn = httpsCallable(firebaseFunctions, 'updateTenantStatus');
            await fn({ tenant_id: tenantId, status: newStatus });
            showNotification(`Tenant ${newStatus} successfully`, 'success');
            fetchTenants(); // refresh list
        } catch (error: unknown) {
            const err = error as { message?: string };
            showNotification(err.message || 'Failed to update tenant status', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeleteTenant = async (tenantId: string) => {
        const confirmPhrase = prompt(`WARNING: This will permanently delete the tenant and its configuration.\nType the exact word "DELETE" to confirm.`);
        if (confirmPhrase !== 'DELETE') return;

        setActionLoading(true);
        try {
            const fn = httpsCallable(firebaseFunctions, 'deleteTenant');
            await fn({ tenant_id: tenantId });
            showNotification('Tenant deleted successfully', 'success');
            setExpandedTenant(null); // close if expanded
            fetchTenants(); // refresh list
        } catch (error: unknown) {
            const err = error as { message?: string };
            showNotification(err.message || 'Failed to delete tenant', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    // ── Loading ───────────────────────────────────────────────────────
    if (authLoading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <RefreshCw size={32} className="text-violet-500 animate-spin" />
            </div>
        );
    }

    if (role !== 'super_admin') return null;

    // ── Render ────────────────────────────────────────────────────────
    return (
        <div className="p-8 max-w-7xl mx-auto">
            {/* ─── Header ────────────────────────────────────────── */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-purple-500/20">
                        <Shield size={28} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-text-main">Super Admin Control Panel</h1>
                        <p className="text-text-muted mt-0.5">Manage tenants, features, and platform access</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => fetchTenants()}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface border border-divider text-text-muted hover:text-text-main transition-all disabled:opacity-50"
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-semibold hover:from-violet-400 hover:to-purple-500 transition-all shadow-lg shadow-purple-500/20"
                    >
                        <Plus size={18} />
                        New Tenant
                    </button>
                </div>
            </div>

            {/* ─── Quick Actions ──────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-4 p-5 rounded-2xl bg-card/50 backdrop-blur border border-divider/50 hover:border-violet-500/50 hover:bg-card transition-all group"
                >
                    <div className="p-3 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 group-hover:from-violet-500 group-hover:to-purple-500 transition-all">
                        <Building2 size={22} className="text-violet-400 group-hover:text-white transition-colors" />
                    </div>
                    <div className="text-left">
                        <p className="font-semibold text-text-main">Create Tenant</p>
                        <p className="text-sm text-text-muted">Add a new company</p>
                    </div>
                </button>
                <button
                    onClick={() => {
                        setCreateAdminForm({ email: '', password: '', username: '', tenant_id: '', role: 'tenant_admin' });
                        setShowAdminPassword(false);
                        setShowCreateAdminModal(true);
                    }}
                    className="flex items-center gap-4 p-5 rounded-2xl bg-card/50 backdrop-blur border border-divider/50 hover:border-blue-500/50 hover:bg-card transition-all group"
                >
                    <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 group-hover:from-blue-500 group-hover:to-cyan-500 transition-all">
                        <UserPlus size={22} className="text-blue-400 group-hover:text-white transition-colors" />
                    </div>
                    <div className="text-left">
                        <p className="font-semibold text-text-main">Create User</p>
                        <p className="text-sm text-text-muted">New tenant user</p>
                    </div>
                </button>
                <button
                    onClick={() => {
                        setAssignForm({ uid: '', tenant_id: '', role: 'tenant_admin' });
                        setShowAssignModal(true);
                    }}
                    className="flex items-center gap-4 p-5 rounded-2xl bg-card/50 backdrop-blur border border-divider/50 hover:border-emerald-500/50 hover:bg-card transition-all group"
                >
                    <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 group-hover:from-emerald-500 group-hover:to-teal-500 transition-all">
                        <Users size={22} className="text-emerald-400 group-hover:text-white transition-colors" />
                    </div>
                    <div className="text-left">
                        <p className="font-semibold text-text-main">Reassign Role</p>
                        <p className="text-sm text-text-muted">Existing users</p>
                    </div>
                </button>
                <div className="flex items-center gap-4 p-5 rounded-2xl bg-card/50 backdrop-blur border border-divider/50">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20">
                        <Zap size={22} className="text-amber-400" />
                    </div>
                    <div className="text-left">
                        <p className="font-semibold text-text-main">{tenants.length}</p>
                        <p className="text-sm text-text-muted">Active Tenants</p>
                    </div>
                </div>
            </div>

            {/* ─── Tenant List ─────────────────────────────────────── */}
            <div className="bg-card/50 backdrop-blur rounded-2xl border border-divider/50 overflow-hidden">
                <div className="px-6 py-4 border-b border-divider/50 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-text-main flex items-center gap-2">
                        <Building2 size={20} className="text-violet-400" />
                        Tenants
                    </h2>
                    <span className="text-sm text-text-muted">{tenants.length} total</span>
                </div>

                {loading ? (
                    <div className="py-16 text-center">
                        <RefreshCw size={32} className="text-violet-500 mx-auto mb-4 animate-spin" />
                        <p className="text-text-muted">Loading tenants...</p>
                    </div>
                ) : tenants.length === 0 ? (
                    <div className="py-16 text-center">
                        <Building2 size={48} className="text-text-muted mx-auto mb-4 opacity-50" />
                        <p className="text-text-muted mb-4">No tenants yet</p>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="px-6 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-semibold"
                        >
                            Create Your First Tenant
                        </button>
                    </div>
                ) : (
                    <div className="divide-y divide-divider/30">
                        {tenants.map((tenant) => (
                            <div key={tenant.id}>
                                <div
                                    className="flex items-center justify-between px-6 py-4 hover:bg-surface/30 transition-colors cursor-pointer"
                                    onClick={() => setExpandedTenant(expandedTenant === tenant.id ? null : tenant.id)}
                                >
                                    <div className="flex items-center gap-4">
                                        <div
                                            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-inner"
                                            style={{
                                                background: `linear-gradient(135deg, ${tenant.primary_color || '#F59E0B'}, ${tenant.secondary_color || '#10B981'})`,
                                            }}
                                        >
                                            {tenant.brand_name?.charAt(0)?.toUpperCase() || 'T'}
                                        </div>
                                        <div>
                                            <p className="font-medium text-text-main">{tenant.name}</p>
                                            <p className="text-sm text-text-muted">
                                                <span className="font-mono text-xs bg-surface px-1.5 py-0.5 rounded">{tenant.id}</span>
                                                <span className="mx-2 text-divider">•</span>
                                                {tenant.brand_name}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${tenant.status === 'active'
                                            ? 'bg-emerald-500/20 text-emerald-400'
                                            : tenant.status === 'suspended'
                                                ? 'bg-red-500/20 text-red-400'
                                                : 'bg-slate-500/20 text-slate-400'
                                            }`}>
                                            {tenant.status || 'active'}
                                        </span>
                                        {expandedTenant === tenant.id ? (
                                            <ChevronUp size={18} className="text-text-muted" />
                                        ) : (
                                            <ChevronDown size={18} className="text-text-muted" />
                                        )}
                                    </div>
                                </div>

                                {expandedTenant === tenant.id && (
                                    <div className="px-6 pb-4 bg-surface/20">
                                        <div className="flex flex-wrap items-center gap-3 pt-2">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); openConfigEditor(tenant.id); }}
                                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors text-sm font-medium"
                                            >
                                                <SettingsIcon size={16} />
                                                Edit Config
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setAssignForm({ uid: '', tenant_id: tenant.id, role: 'tenant_admin' });
                                                    setShowAssignModal(true);
                                                }}
                                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors text-sm font-medium"
                                            >
                                                <UserPlus size={16} />
                                                Assign Admin
                                            </button>

                                            <div className="flex-1"></div>

                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleToggleTenantStatus(tenant.id, tenant.status);
                                                }}
                                                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium ${tenant.status === 'active'
                                                    ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
                                                    : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                                                    }`}
                                            >
                                                {tenant.status === 'active' ? (
                                                    <><ShieldBan size={16} /> Suspend</>
                                                ) : (
                                                    <><CheckCircle size={16} /> Activate</>
                                                )}
                                            </button>

                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteTenant(tenant.id);
                                                }}
                                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors text-sm font-medium ml-2"
                                            >
                                                <Trash2 size={16} />
                                                Delete
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                                            <div>
                                                <p className="text-xs text-text-muted mb-1">Logo URL</p>
                                                <p className="text-sm text-text-main truncate">{tenant.logo_url || '—'}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-text-muted mb-1">Primary Color</p>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-4 h-4 rounded" style={{ backgroundColor: tenant.primary_color || '#F59E0B' }} />
                                                    <span className="text-sm text-text-main font-mono">{tenant.primary_color || '#F59E0B'}</span>
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-xs text-text-muted mb-1">Secondary Color</p>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-4 h-4 rounded" style={{ backgroundColor: tenant.secondary_color || '#10B981' }} />
                                                    <span className="text-sm text-text-main font-mono">{tenant.secondary_color || '#10B981'}</span>
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-xs text-text-muted mb-1">Created</p>
                                                <p className="text-sm text-text-main">
                                                    {tenant.created_at
                                                        ? ((tenant.created_at as unknown as { toDate?: () => Date }).toDate
                                                            ? (tenant.created_at as unknown as { toDate: () => Date }).toDate().toLocaleDateString()
                                                            : new Date(tenant.created_at as unknown as string).toLocaleDateString())
                                                        : '—'}
                                                </p>
                                            </div>
                                            <div className="col-span-2 md:col-span-4 mt-2">
                                                <p className="text-xs text-text-muted mb-2">Assigned Admins</p>
                                                {tenant.admins && tenant.admins.length > 0 ? (
                                                    <div className="flex flex-wrap gap-2">
                                                        {tenant.admins.map(admin => (
                                                            <div key={admin.uid} className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                                                                <CheckCircle size={14} className="text-emerald-500" />
                                                                <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">{admin.email}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg w-fit">
                                                        <AlertTriangle size={14} className="text-amber-500" />
                                                        <span className="text-sm text-amber-600 dark:text-amber-400 font-medium">No Admin Assigned</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ═══ MODALS ═════════════════════════════════════════════ */}

            {/* ─── Create Tenant Modal ─────────────────────────────── */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-card rounded-2xl border border-divider w-full max-w-lg p-6 mx-4 shadow-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600">
                                    <Building2 size={20} className="text-white" />
                                </div>
                                <h2 className="text-xl font-bold text-text-main">Create Tenant</h2>
                            </div>
                            <button onClick={() => setShowCreateModal(false)} className="text-text-muted hover:text-text-main transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-text-muted mb-1.5">Tenant ID *</label>
                                <input
                                    type="text"
                                    value={createForm.tenant_id}
                                    onChange={(e) => setCreateForm({ ...createForm, tenant_id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
                                    className="w-full px-4 py-2.5 rounded-xl bg-surface border border-divider text-text-main placeholder-text-muted focus:outline-none focus:border-violet-500 font-mono text-sm"
                                    placeholder="acme-delivery"
                                />
                                <p className="text-xs text-text-muted mt-1">Lowercase, alphanumeric, dashes, underscores</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-text-muted mb-1.5">Company Name *</label>
                                    <input
                                        type="text"
                                        value={createForm.name}
                                        onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                                        className="w-full px-4 py-2.5 rounded-xl bg-surface border border-divider text-text-main placeholder-text-muted focus:outline-none focus:border-violet-500"
                                        placeholder="Acme Corp"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-text-muted mb-1.5">Brand Name *</label>
                                    <input
                                        type="text"
                                        value={createForm.brand_name}
                                        onChange={(e) => setCreateForm({ ...createForm, brand_name: e.target.value })}
                                        className="w-full px-4 py-2.5 rounded-xl bg-surface border border-divider text-text-main placeholder-text-muted focus:outline-none focus:border-violet-500"
                                        placeholder="AcmeDelivery"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-text-muted mb-1.5">Logo URL</label>
                                <input
                                    type="url"
                                    value={createForm.logo_url}
                                    onChange={(e) => setCreateForm({ ...createForm, logo_url: e.target.value })}
                                    className="w-full px-4 py-2.5 rounded-xl bg-surface border border-divider text-text-main placeholder-text-muted focus:outline-none focus:border-violet-500"
                                    placeholder="https://example.com/logo.png"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-text-muted mb-1.5">
                                        <Palette size={14} className="inline mr-1" />
                                        Primary Color
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={createForm.primary_color}
                                            onChange={(e) => setCreateForm({ ...createForm, primary_color: e.target.value })}
                                            className="w-10 h-10 rounded-lg border border-divider cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            value={createForm.primary_color}
                                            onChange={(e) => setCreateForm({ ...createForm, primary_color: e.target.value })}
                                            className="flex-1 px-3 py-2 rounded-xl bg-surface border border-divider text-text-main font-mono text-sm focus:outline-none focus:border-violet-500"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-text-muted mb-1.5">
                                        <Palette size={14} className="inline mr-1" />
                                        Secondary Color
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={createForm.secondary_color}
                                            onChange={(e) => setCreateForm({ ...createForm, secondary_color: e.target.value })}
                                            className="w-10 h-10 rounded-lg border border-divider cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            value={createForm.secondary_color}
                                            onChange={(e) => setCreateForm({ ...createForm, secondary_color: e.target.value })}
                                            className="flex-1 px-3 py-2 rounded-xl bg-surface border border-divider text-text-main font-mono text-sm focus:outline-none focus:border-violet-500"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Preview */}
                            <div className="rounded-xl border border-divider/50 p-4 bg-surface/50">
                                <p className="text-xs text-text-muted mb-2">Preview</p>
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                                        style={{ background: `linear-gradient(135deg, ${createForm.primary_color}, ${createForm.secondary_color})` }}
                                    >
                                        {createForm.brand_name?.charAt(0)?.toUpperCase() || '?'}
                                    </div>
                                    <div>
                                        <p className="font-medium text-text-main">{createForm.name || 'Company Name'}</p>
                                        <p className="text-sm text-text-muted">{createForm.brand_name || 'Brand Name'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-divider/50">
                            <button onClick={() => setShowCreateModal(false)} className="px-5 py-2.5 rounded-xl border border-divider text-text-muted hover:text-text-main transition-colors">
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateTenant}
                                disabled={actionLoading || !createForm.tenant_id || !createForm.name || !createForm.brand_name}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-semibold hover:from-violet-400 hover:to-purple-500 disabled:opacity-50 transition-all"
                            >
                                {actionLoading ? <RefreshCw size={18} className="animate-spin" /> : <Check size={18} />}
                                Create Tenant
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Config Editor Modal ─────────────────────────────── */}
            {showConfigModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-card rounded-2xl border border-divider w-full max-w-lg p-6 mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600">
                                    <SettingsIcon size={20} className="text-white" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-text-main">Tenant Config</h2>
                                    <p className="text-sm text-text-muted font-mono">{configTenantId}</p>
                                </div>
                            </div>
                            <button onClick={() => setShowConfigModal(false)} className="text-text-muted hover:text-text-main transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        {/* Feature Flags */}
                        <div className="mb-6">
                            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
                                <Zap size={14} className="text-amber-400" />
                                Feature Flags
                            </h3>
                            <div className="space-y-1">
                                {(Object.keys(FEATURE_LABELS) as Array<keyof FeatureFlags>).map((key) => (
                                    <div key={key} className="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-surface/50 transition-colors">
                                        <span className="text-text-main font-medium">{FEATURE_LABELS[key]}</span>
                                        <button
                                            onClick={() => setConfigFeatures((prev) => ({ ...prev, [key]: !prev[key] }))}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-card ${configFeatures[key] ? 'bg-emerald-500' : 'bg-slate-600'
                                                }`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${configFeatures[key] ? 'translate-x-6' : 'translate-x-1'
                                                }`} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Limits */}
                        <div className="mb-6">
                            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
                                <Users size={14} className="text-blue-400" />
                                Limits
                            </h3>
                            <div className="space-y-4 px-4">
                                <div>
                                    <label className="block text-sm font-medium text-text-muted mb-1.5">Max Drivers</label>
                                    <input
                                        type="number" min={1}
                                        value={configLimits.max_drivers}
                                        onChange={(e) => setConfigLimits((prev) => ({ ...prev, max_drivers: parseInt(e.target.value) || 0 }))}
                                        className="w-full px-4 py-2.5 rounded-xl bg-surface border border-divider text-text-main focus:outline-none focus:border-violet-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-text-muted mb-1.5">Max Dispatchers</label>
                                    <input
                                        type="number" min={1}
                                        value={configLimits.max_dispatchers}
                                        onChange={(e) => setConfigLimits((prev) => ({ ...prev, max_dispatchers: parseInt(e.target.value) || 0 }))}
                                        className="w-full px-4 py-2.5 rounded-xl bg-surface border border-divider text-text-main focus:outline-none focus:border-violet-500"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-divider/50">
                            <button onClick={() => setShowConfigModal(false)} className="px-5 py-2.5 rounded-xl border border-divider text-text-muted hover:text-text-main transition-colors">
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveConfig}
                                disabled={actionLoading}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 font-semibold hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 transition-all"
                            >
                                {actionLoading ? <RefreshCw size={18} className="animate-spin" /> : <Check size={18} />}
                                Save Config
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Assign Admin Modal ──────────────────────────────── */}
            {showAssignModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-card rounded-2xl border border-divider w-full max-w-md p-6 mx-4 shadow-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
                                    <UserPlus size={20} className="text-white" />
                                </div>
                                <h2 className="text-xl font-bold text-text-main">Assign Tenant Role</h2>
                            </div>
                            <button onClick={() => setShowAssignModal(false)} className="text-text-muted hover:text-text-main transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-text-muted mb-1.5">User UID *</label>
                                <input
                                    type="text"
                                    value={assignForm.uid}
                                    onChange={(e) => setAssignForm({ ...assignForm, uid: e.target.value.trim() })}
                                    className="w-full px-4 py-2.5 rounded-xl bg-surface border border-divider text-text-main placeholder-text-muted focus:outline-none focus:border-emerald-500 font-mono text-sm"
                                    placeholder="Firebase Auth UID"
                                />
                                <p className="text-xs text-text-muted mt-1">Find this in Firebase Console → Authentication</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-text-muted mb-1.5">Tenant ID *</label>
                                {tenants.length > 0 ? (
                                    <select
                                        value={assignForm.tenant_id}
                                        onChange={(e) => setAssignForm({ ...assignForm, tenant_id: e.target.value })}
                                        className="w-full px-4 py-2.5 rounded-xl bg-surface border border-divider text-text-main focus:outline-none focus:border-emerald-500"
                                    >
                                        <option value="">Select a tenant...</option>
                                        {tenants.map((t) => (
                                            <option key={t.id} value={t.id}>{t.name} ({t.id})</option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        type="text"
                                        value={assignForm.tenant_id}
                                        onChange={(e) => setAssignForm({ ...assignForm, tenant_id: e.target.value })}
                                        className="w-full px-4 py-2.5 rounded-xl bg-surface border border-divider text-text-main placeholder-text-muted focus:outline-none focus:border-emerald-500 font-mono text-sm"
                                        placeholder="tenant-id"
                                    />
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-text-muted mb-1.5">Role *</label>
                                <select
                                    value={assignForm.role}
                                    onChange={(e) => setAssignForm({ ...assignForm, role: e.target.value as 'tenant_admin' | 'dispatcher' | 'driver' })}
                                    className="w-full px-4 py-2.5 rounded-xl bg-surface border border-divider text-text-main focus:outline-none focus:border-emerald-500"
                                >
                                    <option value="tenant_admin">Tenant Admin</option>
                                    <option value="dispatcher">Dispatcher</option>
                                    <option value="driver">Driver</option>
                                </select>
                            </div>

                            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
                                <p className="text-xs text-amber-400">
                                    <strong>Note:</strong> This will set Firebase Auth custom claims and update the user&apos;s profile.
                                    The user needs to log out and log back in for the changes to take effect.
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-divider/50">
                            <button onClick={() => setShowAssignModal(false)} className="px-5 py-2.5 rounded-xl border border-divider text-text-muted hover:text-text-main transition-colors">
                                Cancel
                            </button>
                            <button
                                onClick={handleAssignRole}
                                disabled={actionLoading || !assignForm.uid || !assignForm.tenant_id || !assignForm.role}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 transition-all"
                            >
                                {actionLoading ? <RefreshCw size={18} className="animate-spin" /> : <Check size={18} />}
                                Assign Role
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Create Tenant Admin Modal ───────────────────────── */}
            {showCreateAdminModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-card rounded-2xl border border-divider w-full max-w-md p-6 mx-4 shadow-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600">
                                    <UserPlus size={20} className="text-white" />
                                </div>
                                <h2 className="text-xl font-bold text-text-main">Create Tenant User</h2>
                            </div>
                            <button onClick={() => setShowCreateAdminModal(false)} className="text-text-muted hover:text-text-main transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-text-muted mb-1.5">Email *</label>
                                <div className="relative">
                                    <input
                                        type="email"
                                        value={createAdminForm.email}
                                        onChange={(e) => setCreateAdminForm({ ...createAdminForm, email: e.target.value })}
                                        className="w-full px-4 py-2.5 pl-10 rounded-xl bg-surface border border-divider text-text-main placeholder-text-muted focus:outline-none focus:border-blue-500"
                                        placeholder="admin@company.com"
                                    />
                                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-text-muted mb-1.5">Password *</label>
                                <div className="relative">
                                    <input
                                        type={showAdminPassword ? 'text' : 'password'}
                                        value={createAdminForm.password}
                                        onChange={(e) => setCreateAdminForm({ ...createAdminForm, password: e.target.value })}
                                        className="w-full px-4 py-2.5 pr-10 rounded-xl bg-surface border border-divider text-text-main placeholder-text-muted focus:outline-none focus:border-blue-500"
                                        placeholder="Min. 6 characters"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowAdminPassword(!showAdminPassword)}
                                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main transition-colors"
                                    >
                                        {showAdminPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-text-muted mb-1.5">Username *</label>
                                <input
                                    type="text"
                                    value={createAdminForm.username}
                                    onChange={(e) => setCreateAdminForm({ ...createAdminForm, username: e.target.value })}
                                    className="w-full px-4 py-2.5 rounded-xl bg-surface border border-divider text-text-main placeholder-text-muted focus:outline-none focus:border-blue-500"
                                    placeholder="john_doe"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-text-muted mb-1.5">Tenant *</label>
                                {tenants.length > 0 ? (
                                    <select
                                        value={createAdminForm.tenant_id}
                                        onChange={(e) => setCreateAdminForm({ ...createAdminForm, tenant_id: e.target.value })}
                                        className="w-full px-4 py-2.5 rounded-xl bg-surface border border-divider text-text-main focus:outline-none focus:border-blue-500"
                                    >
                                        <option value="">Select a tenant...</option>
                                        {tenants.map((t) => (
                                            <option key={t.id} value={t.id}>{t.name} ({t.id})</option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        type="text"
                                        value={createAdminForm.tenant_id}
                                        onChange={(e) => setCreateAdminForm({ ...createAdminForm, tenant_id: e.target.value })}
                                        className="w-full px-4 py-2.5 rounded-xl bg-surface border border-divider text-text-main placeholder-text-muted focus:outline-none focus:border-blue-500 font-mono text-sm"
                                        placeholder="tenant-id"
                                    />
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-text-muted mb-1.5">Role *</label>
                                <select
                                    value={createAdminForm.role}
                                    onChange={(e) => setCreateAdminForm({ ...createAdminForm, role: e.target.value as 'tenant_admin' | 'dispatcher' | 'driver' })}
                                    className="w-full px-4 py-2.5 rounded-xl bg-surface border border-divider text-text-main focus:outline-none focus:border-blue-500"
                                >
                                    <option value="tenant_admin">Tenant Admin</option>
                                    <option value="dispatcher">Dispatcher</option>
                                    <option value="driver">Driver</option>
                                </select>
                            </div>

                            <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-3">
                                <p className="text-xs text-blue-400">
                                    This will create a Firebase Auth user, set tenant claims, and create a Firestore profile — all in one step.
                                    The user can immediately log in with the provided credentials.
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-divider/50">
                            <button onClick={() => setShowCreateAdminModal(false)} className="px-5 py-2.5 rounded-xl border border-divider text-text-muted hover:text-text-main transition-colors">
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateAdmin}
                                disabled={actionLoading || !createAdminForm.email || !createAdminForm.password || !createAdminForm.username || !createAdminForm.tenant_id || !createAdminForm.role}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-600 text-white font-semibold hover:from-blue-400 hover:to-cyan-500 disabled:opacity-50 transition-all"
                            >
                                {actionLoading ? <RefreshCw size={18} className="animate-spin" /> : <Check size={18} />}
                                Create User
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
