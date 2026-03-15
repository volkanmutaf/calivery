'use client';

import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Palette, Bell, Save, Database, Loader2, User, Database as DatabaseIcon } from 'lucide-react';
import { generateMockData, clearMockData, addMockDriver, addMockOrder, addBatchMockOrders, addBostonMockOrders, addBatchBostonDrivers } from '@/lib/mock-data';
import { useTenant } from '@/lib/tenant-context';

export default function SettingsPage() {
    // const { t } = useTranslation();
    const { tenantId } = useTenant();
    const [settings, setSettings] = useState({
        theme: 'dark',
        notifications: true,
        alertSound: true,
    });

    const [saved, setSaved] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [seeding, setSeeding] = useState(false);
    const [wiping, setWiping] = useState(false);
    const [seedMessage, setSeedMessage] = useState<string | null>(null);

    useEffect(() => {
        setMounted(true);
        // Load settings from localStorage if needed
        const savedSettings = localStorage.getItem('calivery_settings');
        if (savedSettings) {
            try {
                const parsed = JSON.parse(savedSettings);
                setSettings((prev) => ({ ...prev, ...parsed }));
            } catch (e) {
                console.error('Failed to parse settings', e);
            }
        }
    }, []);

    const handleSave = () => {
        // Save to localStorage
        localStorage.setItem('calivery_settings', JSON.stringify(settings));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const handleSeedData = async () => {
        if (!confirm('This will generate 10 drivers and 30 orders. Continue?')) return;
        setSeeding(true);
        setSeedMessage('Starting...');
        try {
            await generateMockData((msg) => setSeedMessage(msg), tenantId || undefined);
            setSeedMessage('Done! 10 Drivers and 30 Orders created.');
            setTimeout(() => setSeedMessage(null), 3000);
        } catch (error) {
            console.error(error);
            setSeedMessage('Error generating data.');
        } finally {
            setSeeding(false);
        }
    };

    const handleAddDriver = async () => {
        setSeeding(true);
        // setSeedMessage('Adding driver...');
        try {
            await addMockDriver(tenantId || undefined);
            setSeedMessage('Added 1 Mock Driver');
            setTimeout(() => setSeedMessage(null), 2000);
        } catch (error) {
            console.error(error);
            setSeedMessage('Error adding driver.');
        } finally {
            setSeeding(false);
        }
    };

    const handleAddOrder = async () => {
        setSeeding(true);
        // setSeedMessage('Adding order...');
        try {
            await addMockOrder(tenantId || undefined);
            setSeedMessage('Added 1 Mock Order');
            setTimeout(() => setSeedMessage(null), 2000);
        } catch (error) {
            console.error(error);
            setSeedMessage('Error adding order.');
        } finally {
            setSeeding(false);
        }
    };

    const handleAddBatchOrders = async () => {
        setSeeding(true);
        try {
            await addBatchMockOrders(tenantId || undefined);
            setSeedMessage('Added 3 Mock Orders');
            setTimeout(() => setSeedMessage(null), 2000);
        } catch (error) {
            console.error(error);
            setSeedMessage('Error adding orders.');
        } finally {
            setSeeding(false);
        }
    };

    const handleBostonOrders = async () => {
        setSeeding(true);
        try {
            await addBostonMockOrders(tenantId || undefined);
            setSeedMessage('Added 3 Boston Orders');
            setTimeout(() => setSeedMessage(null), 2000);
        } catch (error) {
            console.error(error);
            setSeedMessage('Error adding Boston orders.');
        } finally {
            setSeeding(false);
        }
    };

    const handleBostonDrivers = async () => {
        setSeeding(true);
        try {
            await addBatchBostonDrivers(tenantId || undefined);
            setSeedMessage('Added 3 Boston Drivers');
            setTimeout(() => setSeedMessage(null), 2000);
        } catch (error) {
            console.error(error);
            setSeedMessage('Error adding Boston drivers.');
        } finally {
            setSeeding(false);
        }
    };

    const handleWipeData = async () => {
        if (!confirm('This will DELETE all mock drivers and orders for this tenant. Are you sure?')) return;
        setWiping(true);
        setSeedMessage('Cleaning up...');
        try {
            // Note: clearMockData also needs to take tenantId
            await clearMockData((msg) => setSeedMessage(msg), tenantId || undefined);
            setSeedMessage('All mock data wiped.');
            setTimeout(() => setSeedMessage(null), 3000);
        } catch (error) {
            console.error(error);
            setSeedMessage('Error wiping data.');
        } finally {
            setWiping(false);
        }
    };

    if (!mounted) return null;

    return (
        <div className="p-8 max-w-2xl">
            <div className="flex items-center gap-3 mb-8">
                <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500">
                    <SettingsIcon size={24} className="text-white" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold text-text-main">Settings</h1>
                    <p className="text-text-muted">Manage your application preferences</p>
                </div>
            </div>

            <div className="space-y-6">
                {/* Theme */}
                <div className="bg-card/50 rounded-2xl border border-divider/50 p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <Palette size={20} className="text-purple-400" />
                        <h2 className="text-lg font-semibold text-text-main">Theme</h2>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        {['dark', 'light'].map((theme) => (
                            <button
                                key={theme}
                                onClick={() => setSettings({ ...settings, theme })}
                                className={`p-4 rounded-xl border transition-all capitalize ${settings.theme === theme
                                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                                    : 'bg-surface border-divider text-text-muted hover:border-text-muted'
                                    }`}
                            >
                                {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Notifications */}
                <div className="bg-card/50 rounded-2xl border border-divider/50 p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <Bell size={20} className="text-emerald-400" />
                        <h2 className="text-lg font-semibold text-text-main">Notifications</h2>
                    </div>
                    <div className="space-y-4">
                        <label className="flex items-center justify-between cursor-pointer">
                            <span className="text-text-muted">Enable Notifications</span>
                            <div className={`w-12 h-6 rounded-full transition-colors ${settings.notifications ? 'bg-emerald-500' : 'bg-surface border border-divider'}`}>
                                <div className={`w-5 h-5 rounded-full bg-white shadow mt-0.5 transition-transform ${settings.notifications ? 'translate-x-6' : 'translate-x-0.5'}`} onClick={() => setSettings({ ...settings, notifications: !settings.notifications })} />
                            </div>
                        </label>
                    </div>
                </div>


            </div>

            {/* Developer Options */}
            <div className="bg-card/50 rounded-2xl border border-divider/50 p-6">
                <div className="flex items-center gap-3 mb-4">
                    <Database size={20} className="text-blue-400" />
                    <h2 className="text-lg font-semibold text-text-main">Developer Options</h2>
                </div>
                <div className="flex flex-col gap-4">
                    <p className="text-sm text-text-muted">
                        Generate mock data for testing purposes. This creates 10 drivers and 30 orders with realistic Orange County addresses.
                    </p>
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                onClick={handleAddDriver}
                                disabled={seeding || wiping}
                                className="px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg font-medium hover:bg-emerald-500/20 disabled:opacity-50 transition-colors flex items-center gap-2"
                            >
                                <Database size={16} />
                                +1 Driver
                            </button>

                            <button
                                onClick={handleAddOrder}
                                disabled={seeding || wiping}
                                className="px-4 py-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg font-medium hover:bg-blue-500/20 disabled:opacity-50 transition-colors flex items-center gap-2"
                            >
                                <Database size={16} />
                                +1 Order
                            </button>

                            <button
                                onClick={handleAddBatchOrders}
                                disabled={seeding || wiping}
                                className="px-4 py-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg font-medium hover:bg-amber-500/20 disabled:opacity-50 transition-colors flex items-center gap-2"
                            >
                                <Database size={16} />
                                +3 Orders
                            </button>

                            <button
                                onClick={handleBostonOrders}
                                disabled={seeding || wiping}
                                className="px-4 py-2 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-lg font-medium hover:bg-purple-500/20 disabled:opacity-50 transition-colors flex items-center gap-2"
                            >
                                <Database size={16} />
                                +3 Boston Orders
                            </button>

                            <button
                                onClick={handleBostonDrivers}
                                disabled={seeding || wiping}
                                className="px-4 py-2 bg-pink-500/10 text-pink-400 border border-pink-500/20 rounded-lg font-medium hover:bg-pink-500/20 disabled:opacity-50 transition-colors flex items-center gap-2"
                            >
                                <User size={16} />
                                +3 Boston Drivers
                            </button>

                            <button
                                onClick={handleWipeData}
                                disabled={seeding || wiping}
                                className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/50 rounded-lg font-medium hover:bg-red-500/30 disabled:opacity-50 transition-colors flex items-center gap-2 ml-auto"
                            >
                                <Loader2 size={16} className={wiping ? "animate-spin" : "hidden"} />
                                Wipe All
                            </button>
                        </div>
                        {seedMessage && (
                            <p className="text-sm text-text-main font-medium text-center animate-pulse bg-surface/50 py-1 rounded-lg border border-divider">
                                {seedMessage}
                            </p>
                        )}
                    </div>
                </div>

                {/* Save Button */}
                <button
                    onClick={handleSave}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 font-semibold hover:from-amber-400 hover:to-orange-400 transition-all"
                >
                    <Save size={20} />
                    {saved ? 'Saved!' : 'Save Changes'}
                </button>
            </div>

        </div>

    );
}
