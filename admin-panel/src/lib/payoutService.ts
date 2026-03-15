import { collection, doc, runTransaction, serverTimestamp, getDoc } from 'firebase/firestore';
import { firebaseDb } from './firebase';
import { Payout, EarningsWeekly } from '@/types';

export interface CreatePayoutInput {
    driver_id: string;
    earnings_weekly_id: string; // The ID of the earnings_weekly document this pays toward
    week_start: Date;
    week_end: Date;
    amount_cents: number;
    currency: string;
    method: 'zelle' | 'ach' | 'cash' | 'check' | 'stripe' | 'other';
    reference?: string;
    note?: string;
    created_by: string; // Admin UID
    tenant_id?: string;
}

/**
 * Atomically create a payout and update the corresponding earnings_weekly document.
 * 
 * Flow:
 * 1. Read earnings_weekly doc to get current values
 * 2. Write new payout doc
 * 3. Update earnings_weekly with added paid_out_cents and determine new status
 */
export async function createPayout(input: CreatePayoutInput): Promise<void> {

    try {
        await runTransaction(firebaseDb, async (transaction) => {
            const earningsRef = doc(firebaseDb, 'earnings_weekly', input.earnings_weekly_id);
            const earningsDoc = await transaction.get(earningsRef);

            if (!earningsDoc.exists()) {
                throw new Error("Target weekly earnings document does not exist.");
            }

            const earningsData = earningsDoc.data() as EarningsWeekly;

            // Calculate new totals
            const currentPaidOut = earningsData.paid_out_cents || 0;
            const newPaidOut = currentPaidOut + input.amount_cents;

            // Note: net_income / net_amount wasn't fully defined in EarningsWeekly previously, 
            // but we use total_earnings generically. Let's base status on total_earnings 
            // converted to cents if it's stored as dollars, or just compare directly.
            // Assuming total_earnings is in dollars, convert to cents for comparison:
            const totalCents = Math.round((earningsData.total_earnings || 0) * 100);

            let newStatus = earningsData.status || 'open';
            if (newPaidOut >= totalCents) {
                newStatus = 'paid';
            } else if (newPaidOut > 0) {
                // If partially paid, 'ready' might not be the best standard term, but let's keep it 'open' or 'ready' 
                // We'll just leave it open if not fully paid out, but you can adjust business logic here.
                newStatus = 'open';
            }

            // Create new Payout Document Ref
            const newPayoutRef = doc(collection(firebaseDb, 'payouts'));

            const payoutData = {
                id: newPayoutRef.id,
                driver_id: input.driver_id,
                week_start: input.week_start,
                week_end: input.week_end,
                amount_cents: input.amount_cents,
                currency: input.currency || 'USD',
                method: input.method,
                reference: input.reference || '',
                note: input.note || '',
                created_by: input.created_by,
                tenant_id: input.tenant_id || undefined,
                created_at: serverTimestamp(),
                updated_at: serverTimestamp()
            };

            // Queue Transaction Writes
            transaction.set(newPayoutRef, payoutData);

            transaction.update(earningsRef, {
                paid_out_cents: newPaidOut,
                status: newStatus,
                updated_at: serverTimestamp()
            });

        });

    } catch (error) {
        console.error("Payout Transaction failed: ", error);
        throw error;
    }
}
