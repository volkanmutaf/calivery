import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where, addDoc, orderBy, limit } from 'firebase/firestore';
import { firebaseDb } from '@/lib/firebase';
import { User, DollarSign, Calendar, Save, CheckCircle2, Search, Loader2, Clock, History } from 'lucide-react';
import { Profile } from '@/types';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { useTenant } from '@/lib/tenant-context';
import { useNotification } from '@/lib/notification-context';

type AdjustmentType = 'tip' | 'contribution' | 'adjustment' | 'bonus';

type DriverEarnings = {
    today: number;
    week: number;
};

type AdjustmentHistoryItem = {
    id: string;
    type: AdjustmentType;
    amount: number;
    date: string; // YYYY-MM-DD
    created_at: any;
};

const ADJUSTMENT_LABELS: Record<AdjustmentType, string> = {
    tip: 'Tips',
    contribution: 'Contribution',
    adjustment: 'Adjustment',
    bonus: 'Bonus'
};

export default function PayAdjustmentSettings() {
    const { tenantId } = useTenant();
    const [drivers, setDrivers] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDriverId, setSelectedDriverId] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const { showNotification } = useNotification();

    // Earnings State
    const [earnings, setEarnings] = useState<DriverEarnings | null>(null);
    const [loadingEarnings, setLoadingEarnings] = useState(false);

    // History State
    const [history, setHistory] = useState<AdjustmentHistoryItem[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [amounts, setAmounts] = useState<Record<AdjustmentType, string>>({
        tip: '',
        contribution: '',
        adjustment: '',
        bonus: ''
    });
    const [saving, setSaving] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    useEffect(() => {
        fetchDrivers();
    }, []);

    useEffect(() => {
        if (selectedDriverId) {
            fetchDriverEarnings(selectedDriverId, date);
            fetchAdjustmentHistory(selectedDriverId);
        } else {
            setEarnings(null);
            setHistory([]);
        }
    }, [selectedDriverId, date]);

    const fetchDrivers = async () => {
        try {
            let q = query(collection(firebaseDb, 'profiles'), where('role', '==', 'driver'));
            if (tenantId && tenantId !== 'default') {
                q = query(q, where('tenant_id', '==', tenantId));
            }
            const snap = await getDocs(q);
            const data: Profile[] = [];
            snap.forEach(doc => {
                data.push({ id: doc.id, ...doc.data() } as any);
            });
            data.sort((a, b) => a.username.localeCompare(b.username));
            setDrivers(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const fetchAdjustmentHistory = async (driverId: string) => {
        setLoadingHistory(true);
        try {
            let q = query(
                collection(firebaseDb, 'pay_adjustments'),
                where('driver_id', '==', driverId),
                orderBy('created_at', 'desc'),
                limit(10)
            );
            // Technically driverId implies the tenant, but good to be safe
            if (tenantId && tenantId !== 'default') {
                q = query(q, where('tenant_id', '==', tenantId));
            }
            const snap = await getDocs(q);
            const data: AdjustmentHistoryItem[] = [];
            snap.forEach(doc => {
                data.push({ id: doc.id, ...doc.data() } as any);
            });
            setHistory(data);
        } catch (error) {
            console.error("Error fetching history:", error);
        } finally {
            setLoadingHistory(false);
        }
    };

    const fetchDriverEarnings = async (driverId: string, targetDateStr: string = date) => {
        setLoadingEarnings(true);
        try {
            // targetDateStr comes from input type="date" which is YYYY-MM-DD local
            // Parse it to find the week range for that date
            const [year, month, day] = targetDateStr.split('-').map(Number);
            const targetDate = new Date(year, month - 1, day); // Local Date object

            const weekStart = startOfWeek(targetDate, { weekStartsOn: 1 });
            const weekEnd = endOfWeek(targetDate, { weekStartsOn: 1 });
            const weekStartStr = format(weekStart, 'yyyy-MM-dd');
            const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

            // 1. Fetch Delivered Orders
            let ordersQ = query(
                collection(firebaseDb, 'orders'),
                where('assigned_driver_id', '==', driverId),
                where('status', '==', 'delivered')
            );
            if (tenantId && tenantId !== 'default') {
                ordersQ = query(ordersQ, where('tenant_id', '==', tenantId));
            }
            const ordersSnap = await getDocs(ordersQ);

            let dayTotal = 0;
            let weekTotal = 0;

            ordersSnap.forEach(doc => {
                const data = doc.data();
                const d = data.scheduled_date; // YYYY-MM-DD
                const amount = data.payout_amount || 0;

                // Strict string comparison to match Driver App logic
                if (d === targetDateStr) dayTotal += amount;

                // For week stats
                if (d >= weekStartStr && d <= weekEndStr) weekTotal += amount;
            });

            // 2. Fetch Pay Adjustments
            let adjQ = query(
                collection(firebaseDb, 'pay_adjustments'),
                where('driver_id', '==', driverId)
            );
            if (tenantId && tenantId !== 'default') {
                adjQ = query(adjQ, where('tenant_id', '==', tenantId));
            }
            const adjSnap = await getDocs(adjQ);

            adjSnap.forEach(doc => {
                const data = doc.data();
                const d = data.date; // YYYY-MM-DD
                const amount = data.amount || 0;

                // Strict string comparison
                if (d === targetDateStr) dayTotal += amount;
                if (d >= weekStartStr && d <= weekEndStr) weekTotal += amount;
            });

            setEarnings({ today: dayTotal, week: weekTotal });

        } catch (error) {
            console.error('Error fetching earnings:', error);
        } finally {
            setLoadingEarnings(false);
        }
    };

    const handleSave = async () => {
        if (!selectedDriverId) {
            showNotification('Please select a driver', 'error');
            return;
        }

        const totalAmount = Object.values(amounts).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
        if (totalAmount === 0) {
            showNotification('Please enter at least one amount', 'error');
            return;
        }

        if (!window.confirm(`Are you sure you want to add payments totaling $${totalAmount.toFixed(2)}?`)) {
            return;
        }

        setSaving(true);
        try {
            const driver = drivers.find(d => (d as any).id === selectedDriverId);
            const driverName = driver?.username || 'Unknown Driver';

            const promises = Object.entries(amounts).map(async ([type, amountStr]) => {
                const amount = parseFloat(amountStr);
                if (!isNaN(amount) && amount !== 0) {
                    await addDoc(collection(firebaseDb, 'pay_adjustments'), {
                        driver_id: selectedDriverId,
                        driver_name: driverName,
                        tenant_id: tenantId || 'default',
                        date,
                        type,
                        amount,
                        created_at: new Date()
                    });
                }
            });

            await Promise.all(promises);

            setSuccessMessage('Payments saved successfully!');
            setAmounts({ tip: '', contribution: '', adjustment: '', bonus: '' });

            // Refresh Data
            fetchDriverEarnings(selectedDriverId);
            fetchAdjustmentHistory(selectedDriverId);

            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (error) {
            console.error(error);
            showNotification('Error saving payments', 'error');
        } finally {
            setSaving(false);
        }
    };

    const filteredDrivers = useMemo(() => {
        if (!searchQuery) return drivers;
        return drivers.filter(d => d.username.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [drivers, searchQuery]);

    const selectedDriverName = drivers.find(d => (d as any).id === selectedDriverId)?.username || '';

    // Helper to deal with "invalid date" issue when formatting
    const formatDateLabel = (dateStr: string) => {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-').map(Number);
        return format(new Date(y, m - 1, d), 'MM/dd/yyyy');
    };

    // Helper to format timestamp
    const formatTimestamp = (timestamp: any) => {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return format(date, 'MMM d, yyyy h:mm a');
    };

    return (
        <div className="space-y-6">
            <div className="bg-card/50 rounded-2xl border border-divider/50 p-6">
                <div className="flex items-center gap-3 mb-6">
                    <DollarSign size={20} className="text-emerald-400" />
                    <h2 className="text-lg font-semibold text-text-main">Pay Adjustments</h2>
                </div>

                <div className="grid md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                        {/* Searchable Driver Selector */}
                        <div className="relative">
                            <label className="block text-sm text-text-muted mb-1">Select Driver</label>
                            <div
                                className="relative"
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            >
                                <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                                <input
                                    type="text"
                                    placeholder="Search driver..."
                                    value={isDropdownOpen ? searchQuery : (selectedDriverName || searchQuery)}
                                    onChange={(e) => {
                                        setSearchQuery(e.target.value);
                                        setIsDropdownOpen(true);
                                    }}
                                    onFocus={() => setIsDropdownOpen(true)}
                                    className="w-full pl-10 pr-4 py-2 bg-surface rounded-xl border border-divider text-text-main focus:border-amber-500 focus:outline-none cursor-pointer"
                                />
                                {isDropdownOpen && (
                                    <div className="absolute z-10 w-full mt-1 max-h-60 overflow-y-auto bg-surface border border-divider rounded-xl shadow-xl">
                                        {filteredDrivers.length > 0 ? (
                                            filteredDrivers.map((driver: any) => (
                                                <div
                                                    key={driver.id}
                                                    className="px-4 py-2 hover:bg-white/5 cursor-pointer text-text-main"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedDriverId(driver.id);
                                                        setSearchQuery('');
                                                        setIsDropdownOpen(false);
                                                    }}
                                                >
                                                    {driver.username} <span className="text-text-muted text-xs">({driver.email})</span>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="px-4 py-2 text-text-muted text-sm">No drivers found</div>
                                        )}
                                    </div>
                                )}
                            </div>
                            {isDropdownOpen && <div className="fixed inset-0 z-0" onClick={() => setIsDropdownOpen(false)} />}
                        </div>

                        {/* Date Picker */}
                        <div>
                            <label className="block text-sm text-text-muted mb-1">Date</label>
                            <div className="relative">
                                <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                <input
                                    type="date"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-surface rounded-xl border border-divider text-text-main focus:border-amber-500 focus:outline-none"
                                />
                            </div>
                        </div>

                        {/* Amount Inputs */}
                        <div className="grid grid-cols-2 gap-4 pt-2">
                            <AmountInput
                                label="Tips"
                                value={amounts.tip}
                                onChange={v => setAmounts(prev => ({ ...prev, tip: v }))}
                            />
                            <AmountInput
                                label="Calivery Contribution"
                                value={amounts.contribution}
                                onChange={v => setAmounts(prev => ({ ...prev, contribution: v }))}
                            />
                            <AmountInput
                                label="Adjustment Pay"
                                value={amounts.adjustment}
                                onChange={v => setAmounts(prev => ({ ...prev, adjustment: v }))}
                            />
                            <AmountInput
                                label="Bonus Pay"
                                value={amounts.bonus}
                                onChange={v => setAmounts(prev => ({ ...prev, bonus: v }))}
                            />
                        </div>
                    </div>

                    {/* Right Side: Stats & Action */}
                    <div className="flex flex-col justify-between">
                        {/* Earnings Stats */}
                        <div className="bg-surface/50 rounded-xl p-4 border border-divider">
                            <h3 className="text-sm font-semibold text-text-muted mb-4 uppercase tracking-wider">Driver Stats</h3>

                            {selectedDriverId ? (
                                loadingEarnings ? (
                                    <div className="flex items-center gap-2 text-text-muted py-4">
                                        <Loader2 size={16} className="animate-spin" /> Loading earnings...
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div>
                                            <div className="text-text-muted text-sm">Today's Earnings ({formatDateLabel(date)})</div>
                                            <div className="text-2xl font-bold text-emerald-400">${earnings?.today.toFixed(2) || '0.00'}</div>
                                        </div>
                                        <div>
                                            <div className="text-text-muted text-sm">This Week's Earnings</div>
                                            <div className="text-2xl font-bold text-blue-400">${earnings?.week.toFixed(2) || '0.00'}</div>
                                        </div>
                                        <div className="text-xs text-text-muted pt-2 border-t border-divider">
                                            Includes Delivery Pay, Tips, and Adjustments.
                                        </div>
                                    </div>
                                )
                            ) : (
                                <div className="text-text-muted italic py-4">Select a driver to view earnings stats</div>
                            )}
                        </div>

                        {/* Save Button */}
                        <button
                            onClick={handleSave}
                            disabled={saving || !selectedDriverId}
                            className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 rounded-xl hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
                        >
                            {saving ? (
                                <>Saving...</>
                            ) : successMessage ? (
                                <><CheckCircle2 size={18} /> {successMessage}</>
                            ) : (
                                <><Save size={18} /> Add Payments</>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* History Section */}
            {selectedDriverId && (
                <div className="bg-card/50 rounded-2xl border border-divider/50 p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <History size={20} className="text-blue-400" />
                        <h2 className="text-lg font-semibold text-text-main">Adjustment History</h2>
                    </div>

                    {loadingHistory ? (
                        <div className="flex justify-center py-8 text-text-muted">
                            <Loader2 size={24} className="animate-spin" />
                        </div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-8 text-text-muted italic bg-surface/30 rounded-xl border border-dashed border-divider">
                            No recent adjustments found for this driver.
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-xl border border-divider bg-surface/30">
                            <table className="w-full">
                                <thead className="bg-surface/50 border-b border-divider">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Date & Time</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Type</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-divider/50">
                                    {history.map((item) => (
                                        <tr key={item.id} className="hover:bg-white/5 transition-colors">
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-text-main">
                                                <div className="flex items-center gap-2">
                                                    <Clock size={14} className="text-text-muted" />
                                                    {formatTimestamp(item.created_at)}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-text-main">
                                                <span className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-xs">
                                                    {ADJUSTMENT_LABELS[item.type] || item.type}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-emerald-400 font-semibold text-right">
                                                +${item.amount.toFixed(2)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function AmountInput({ label, value, onChange }: { label: string, value: string, onChange: (v: string) => void }) {
    return (
        <div>
            <label className="block text-xs text-text-muted mb-1 uppercase truncate" title={label}>{label}</label>
            <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">$</span>
                <input
                    type="number"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-7 pr-4 py-2 bg-surface rounded-xl border border-divider text-text-main focus:border-emerald-500 focus:outline-none"
                />
            </div>
        </div>
    );
}
