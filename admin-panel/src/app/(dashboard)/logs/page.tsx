'use client';

import { useEffect, useState } from 'react';
import { collectionGroup, query, orderBy, getDocs, limit, startAfter, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { firebaseDb } from '@/lib/firebase';
import { OrderEvent } from '@/types';
import { format } from 'date-fns';
import { FileText, Search, RefreshCw, Package, User, Camera, Truck, CheckCircle2, AlertCircle } from 'lucide-react';

const PAGE_SIZE = 50;

export default function LogsPage() {
    const [events, setEvents] = useState<(OrderEvent & { order_id?: string })[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
    const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
    const [hasMore, setHasMore] = useState(true);

    const fetchEvents = async (append = false) => {
        setLoading(true);
        try {
            let eventsQuery = query(collectionGroup(firebaseDb, 'events'), orderBy('event_time', 'desc'), limit(PAGE_SIZE));
            if (append && lastDoc) eventsQuery = query(eventsQuery, startAfter(lastDoc));

            const snapshot = await getDocs(eventsQuery);
            const newEvents: (OrderEvent & { order_id?: string })[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                const orderId = doc.ref.path.split('/')[1];
                newEvents.push({ id: doc.id, order_id: orderId, ...data, event_time: data.event_time?.toDate?.() || new Date() } as OrderEvent & { order_id?: string });
            });

            if (append) setEvents((prev) => [...prev, ...newEvents]);
            else setEvents(newEvents);
            setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
            setHasMore(snapshot.docs.length === PAGE_SIZE);
        } catch (error) { console.error('Error:', error); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchEvents(); }, []);

    const getEventIcon = (t: string) => {
        if (t === 'order_created') return <Package size={16} />;
        if (t === 'assigned') return <User size={16} />;
        if (t.includes('photo')) return <Camera size={16} />;
        if (t === 'picked_up') return <Truck size={16} />;
        if (t === 'delivered') return <CheckCircle2 size={16} />;
        if (t === 'cancelled') return <AlertCircle size={16} />;
        return <FileText size={16} />;
    };

    const getEventColor = (t: string) => {
        if (t === 'order_created') return 'bg-blue-500/20 text-blue-400';
        if (t === 'assigned') return 'bg-amber-500/20 text-amber-400';
        if (t.includes('picked') || t.includes('pickup')) return 'bg-purple-500/20 text-purple-400';
        if (t.includes('deliver')) return 'bg-emerald-500/20 text-emerald-400';
        if (t === 'cancelled') return 'bg-red-500/20 text-red-400';
        return 'bg-slate-500/20 text-slate-400';
    };

    const filtered = events.filter((e) => {
        const matchSearch = e.order_id?.includes(searchTerm) || e.actor_id.includes(searchTerm) || e.event_type.includes(searchTerm);
        const matchType = eventTypeFilter === 'all' || e.event_type === eventTypeFilter;
        return matchSearch && matchType;
    });

    return (
        <div className="p-8">
            <div className="flex items-center justify-between mb-8">
                <div><h1 className="text-3xl font-bold text-white">Audit Logs</h1><p className="text-slate-400 mt-1">Global event log</p></div>
                <button onClick={() => fetchEvents()} disabled={loading} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white"><RefreshCw size={18} className={loading ? 'animate-spin' : ''} />Refresh</button>
            </div>
            <div className="flex items-center gap-4 mb-6">
                <div className="relative flex-1 max-w-md"><Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-2.5 rounded-xl bg-slate-800/50 border border-slate-700 text-white" /></div>
                <select value={eventTypeFilter} onChange={(e) => setEventTypeFilter(e.target.value)} className="px-4 py-2.5 rounded-xl bg-slate-800/50 border border-slate-700 text-white"><option value="all">All Events</option><option value="order_created">created</option><option value="assigned">assigned</option><option value="delivered">delivered</option></select>
            </div>
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
                <table className="w-full"><thead><tr className="border-b border-slate-700"><th className="px-6 py-4 text-left text-sm text-slate-400">Time</th><th className="px-6 py-4 text-left text-sm text-slate-400">Event</th><th className="px-6 py-4 text-left text-sm text-slate-400">Order</th><th className="px-6 py-4 text-left text-sm text-slate-400">Actor</th></tr></thead>
                    <tbody>{filtered.map((e) => (<tr key={e.id} className="border-b border-slate-700/50 hover:bg-slate-700/30"><td className="px-6 py-4 text-white text-sm">{format(new Date(e.event_time), 'PP pp')}</td><td className="px-6 py-4"><span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs ${getEventColor(e.event_type)}`}>{getEventIcon(e.event_type)}{e.event_type.replace(/_/g, ' ')}</span></td><td className="px-6 py-4"><a href={`/orders/${e.order_id}`} className="text-amber-400 font-mono text-sm">{e.order_id?.substring(0, 8)}...</a></td><td className="px-6 py-4 text-slate-400 text-sm">{e.actor_role}: {e.actor_id.substring(0, 8)}</td></tr>))}</tbody></table>
                {filtered.length === 0 && !loading && <div className="py-12 text-center text-slate-400">No events found</div>}
                {loading && <div className="py-12 text-center"><RefreshCw size={32} className="text-amber-500 mx-auto animate-spin" /></div>}
                {hasMore && !loading && <div className="p-4 border-t border-slate-700 flex justify-center"><button onClick={() => fetchEvents(true)} className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300">Load More</button></div>}
            </div>
        </div>
    );
}
