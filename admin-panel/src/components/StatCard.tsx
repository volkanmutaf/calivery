'use client';

import React from 'react';

interface StatCardProps {
    title: string;
    value: string | number;
    icon: React.ElementType;
    gradient: string;
    subtitle?: string;
}

export default function StatCard({
    title,
    value,
    icon: Icon,
    gradient,
    subtitle,
}: StatCardProps) {
    return (
        <div className="bg-card/50 backdrop-blur rounded-2xl border border-divider/50 p-6 hover:border-divider transition-all">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-text-muted text-sm font-medium">{title}</p>
                    <p className="text-3xl font-bold text-text-main mt-2">{value}</p>
                    {subtitle && <p className="text-text-muted text-sm mt-1">{subtitle}</p>}
                </div>
                <div className={`p-3 rounded-xl ${gradient} shrink-0`}>
                    <Icon size={24} className="text-text-main" />
                </div>
            </div>
        </div>
    );
}
