import Link from 'next/link';
import { Driver } from '@/lib/driverService';
import { Users, Phone, Mail, Briefcase, Calendar, CheckCircle, XCircle, Truck } from 'lucide-react';

interface DriverCardProps {
    driver: Driver;
    onReview?: (driver: Driver) => void;
}

export default function DriverCard({ driver, onReview }: DriverCardProps) {
    const handleReviewClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (onReview) onReview(driver);
    };
    return (
        <Link href={`/drivers/${driver.id}`} className="block group relative">
            <div className="bg-card border border-divider rounded-xl p-5 hover:border-amber-500/50 hover:shadow-md transition-all overflow-hidden relative h-full">
                {/* Status Stripe */}
                <div className={`absolute top-0 left-0 w-1 h-full ${driver.is_active ? 'bg-emerald-500' : 'bg-red-500'}`} />

                <div className="flex items-start justify-between mb-4 pl-3">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-surface border border-divider flex items-center justify-center overflow-hidden relative">
                            {driver.profile_photo_url ? (
                                <img src={driver.profile_photo_url} alt={driver.first_name} className="w-full h-full object-cover" />
                            ) : (
                                <Users size={20} className="text-text-muted" />
                            )}
                            {driver.pending_photo_url && (
                                <div className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 border-2 border-surface rounded-full shadow-sm z-10" />
                            )}
                        </div>
                        <div>
                            <h3 className="font-semibold text-lg text-text-main leading-tight group-hover:text-amber-500 transition-colors">
                                {driver.first_name} {driver.last_name}
                            </h3>
                            <div className="flex items-center gap-1.5 mt-1">
                                {driver.is_active ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                        <CheckCircle size={10} /> Active
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">
                                        <XCircle size={10} /> Disabled
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {driver.pending_photo_url ? (
                        <button
                            onClick={handleReviewClick}
                            className="text-xs font-bold bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 transition-colors shadow-sm shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer z-10 relative"
                        >
                            <span className="w-2 h-2 rounded-full bg-red-500 border border-white/50"></span>
                            Review Photo
                        </button>
                    ) : (
                        <div className="text-xs font-medium bg-surface group-hover:bg-amber-500 group-hover:text-white text-text-muted px-3 py-1.5 rounded-lg transition-colors border border-divider group-hover:border-transparent">
                            Manage
                        </div>
                    )}
                </div>

                <div className="space-y-2 mb-4 pl-3">
                    <div className="flex items-center gap-2 text-sm text-text-muted">
                        <Mail size={14} className="shrink-0" />
                        <span className="truncate">{driver.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-text-muted">
                        <Phone size={14} className="shrink-0" />
                        <span className="truncate">{driver.phone || 'No phone'}</span>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pl-3 border-t border-divider pt-3">
                    <div className="text-center">
                        <div className="flex items-center justify-center gap-1 text-[10px] text-text-muted uppercase font-semibold mb-0.5">
                            <Briefcase size={10} /> Jobs
                        </div>
                        <div className="font-bold text-text-main">{driver.jobs_accepted_total}</div>
                    </div>
                    <div className="text-center border-l border-divider">
                        <div className="flex items-center justify-center gap-1 text-[10px] text-text-muted uppercase font-semibold mb-0.5">
                            <Truck size={10} /> Deliv
                        </div>
                        <div className="font-bold text-text-main">{driver.deliveries_completed_total}</div>
                    </div>
                    <div className="text-center border-l border-divider">
                        <div className="flex items-center justify-center gap-1 text-[10px] text-text-muted uppercase font-semibold mb-0.5">
                            <Calendar size={10} /> Days
                        </div>
                        <div className="font-bold text-text-main">{driver.working_days}</div>
                    </div>
                </div>
            </div>
        </Link>
    );
}
