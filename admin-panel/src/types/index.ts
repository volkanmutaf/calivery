// Shared types for Calivery Admin Panel and Driver App

export type UserRole = 'admin' | 'driver' | 'tenant_admin' | 'super_admin';

export type OrderStatus = 'new' | 'assigned' | 'in_progress' | 'delivered' | 'cancelled';

export type OrderSource = 'manual' | 'ezcater_future';

export type RouteGroupStatus = 'active' | 'completed' | 'cancelled';

export type StepStatus = 'pending' | 'completed';

export type TaskType = 'pickup' | 'dropoff';

export type PhotoType = 'pickup' | 'delivery';

export type EventType =
    | 'order_created'
    | 'assigned'
    | 'system_route_generated'
    | 'pickup_photo_uploaded'
    | 'picked_up'
    | 'delivery_photo_uploaded'
    | 'delivered'
    | 'reassigned'
    | 'cancelled';

export type ActorRole = 'admin' | 'driver' | 'system';

// Profile document
export interface Profile {
    id: string;
    role: UserRole;
    username: string;
    email: string | null;
    phone: string | null;
    photo_url: string | null;
    driver_base_address: string;
    driver_base_lat: number;
    driver_base_lng: number;
    is_active: boolean;
    is_on_duty?: boolean;
    last_location?: {
        latitude: number;
        longitude: number;
        accuracy: number | null;
        speed: number | null;
        heading: number | null;
    };
    last_location_update?: any; // Firestore Timestamp
    tenant_id?: string;
    created_at: Date;
    updated_at: Date;
}

// Order document
export interface Order {
    id: string;
    order_code: string;
    source: OrderSource;
    restaurant_name: string;
    pickup_address: string;
    pickup_lat: number;
    pickup_lng: number;
    dropoff_address: string;
    dropoff_lat: number;
    dropoff_lng: number;
    payout_amount: number;
    scheduled_date: string;
    time_window_start: Date | null;
    time_window_end: Date | null;
    status: OrderStatus;
    assigned_driver_id: string | null;
    route_group_id: string | null;
    tenant_id?: string;

    // Finance Fields
    finance_status?: 'pending' | 'completed';
    order_price?: number;
    customer_tip?: number;
    net_income?: number;
    created_by: string;
    created_at: Date;
    updated_at: Date;
    last_event_time: Date;
    admin_notes?: string;
}

// Order event (audit log)
export interface OrderEvent {
    id: string;
    event_type: EventType;
    actor_role: ActorRole;
    actor_id: string;
    event_time: Date;
    metadata: Record<string, unknown>;
}

// Order photo metadata
export interface OrderPhoto {
    id: string;
    photo_type: PhotoType;
    storage_path: string;
    uploaded_by: string;
    uploaded_at: Date;
    order_id: string;
    step_id: string | null;
}

// Route group document
export interface RouteGroup {
    id: string;
    driver_id: string;
    scheduled_date: string;
    status: RouteGroupStatus;
    algorithm_version: string;
    generated_at: Date;
    published_at: Date | null;
    summary: {
        distance_estimate: number;
        fairness_notes: string;
        order_count: number;
    };
}

// Route step document
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

// Weekly earnings document
export interface EarningsWeekly {
    id: string;
    driver_id: string;
    week_start_date: string;
    week_end_date: string;
    total_earnings: number;
    order_count: number;
    last_calculated_at: Date;
    paid_out_cents: number;
    status: 'open' | 'ready' | 'paid' | 'void';
    tenant_id?: string;
    updated_at: Date;
}

// Driver with computed stats for admin view
export interface DriverWithStats extends Profile {
    id: string;
    assigned_today_count: number;
    completed_today: number;
    weekly_earnings: number;
    success_rate: number;
}

// Dashboard stats
export interface DashboardStats {
    active_drivers: number;
    orders_new: number;
    orders_assigned: number;
    orders_in_progress: number;
    orders_delivered: number;
    total_payout_today: number;
}

// Alert types for dashboard
export interface DashboardAlert {
    id: string;
    type: 'overdue_pickup' | 'missing_photo' | 'stalled_order';
    order_id: string;
    order_code: string;
    message: string;
    created_at: Date;
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
    [key: string]: boolean; // allow custom feature flags
}

export interface TenantLimits {
    max_drivers: number;
    max_dispatchers: number;
}

export interface TenantConfig {
    features: FeatureFlags;
    limits: TenantLimits;
}

export * from './payouts';
