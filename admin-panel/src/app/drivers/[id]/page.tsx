'use client';

import { useNotification } from '@/lib/notification-context'; import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { DriverService, Driver } from '@/lib/driverService';
import { ArrowLeft, Save, AlertTriangle, CheckCircle, Trash2, ShieldAlert } from 'lucide-react';
import Link from 'next/link';

// NOTE: Unwrap generic params with React.use() in Next.js 15+ if needed, 
// or stick to Component({ params }: ...) if standard. 
// Assuming params are passed as props in standard App Router.

export default function DriverDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { showNotification } = useNotification();
    const router = useRouter();
    // Unwrap params using React.use()
    const { id } = use(params);

    const [driver, setDriver] = useState<Driver | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Form State
    const [formData, setFormData] = useState<Partial<Driver>>({});
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        const loadDriver = async () => {
            try {
                const data = await DriverService.getDriver(id);
                if (data) {
                    setDriver(data);
                    setFormData(data);
                } else {
                    // Handle 404
                    router.push('/drivers');
                }
            } catch (error) {
                console.error('Error loading driver:', error);
            } finally {
                setLoading(false);
            }
        };
        loadDriver();
    }, [id, router]);

    const handleBack = () => {
        if (isDirty) {
            if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
                router.back();
            }
        } else {
            router.back();
        }
    };

    const handleChange = (field: keyof Driver, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setIsDirty(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await DriverService.updateDriver(id, formData);
            setDriver({ ...driver!, ...formData } as Driver);
            setIsDirty(false);
            // Could add toast here
            showNotification('Driver updated successfully', 'success');
        } catch (error) {
            console.error('Error saving driver:', error);
            showNotification('Failed to save changes', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleToggleStatus = async () => {
        const newStatus = !formData.is_active;
        if (!newStatus) {
            const confirmed = confirm('WARNING: Disabling this account will prevent the driver from logging into the mobile app immediately. Are you sure?');
            if (!confirmed) return;
        }

        handleChange('is_active', newStatus);
    };



    if (loading) {
        return <div className="p-8 text-center text-text-muted">Loading driver details...</div>;
    }

    if (!driver) return null;

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <button
                    onClick={handleBack}
                    className="flex items-center gap-2 text-text-muted hover:text-text-main transition-colors font-medium"
                >
                    <ArrowLeft size={20} />
                    Back to Drivers
                </button>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleSave}
                        disabled={!isDirty || saving}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${isDirty && !saving
                            ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20 transform hover:-translate-y-0.5'
                            : 'bg-surface text-text-muted cursor-not-allowed'
                            }`}
                    >
                        <Save size={18} />
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>

            {/* Profile Header Card */}
            <div className="bg-card border border-divider rounded-2xl p-6 flex flex-col md:flex-row gap-6 items-center md:items-start relative overflow-hidden">
                {!formData.is_active && (
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-red-500" />
                )}

                <div className="w-24 h-24 rounded-full bg-surface border-4 border-card shadow-lg shrink-0 overflow-hidden">
                    <img
                        src={formData.profile_photo_url || `https://ui-avatars.com/api/?name=${formData.first_name}+${formData.last_name}`}
                        alt="Profile"
                        className="w-full h-full object-cover"
                    />
                </div>

                <div className="flex-1 text-center md:text-left">
                    <h1 className="text-3xl font-bold text-text-main mb-1">
                        {formData.first_name} {formData.last_name}
                    </h1>
                    <div className="flex items-center justify-center md:justify-start gap-4 text-text-muted mb-4">
                        <span>{formData.email}</span>
                        <span>•</span>
                        <span>{formData.phone || 'No phone set'}</span>
                    </div>

                    <div className="flex items-center justify-center md:justify-start gap-3">
                        <button
                            onClick={handleToggleStatus}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors border ${formData.is_active
                                ? 'border-red-500/30 text-red-500 hover:bg-red-500/10'
                                : 'border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10'
                                }`}
                        >
                            {formData.is_active ? (
                                <>
                                    <ShieldAlert size={16} />
                                    Disable Account
                                </>
                            ) : (
                                <>
                                    <CheckCircle size={16} />
                                    Activate Account
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Quick Stats Grid */}
                <div className="grid grid-cols-2 gap-3 w-full md:w-auto">
                    <div className="bg-surface rounded-xl p-3 text-center min-w-[100px]">
                        <div className="text-xs text-text-muted uppercase font-bold mb-1">Jobs</div>
                        <div className="text-xl font-bold text-text-main">{driver.jobs_accepted_total}</div>
                    </div>
                    <div className="bg-surface rounded-xl p-3 text-center min-w-[100px]">
                        <div className="text-xs text-text-muted uppercase font-bold mb-1">Delivered</div>
                        <div className="text-xl font-bold text-text-main">{driver.deliveries_completed_total}</div>
                    </div>
                    <div className="col-span-2 bg-surface rounded-xl p-3 text-center">
                        <div className="text-xs text-text-muted uppercase font-bold mb-1">Working Days</div>
                        <div className="text-xl font-bold text-text-main">{driver.working_days}</div>
                    </div>
                </div>


            </div>

            {/* Edit Form */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-card border border-divider rounded-2xl p-6 space-y-6">
                    <h3 className="text-lg font-bold text-text-main border-b border-divider pb-4">Personal Information</h3>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-text-muted">First Name</label>
                            <input
                                type="text"
                                className="w-full bg-surface border border-divider rounded-lg px-4 py-2 text-text-main focus:ring-2 focus:ring-amber-500/50 outline-none"
                                value={formData.first_name || ''}
                                onChange={(e) => handleChange('first_name', e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-text-muted">Last Name</label>
                            <input
                                type="text"
                                className="w-full bg-surface border border-divider rounded-lg px-4 py-2 text-text-main focus:ring-2 focus:ring-amber-500/50 outline-none"
                                value={formData.last_name || ''}
                                onChange={(e) => handleChange('last_name', e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-text-muted">Email Address (Read Only)</label>
                        <input
                            type="email"
                            disabled
                            className="w-full bg-surface/50 border border-divider rounded-lg px-4 py-2 text-text-muted cursor-not-allowed"
                            value={formData.email || ''}
                        />
                        <p className="text-xs text-text-muted flex items-center gap-1">
                            <AlertTriangle size={12} /> Email cannot be changed here. Contact admin support.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-text-muted">Phone Number</label>
                        <input
                            type="tel"
                            className="w-full bg-surface border border-divider rounded-lg px-4 py-2 text-text-main focus:ring-2 focus:ring-amber-500/50 outline-none"
                            value={formData.phone || ''}
                            onChange={(e) => handleChange('phone', e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-text-muted">Home Address</label>
                        <textarea
                            className="w-full bg-surface border border-divider rounded-lg px-4 py-2 text-text-main focus:ring-2 focus:ring-amber-500/50 outline-none min-h-[100px]"
                            value={formData.address || ''}
                            onChange={(e) => handleChange('address', e.target.value)}
                        />
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-card border border-divider rounded-2xl p-6 space-y-6">
                        <h3 className="text-lg font-bold text-text-main border-b border-divider pb-4">Settings & Metadata</h3>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-text-muted">Profile Photo URL</label>
                            <input
                                type="text"
                                className="w-full bg-surface border border-divider rounded-lg px-4 py-2 text-text-main focus:ring-2 focus:ring-amber-500/50 outline-none"
                                value={formData.profile_photo_url || ''}
                                onChange={(e) => handleChange('profile_photo_url', e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-text-muted">Account Created</label>
                            <div className="w-full bg-surface/50 border border-divider rounded-lg px-4 py-2 text-text-muted">
                                {driver.created_at.toLocaleString()}
                            </div>
                        </div>

                        <div className="p-4 bg-surface rounded-xl border border-divider">
                            <h4 className="font-semibold text-text-main mb-2">Driver Permissions</h4>
                            <p className="text-sm text-text-muted leading-relaxed">
                                Drivers can only edit their phone number from the mobile app. All other changes must be made here in the admin panel.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
