'use client';

import { useState } from 'react';
import { Payout } from '@/types';
import { X, Check } from 'lucide-react';
import { createPayout } from '@/lib/payoutService';
import { useAuth } from '@/lib/auth-context';

interface PayModalProps {
    isOpen: boolean;
    onClose: () => void;
    driverId: string;
    driverName: string;
    weekStart: Date;
    weekEnd: Date;
    earningsWeeklyId: string;
    outstandingAmountCents: number;
    onSuccess?: () => void;
}

const PAYMENT_METHODS = [
    { value: 'zelle', label: 'Zelle' },
    { value: 'ach', label: 'ACH / Bank Transfer' },
    { value: 'cash', label: 'Cash' },
    { value: 'check', label: 'Check' },
    { value: 'stripe', label: 'Stripe' },
    { value: 'other', label: 'Other' },
];

export default function PayModal({
    isOpen,
    onClose,
    driverId,
    driverName,
    weekStart,
    weekEnd,
    earningsWeeklyId,
    outstandingAmountCents,
    onSuccess
}: PayModalProps) {
    const { profile } = useAuth();
    const [amountStr, setAmountStr] = useState((outstandingAmountCents / 100).toFixed(2));
    const [method, setMethod] = useState<Payout['method']>('zelle');
    const [reference, setReference] = useState('');
    const [note, setNote] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset when opened
    // Note: To handle this strictly, we'd use a useEffect based on isOpen, but keeping it simple.

    if (!isOpen) return null;

    const handleConfirm = async () => {
        try {
            setError(null);
            const amountCents = Math.round(parseFloat(amountStr) * 100);

            if (isNaN(amountCents) || amountCents <= 0) {
                setError('Amount must be greater than zero.');
                return;
            }

            if (amountCents > outstandingAmountCents) {
                // We could allow overpay, but the requirements requested NO by default.
                setError(`Amount cannot exceed the outstanding balance of $${(outstandingAmountCents / 100).toFixed(2)}`);
                return;
            }

            setLoading(true);

            await createPayout({
                driver_id: driverId,
                earnings_weekly_id: earningsWeeklyId,
                week_start: weekStart,
                week_end: weekEnd,
                amount_cents: amountCents,
                currency: 'USD',
                method: method,
                reference: reference,
                note: note,
                created_by: profile?.username || 'unknown_admin'
            });

            if (onSuccess) onSuccess();
            onClose();

        } catch (err: any) {
            setError(err.message || 'An error occurred during payment.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-surface border border-divider rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">

                <div className="flex items-center justify-between p-4 border-b border-divider/50 bg-card/30">
                    <h2 className="text-lg font-bold text-text-main">Record Payout</h2>
                    <button onClick={onClose} className="p-2 -mr-2 text-text-muted hover:text-text-main hover:bg-surface rounded-xl transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-4">

                    {error && (
                        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <div className="bg-card/50 rounded-xl p-4 border border-divider/50">
                        <div className="text-sm text-text-muted mb-1">Paying Driver</div>
                        <div className="font-semibold text-text-main text-lg">{driverName}</div>
                        <div className="text-sm text-text-muted mt-2">Outstanding Balance</div>
                        <div className="font-bold text-emerald-400 text-xl">${(outstandingAmountCents / 100).toFixed(2)}</div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1.5 ml-1">Payment Amount ($)</label>
                            <input
                                type="number"
                                step="0.01"
                                className="w-full bg-background border border-divider rounded-xl px-4 py-2.5 text-text-main focus:outline-none focus:border-amber-500/50 transition-colors"
                                value={amountStr}
                                onChange={(e) => setAmountStr(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1.5 ml-1">Payment Method</label>
                            <select
                                className="w-full bg-background border border-divider rounded-xl px-4 py-2.5 text-text-main focus:outline-none focus:border-amber-500/50 transition-colors appearance-none"
                                value={method}
                                onChange={(e) => setMethod(e.target.value as any)}
                            >
                                {PAYMENT_METHODS.map(m => (
                                    <option key={m.value} value={m.value}>{m.label}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1.5 ml-1">Reference (Confirmation #, Check #)</label>
                            <input
                                type="text"
                                placeholder="Optional"
                                className="w-full bg-background border border-divider rounded-xl px-4 py-2.5 text-text-main focus:outline-none focus:border-amber-500/50 transition-colors"
                                value={reference}
                                onChange={(e) => setReference(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1.5 ml-1">Note / Memo</label>
                            <textarea
                                placeholder="Optional note for records"
                                className="w-full bg-background border border-divider rounded-xl px-4 py-2.5 text-text-main focus:outline-none focus:border-amber-500/50 transition-colors resize-none"
                                rows={2}
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-divider/50 bg-card/30 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="px-4 py-2 rounded-xl text-text-muted hover:text-text-main hover:bg-surface font-medium transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={loading}
                        className="flex items-center gap-2 px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                    >
                        {loading ? 'Processing...' : (
                            <>
                                <Check size={18} />
                                Record Payment
                            </>
                        )}
                    </button>
                </div>

            </div>
        </div>
    );
}
