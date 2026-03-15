export interface Payout {
    id: string;
    driver_id: string;
    week_start: Date;
    week_end: Date;
    amount_cents: number;
    currency: string;
    method: 'zelle' | 'ach' | 'cash' | 'check' | 'stripe' | 'other';
    reference?: string;
    note?: string;
    created_by: string;
    tenant_id?: string;
    created_at: Date;
    updated_at: Date;
}
