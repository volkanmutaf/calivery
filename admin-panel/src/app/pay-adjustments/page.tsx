'use client';

import PayAdjustmentSettings from '@/components/PayAdjustmentSettings';
import { DollarSign } from 'lucide-react';

export default function PayAdjustmentsPage() {
    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="flex items-center gap-3 mb-8">
                <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500">
                    <DollarSign size={24} className="text-white" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold text-text-main">Pay Adjustments</h1>
                    <p className="text-text-muted">Manage driver bonuses, tips, and other adjustments</p>
                </div>
            </div>

            <PayAdjustmentSettings />
        </div>
    );
}
