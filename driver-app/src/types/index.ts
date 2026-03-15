// Types for Driver App
export type UserRole = 'admin' | 'driver' | 'tenant_admin' | 'super_admin';
export type OrderStatus = 'new' | 'assigned' | 'in_progress' | 'delivered' | 'cancelled';
export type RouteGroupStatus = 'active' | 'completed' | 'cancelled';
export type StepStatus = 'pending' | 'completed';
export type TaskType = 'pickup' | 'dropoff';
export type PhotoType = 'pickup' | 'delivery';

export interface Profile {
    role: UserRole;
    username: string;
    email: string | null;
    phone: string | null;
    photo_url: string | null;
    pending_photo_url?: string | null;
    driver_base_address: string;
    driver_base_lat: number;
    driver_base_lng: number;
    is_active: boolean;
    is_on_duty?: boolean;
    active_session_id?: string | null;
    tenant_id?: string;
}

export interface Order {
    id: string;
    order_code: string;
    restaurant_name: string;
    pickup_address: string;
    pickup_lat: number;
    pickup_lng: number;
    dropoff_address: string;
    dropoff_lat: number;
    dropoff_lng: number;
    payout_amount: number;
    scheduled_date: string;
    time_window_start: any | null;
    time_window_end: any | null;
    status: OrderStatus;
    assigned_driver_id: string | null;
    route_group_id: string | null;
    tenant_id?: string;
    admin_notes?: string;
}

export interface RouteGroup {
    id: string;
    driver_id: string;
    scheduled_date: string;
    status: RouteGroupStatus;
    summary: { distance_estimate: number; order_count: number };
}

export interface RouteStep {
    id: string;
    sequence_index: number;
    order_id: string;
    task_type: TaskType;
    address: string;
    lat: number;
    lng: number;
    status: StepStatus;
    required_photo_type: PhotoType;
    completed_at: Date | null;
}

export type AdjustmentType = 'tip' | 'contribution' | 'adjustment' | 'bonus';

export interface PayAdjustment {
    id: string;
    driver_id: string;
    amount: number;
    type: AdjustmentType;
    date: string; // YYYY-MM-DD
    created_at: Date;
}

export interface EarningsWeekly {
    id: string;
    driver_id: string;
    week_start_date: string;
    week_end_date: string;
    total_earnings: number;
    order_count: number;
}

// ============================================
// Tenant & Feature Flag Types
// ============================================

export interface Tenant {
    id: string;
    name: string;
    brand_name: string;
    logo_url: string;
    primary_color: string;
    secondary_color: string;
    status: 'active' | 'suspended' | 'inactive';
    created_at: Date;
}

export interface FeatureFlags {
    driver_tracking: boolean;
    payouts: boolean;
    reports: boolean;
    sms_notifications: boolean;
    analytics: boolean;
    auto_assign: boolean;
    [key: string]: boolean;
}

export interface TenantLimits {
    max_drivers: number;
    max_dispatchers: number;
}

export interface TenantConfig {
    features: FeatureFlags;
    limits: TenantLimits;
}
