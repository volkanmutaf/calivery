'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNotification } from '@/lib/notification-context';
import { useTenant } from '@/lib/tenant-context';
import { useAuth } from '@/lib/auth-context';
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { firebaseDb, firebaseFunctions } from '@/lib/firebase';
import { Profile, UserRole } from '@/types';
import {
    Users,
    UserPlus,
    Pencil,
    Trash2,
    RefreshCw,
    KeyRound,
    Search,
    X,
    Check,
    AlertTriangle,
} from 'lucide-react';
import AddressInput from '@/components/AddressInput';

interface UserWithId extends Profile {
    id: string;
}

interface CreateUserData {
    email: string;
    password: string;
    username: string;
    role: UserRole;
    phone: string;
    driver_base_address: string;
    driver_base_lat: number;
    driver_base_lng: number;
    is_active: boolean;
    tenant_id?: string;
}

export default function UsersPage() {
    // const { t } = useTranslation();
    const router = useRouter();
    const { showNotification } = useNotification();
    const { tenantId } = useTenant();
    const { role: userRole } = useAuth();
    const [users, setUsers] = useState<UserWithId[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'driver'>('all');

    // Modal States
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState<UserWithId | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    // Form States
    const [formData, setFormData] = useState<CreateUserData>({
        email: '',
        password: '',
        username: '',
        role: 'driver',
        phone: '',
        driver_base_address: '',
        driver_base_lat: 34.0522,
        driver_base_lng: -118.2437,
        is_active: true,
    });
    const [newPassword, setNewPassword] = useState('');

    const fetchUsers = async () => {
        setLoading(true);
        try {
            let q = query(collection(firebaseDb, 'profiles'));
            
            // Only super_admin can see cross-tenant data. 
            // All other roles are strictly filtered by tenantId.
            if (userRole !== 'super_admin') {
                const filterId = tenantId || 'default';
                q = query(q, where('tenant_id', '==', filterId));
            }

            // ONLY show drivers in this list
            q = query(q, where('role', '==', 'driver'));
            const snapshot = await getDocs(q);
            const usersData: UserWithId[] = [];
            snapshot.forEach((doc) => {
                usersData.push({ id: doc.id, ...doc.data() } as UserWithId);
            });
            // Sort by role (admin first) then by username
            usersData.sort((a, b) => {
                if (a.role !== b.role) return a.role === 'admin' ? -1 : 1;
                return a.username.localeCompare(b.username);
            });
            setUsers(usersData);
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, [tenantId]);

    const filteredUsers = users.filter((user) => {
        const matchesSearch =
            user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
            user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            user.phone?.includes(searchQuery);
        const matchesRole = roleFilter === 'all' || user.role === roleFilter;
        return matchesSearch && matchesRole;
    });

    const resetForm = () => {
        setFormData({
            email: '',
            password: '',
            username: '',
            role: 'driver',
            phone: '',
            driver_base_address: '',
            driver_base_lat: 34.0522,
            driver_base_lng: -118.2437,
            is_active: true,
        });
        setNewPassword('');
        setActionError(null);
    };

    const handleCreate = async () => {
        setActionLoading(true);
        setActionError(null);
        try {
            const createUser = httpsCallable(firebaseFunctions, 'createUser');
            const dataToSubmit = { ...formData };
            if (tenantId && tenantId !== 'default') {
                dataToSubmit.tenant_id = tenantId;
            }
            await createUser(dataToSubmit);
            setShowCreateModal(false);
            resetForm();
            fetchUsers();
        } catch (error: unknown) {
            const err = error as { message?: string };
            setActionError(err.message || 'Failed to create user');
        } finally {
            setActionLoading(false);
        }
    };

    const handleUpdate = async () => {
        if (!selectedUser) return;
        setActionLoading(true);
        setActionError(null);
        try {
            const updateUser = httpsCallable(firebaseFunctions, 'updateUser');
            await updateUser({
                uid: selectedUser.id,
                username: formData.username,
                email: formData.email,
                phone: formData.phone,
                role: formData.role,
                is_active: formData.is_active,
                driver_base_address: formData.driver_base_address,
                driver_base_lat: formData.driver_base_lat,
                driver_base_lng: formData.driver_base_lng,
            });
            setShowEditModal(false);
            resetForm();
            setSelectedUser(null);
            fetchUsers();
        } catch (error: unknown) {
            const err = error as { message?: string };
            setActionError(err.message || 'Failed to update user');
        } finally {
            setActionLoading(false);
        }
    };

    const handlePasswordReset = async () => {
        if (!selectedUser || !newPassword) return;
        setActionLoading(true);
        setActionError(null);
        try {
            const updateUser = httpsCallable(firebaseFunctions, 'updateUser');
            await updateUser({
                uid: selectedUser.id,
                password: newPassword,
            });
            setShowPasswordModal(false);
            setNewPassword('');
            setSelectedUser(null);
            showNotification('Password reset successfully', 'success');
        } catch (error: unknown) {
            const err = error as { message?: string };
            setActionError(err.message || 'Failed to reset password');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedUser) return;
        setActionLoading(true);
        setActionError(null);
        try {
            const deleteUser = httpsCallable(firebaseFunctions, 'deleteUser');
            await deleteUser({ uid: selectedUser.id });
            setShowDeleteModal(false);
            setSelectedUser(null);
            fetchUsers();
        } catch (error: unknown) {
            const err = error as { message?: string };
            setActionError(err.message || 'Failed to delete user');
        } finally {
            setActionLoading(false);
        }
    };

    const openEditModal = (user: UserWithId) => {
        setSelectedUser(user);
        setFormData({
            email: user.email || '',
            password: '',
            username: user.username,
            role: user.role,
            phone: user.phone || '',
            driver_base_address: user.driver_base_address || '',
            driver_base_lat: user.driver_base_lat || 34.0522,
            driver_base_lng: user.driver_base_lng || -118.2437,
            is_active: user.is_active,
        });
        setShowEditModal(true);
    };

    return (
        <div className="p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-text-main">Driver & User Management</h1>
                    <p className="text-text-muted mt-1">Manage driver and admin accounts</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => fetchUsers()}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface border border-divider text-text-muted hover:text-text-main hover:border-divider transition-all disabled:opacity-50"
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                    <button
                        onClick={() => {
                            resetForm();
                            setShowCreateModal(true);
                        }}
                        className="flex items-center gap-2 px-6 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 font-semibold hover:from-amber-400 hover:to-orange-400 transition-all"
                    >
                        <UserPlus size={18} />
                        Add New User
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4 mb-6">
                <div className="relative flex-1 max-w-md">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                        type="text"
                        placeholder="Search name, email or phone..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-xl bg-surface border border-divider text-text-main placeholder-text-muted focus:outline-none focus:border-amber-500"
                    />
                </div>
                <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value as 'all' | 'admin' | 'driver')}
                    className="px-4 py-2 rounded-xl bg-surface border border-divider text-text-main focus:outline-none focus:border-amber-500"
                >
                    <option value="all">All Roles</option>
                    <option value="admin">Admin</option>
                    <option value="driver">Driver</option>
                </select>
            </div>

            {/* Users Table */}
            <div className="bg-card/50 backdrop-blur rounded-2xl border border-divider/50 overflow-hidden">
                {loading ? (
                    <div className="py-12 text-center">
                        <RefreshCw size={32} className="text-amber-500 mx-auto mb-4 animate-spin" />
                        <p className="text-text-muted">Loading...</p>
                    </div>
                ) : filteredUsers.length === 0 ? (
                    <div className="py-12 text-center">
                        <Users size={48} className="text-text-muted mx-auto mb-4" />
                        <p className="text-text-muted">No users found</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-divider/50">
                                <th className="px-6 py-4 text-left text-sm font-medium text-text-muted">Username</th>
                                <th className="px-6 py-4 text-left text-sm font-medium text-text-muted">Email</th>
                                <th className="px-6 py-4 text-left text-sm font-medium text-text-muted">Phone</th>
                                <th className="px-6 py-4 text-left text-sm font-medium text-text-muted">Role</th>
                                <th className="px-6 py-4 text-left text-sm font-medium text-text-muted">Status</th>
                                <th className="px-6 py-4 text-right text-sm font-medium text-text-muted">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-divider/50">
                            {filteredUsers.map((user) => (
                                <tr 
                                    key={user.id} 
                                    className={`hover:bg-surface/30 transition-colors ${user.role === 'driver' ? 'cursor-pointer' : ''}`}
                                    onClick={() => {
                                        if (user.role === 'driver') {
                                            router.push(`/drivers/${user.id}`);
                                        }
                                    }}
                                >
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${user.role === 'admin'
                                                ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white'
                                                : 'bg-gradient-to-br from-amber-500 to-orange-500 text-slate-900'
                                                }`}>
                                                {user.username.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="text-text-main font-medium">{user.username}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-text-muted">{user.email || '-'}</td>
                                    <td className="px-6 py-4 text-text-muted">{user.phone || '-'}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${user.role === 'admin'
                                            ? 'bg-purple-500/20 text-purple-400'
                                            : 'bg-amber-500/20 text-amber-400'
                                            }`}>
                                            {user.role === 'admin' ? 'Admin' : 'Driver'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <button
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                setActionLoading(true);
                                                try {
                                                    const updateUser = httpsCallable(firebaseFunctions, 'updateUser');
                                                    await updateUser({
                                                        uid: user.id,
                                                        is_active: !user.is_active,
                                                    });
                                                    fetchUsers();
                                                } catch (error) {
                                                    console.error('Error updating status:', error);
                                                    showNotification('Failed to update status', 'error');
                                                } finally {
                                                    setActionLoading(false);
                                                }
                                            }}
                                            disabled={actionLoading}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${user.is_active ? 'bg-emerald-500' : 'bg-slate-700'
                                                }`}
                                        >
                                            <span
                                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${user.is_active ? 'translate-x-6' : 'translate-x-1'
                                                    }`}
                                            />
                                        </button>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedUser(user);
                                                    setShowPasswordModal(true);
                                                }}
                                                title="Reset Password"
                                                className="p-2 rounded-lg bg-surface text-text-muted hover:text-amber-400 hover:bg-surface/80 transition-all"
                                            >
                                                <KeyRound size={16} />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openEditModal(user);
                                                }}
                                                title="Edit"
                                                className="p-2 rounded-lg bg-surface text-text-muted hover:text-blue-400 hover:bg-surface/80 transition-all"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedUser(user);
                                                    setShowDeleteModal(true);
                                                }}
                                                title="Delete"
                                                className="p-2 rounded-lg bg-surface text-text-muted hover:text-red-400 hover:bg-surface/80 transition-all"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Create User Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-card rounded-2xl border border-divider w-full max-w-lg p-6 mx-4">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-text-main">Create New User</h2>
                            <button onClick={() => setShowCreateModal(false)} className="text-text-muted hover:text-text-main">
                                <X size={24} />
                            </button>
                        </div>

                        {actionError && (
                            <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 text-sm">
                                {actionError}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-text-muted mb-1">Username *</label>
                                    <input
                                        type="text"
                                        value={formData.username}
                                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                        className="w-full px-4 py-2 rounded-xl bg-surface border border-divider text-text-main focus:outline-none focus:border-amber-500"
                                        placeholder="johndoe"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-text-muted mb-1">Role *</label>
                                    <select
                                        value={formData.role}
                                        onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                                        className="w-full px-4 py-2 rounded-xl bg-surface border border-divider text-text-main focus:outline-none focus:border-amber-500"
                                    >
                                        <option value="driver">Driver</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-text-muted mb-1">Email *</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full px-4 py-2 rounded-xl bg-surface border border-divider text-text-main focus:outline-none focus:border-amber-500"
                                    placeholder="john@calivery.app"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-text-muted mb-1">Password *</label>
                                <input
                                    type="password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    className="w-full px-4 py-2 rounded-xl bg-surface border border-divider text-text-main focus:outline-none focus:border-amber-500"
                                    placeholder="At least 6 characters"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-text-muted mb-1">Phone</label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    className="w-full px-4 py-2 rounded-xl bg-surface border border-divider text-text-main focus:outline-none focus:border-amber-500"
                                    placeholder="+1 234 567 8900"
                                />
                            </div>

                            {formData.role === 'driver' && (
                                <>
                                    <div>
                                        <label className="block text-sm text-text-muted mb-1">Base Address</label>
                                        <AddressInput
                                            value={formData.driver_base_address}
                                            onChange={(addr, lat, lng) => {
                                                setFormData(prev => ({
                                                    ...prev,
                                                    driver_base_address: addr,
                                                    driver_base_lat: lat || prev.driver_base_lat,
                                                    driver_base_lng: lng || prev.driver_base_lng,
                                                }));
                                            }}
                                            placeholder="123 Main St, Los Angeles, CA"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm text-text-muted mb-1">Latitude</label>
                                            <input
                                                type="number"
                                                step="0.0001"
                                                value={formData.driver_base_lat}
                                                onChange={(e) => setFormData({ ...formData, driver_base_lat: parseFloat(e.target.value) })}
                                                className="w-full px-4 py-2 rounded-xl bg-surface border border-divider text-text-main focus:outline-none focus:border-amber-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-text-muted mb-1">Longitude</label>
                                            <input
                                                type="number"
                                                step="0.0001"
                                                value={formData.driver_base_lng}
                                                onChange={(e) => setFormData({ ...formData, driver_base_lng: parseFloat(e.target.value) })}
                                                className="w-full px-4 py-2 rounded-xl bg-surface border border-divider text-text-main focus:outline-none focus:border-amber-500"
                                            />
                                        </div>
                                    </div>
                                </>
                            )}

                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="is_active"
                                    checked={formData.is_active}
                                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                    className="w-4 h-4 rounded border-divider bg-surface text-amber-500 focus:ring-amber-500"
                                />
                                <label htmlFor="is_active" className="text-text-muted">Active</label>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="px-4 py-2 rounded-xl border border-divider text-text-muted hover:text-text-main hover:border-text-muted"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={actionLoading || !formData.email || !formData.password || !formData.username}
                                className="flex items-center gap-2 px-6 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 font-semibold hover:from-amber-400 hover:to-orange-400 disabled:opacity-50"
                            >
                                {actionLoading ? <RefreshCw size={18} className="animate-spin" /> : <Check size={18} />}
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit User Modal */}
            {showEditModal && selectedUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-card rounded-2xl border border-divider w-full max-w-lg p-6 mx-4">

                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-text-main">Edit User</h2>
                            <button onClick={() => setShowEditModal(false)} className="text-text-muted hover:text-text-main">
                                <X size={24} />
                            </button>
                        </div>

                        {actionError && (
                            <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 text-sm">
                                {actionError}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-text-muted mb-1">Username</label>
                                    <input
                                        type="text"
                                        value={formData.username}
                                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                        className="w-full px-4 py-2 rounded-xl bg-surface border border-divider text-text-main focus:outline-none focus:border-amber-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-text-muted mb-1">Role</label>
                                    <select
                                        value={formData.role}
                                        onChange={(e) => setFormData({ ...formData, role: e.target.value as 'admin' | 'driver' })}
                                        className="w-full px-4 py-2 rounded-xl bg-surface border border-divider text-text-main focus:outline-none focus:border-amber-500"
                                    >
                                        <option value="driver">Driver</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-text-muted mb-1">Email</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full px-4 py-2 rounded-xl bg-surface border border-divider text-text-main focus:outline-none focus:border-amber-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-text-muted mb-1">Phone</label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    className="w-full px-4 py-2 rounded-xl bg-surface border border-divider text-text-main focus:outline-none focus:border-amber-500"
                                />
                            </div>

                            {formData.role === 'driver' && (
                                <>
                                    <div>
                                        <label className="block text-sm text-text-muted mb-1">Base Address</label>
                                        <AddressInput
                                            value={formData.driver_base_address}
                                            onChange={(addr, lat, lng) => {
                                                setFormData(prev => ({
                                                    ...prev,
                                                    driver_base_address: addr,
                                                    driver_base_lat: lat || prev.driver_base_lat,
                                                    driver_base_lng: lng || prev.driver_base_lng,
                                                }));
                                            }}
                                            placeholder="123 Main St, Los Angeles, CA"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm text-text-muted mb-1">Latitude</label>
                                            <input
                                                type="number"
                                                step="0.0001"
                                                value={formData.driver_base_lat}
                                                onChange={(e) => setFormData({ ...formData, driver_base_lat: parseFloat(e.target.value) })}
                                                className="w-full px-4 py-2 rounded-xl bg-surface border border-divider text-text-main focus:outline-none focus:border-amber-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-text-muted mb-1">Longitude</label>
                                            <input
                                                type="number"
                                                step="0.0001"
                                                value={formData.driver_base_lng}
                                                onChange={(e) => setFormData({ ...formData, driver_base_lng: parseFloat(e.target.value) })}
                                                className="w-full px-4 py-2 rounded-xl bg-surface border border-divider text-text-main focus:outline-none focus:border-amber-500"
                                            />
                                        </div>
                                    </div>
                                </>
                            )}

                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="edit_is_active"
                                    checked={formData.is_active}
                                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                    className="w-4 h-4 rounded border-divider bg-surface text-amber-500 focus:ring-amber-500"
                                />
                                <label htmlFor="edit_is_active" className="text-text-muted">Active</label>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => setShowEditModal(false)}
                                className="px-4 py-2 rounded-xl border border-divider text-text-muted hover:text-text-main hover:border-text-muted"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpdate}
                                disabled={actionLoading}
                                className="flex items-center gap-2 px-6 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold hover:from-blue-400 hover:to-cyan-400 disabled:opacity-50"
                            >
                                {actionLoading ? <RefreshCw size={18} className="animate-spin" /> : <Check size={18} />}
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Password Reset Modal */}
            {showPasswordModal && selectedUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-card rounded-2xl border border-divider w-full max-w-md p-6 mx-4">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-text-main">Reset Password</h2>
                            <button onClick={() => setShowPasswordModal(false)} className="text-text-muted hover:text-text-main">
                                <X size={24} />
                            </button>
                        </div>

                        <p className="text-text-muted mb-4">
                            Set a new password for <strong className="text-text-main">{selectedUser.username}</strong>
                        </p>

                        {actionError && (
                            <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 text-sm">
                                {actionError}
                            </div>
                        )}

                        <div>
                            <label className="block text-sm text-text-muted mb-1">New Password</label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full px-4 py-2 rounded-xl bg-surface border border-divider text-text-main focus:outline-none focus:border-amber-500"
                                placeholder="At least 6 characters"
                            />
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => setShowPasswordModal(false)}
                                className="px-4 py-2 rounded-xl border border-divider text-text-muted hover:text-text-main hover:border-text-muted"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handlePasswordReset}
                                disabled={actionLoading || newPassword.length < 6}
                                className="flex items-center gap-2 px-6 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 font-semibold hover:from-amber-400 hover:to-orange-400 disabled:opacity-50"
                            >
                                {actionLoading ? <RefreshCw size={18} className="animate-spin" /> : <KeyRound size={18} />}
                                Reset Password
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && selectedUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-card rounded-2xl border border-divider w-full max-w-md p-6 mx-4">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="p-3 rounded-full bg-red-500/20">
                                <AlertTriangle size={24} className="text-red-400" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-text-main">Delete User</h2>
                                <p className="text-text-muted text-sm">This action cannot be undone!</p>
                            </div>
                        </div>

                        <p className="text-text-muted mb-6">
                            Are you sure you want to delete user <strong className="text-text-main">{selectedUser.username}</strong> ({selectedUser.email})?
                        </p>

                        {actionError && (
                            <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 text-sm">
                                {actionError}
                            </div>
                        )}

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                className="px-4 py-2 rounded-xl border border-divider text-text-muted hover:text-text-main hover:border-text-muted"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={actionLoading}
                                className="flex items-center gap-2 px-6 py-2 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-400 disabled:opacity-50"
                            >
                                {actionLoading ? <RefreshCw size={18} className="animate-spin" /> : <Trash2 size={18} />}
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
