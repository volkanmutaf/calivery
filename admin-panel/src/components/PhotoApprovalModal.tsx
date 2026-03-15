
import React, { useState } from 'react';
import { Driver, DriverService } from '../lib/driverService';
import { useNotification } from '@/lib/notification-context';

interface PhotoApprovalModalProps {
    isOpen: boolean;
    onClose: () => void;
    driver: Driver;
    onUpdate: () => void; // Callback to refresh data
}

export default function PhotoApprovalModal({ isOpen, onClose, driver, onUpdate }: PhotoApprovalModalProps) {
    const [reason, setReason] = useState('');
    const [processing, setProcessing] = useState(false);
    const { showNotification } = useNotification();

    if (!isOpen) return null;

    const handleApprove = async () => {
        if (!driver.pending_photo_url) return;
        setProcessing(true);
        try {
            await DriverService.approvePhoto(driver.id, driver.pending_photo_url);
            onUpdate();
            onClose();
        } catch (error) {
            console.error('Failed to approve photo:', error);
            showNotification('Failed to approve photo', 'error');
        } finally {
            setProcessing(false);
        }
    };

    const handleReject = async () => {
        if (!reason.trim()) {
            showNotification('Please provide a reason for rejection.', 'error');
            return;
        }
        setProcessing(true);
        try {
            await DriverService.rejectPhoto(driver.id, reason);
            onUpdate();
            onClose();
        } catch (error) {
            console.error('Failed to reject photo:', error);
            showNotification('Failed to reject photo', 'error');
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-card border border-divider rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
                <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-text-main">Review Profile Photo</h2>
                        <button
                            onClick={onClose}
                            className="text-text-muted hover:text-text-main transition-colors cursor-pointer"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-6 mb-6">
                        <div>
                            <h3 className="text-sm font-medium text-text-muted mb-3">Current Photo</h3>
                            <div className="aspect-square bg-surface rounded-xl overflow-hidden flex items-center justify-center border border-divider">
                                {driver.profile_photo_url ? (
                                    <img src={driver.profile_photo_url} alt="Current" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-text-muted/50 text-sm">No Photo</span>
                                )}
                            </div>
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-amber-500 mb-3 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                                Pending New Photo
                            </h3>
                            <div className="aspect-square bg-surface rounded-xl overflow-hidden flex items-center justify-center border-2 border-amber-500/50 shadow-[0_0_15px_-3px_rgba(245,158,11,0.3)]">
                                {driver.pending_photo_url ? (
                                    <img src={driver.pending_photo_url} alt="Pending" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-text-muted/50 text-sm">No Pending Photo</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="mb-6">
                        <label className="block text-sm font-medium text-text-main mb-2">
                            Rejection Reason <span className="text-text-muted font-normal">(Required for rejection)</span>
                        </label>
                        <textarea
                            className="w-full bg-surface border border-divider rounded-xl p-3 h-24 text-text-main placeholder:text-text-muted/50 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all resize-none"
                            placeholder="e.g. Photo is too blurry, face not visible, wearing sunglasses..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-divider">
                        <button
                            onClick={onClose}
                            className="px-5 py-2.5 rounded-xl border border-divider text-text-muted hover:text-text-main hover:bg-surface font-medium transition-all cursor-pointer"
                            disabled={processing}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleReject}
                            className="px-5 py-2.5 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 font-medium transition-all disabled:opacity-50 cursor-pointer"
                            disabled={processing}
                        >
                            {processing ? 'Processing...' : 'Reject with Reason'}
                        </button>
                        <button
                            onClick={handleApprove}
                            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 cursor-pointer"
                            disabled={processing}
                        >
                            {processing ? 'Processing...' : 'Approve & Publish'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
