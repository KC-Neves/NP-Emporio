import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface Reservation {
  id: string;
  userId?: string;
  name: string;
  email: string;
  phone: string;
  reservationType: 'brunch' | 'cafe_com_prosa' | 'aniversario' | 'mesa_comum';
  date: string;
  time: string;
  guests: number;
  notes?: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  createdAt: string;
}

interface DbReservation {
  id: string;
  user_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  reservation_type: string;
  date: string;
  time: string;
  guests: number;
  notes: string | null;
  status: string;
  created_at: string;
}

function mapDbToReservation(row: DbReservation): Reservation {
  return {
    id: row.id,
    userId: row.user_id || undefined,
    name: row.name,
    email: row.email || '',
    phone: row.phone || '',
    reservationType: row.reservation_type as Reservation['reservationType'],
    date: row.date,
    time: row.time,
    guests: row.guests,
    notes: row.notes || undefined,
    status: row.status as Reservation['status'],
    createdAt: row.created_at,
  };
}

export function useReservations() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const fetchReservations = async () => {
      try {
        const { data, error } = await supabase
          .from('reservations')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('[useReservations] Erro ao buscar reservas:', error);
        }

        if (mounted && data && !error) {
          setReservations((data as DbReservation[]).map(mapDbToReservation));
        }
      } catch (err) {
        console.error('[useReservations] Exceção em fetchReservations:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchReservations();
    return () => {
      mounted = false;
    };
  }, []);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('reservations-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reservations' },
        (payload) => {
          const newRes = mapDbToReservation(payload.new as DbReservation);
          setReservations((prev) => {
            if (prev.some((r) => r.id === newRes.id)) return prev;
            return [newRes, ...prev];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'reservations' },
        (payload) => {
          const updated = mapDbToReservation(payload.new as DbReservation);
          setReservations((prev) =>
            prev.map((r) => (r.id === updated.id ? updated : r))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const addReservation = useCallback(
    async (data: Omit<Reservation, 'id' | 'createdAt' | 'status'>) => {
      const newId = crypto.randomUUID();
      const { data: result, error } = await supabase
        .from('reservations')
        .insert({
          id: newId,
          user_id: data.userId || null,
          name: data.name,
          email: data.email,
          phone: data.phone,
          reservation_type: data.reservationType,
          date: data.date,
          time: data.time,
          guests: data.guests,
          notes: data.notes || null,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      if (result) {
        const mapped = mapDbToReservation(result as DbReservation);
        setReservations((prev) => {
          if (prev.some((r) => r.id === mapped.id)) return prev;
          return [mapped, ...prev];
        });
        return mapped.id;
      }
      return newId;
    },
    []
  );

  const cancelReservation = useCallback(async (id: string) => {
    setReservations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'cancelled' as const } : r))
    );
    await supabase.from('reservations').update({ status: 'cancelled' }).eq('id', id);
  }, []);

  const confirmReservation = useCallback(async (id: string) => {
    setReservations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'confirmed' as const } : r))
    );
    await supabase.from('reservations').update({ status: 'confirmed' }).eq('id', id);
  }, []);

  const deleteReservation = useCallback(async (id: string) => {
    const { error } = await supabase.from('reservations').delete().eq('id', id);
    if (error) {
      console.error('[useReservations] deleteReservation error:', error);
      return { error };
    }
    setReservations((prev) => prev.filter((r) => r.id !== id));
    return { error: null };
  }, []);

  const deleteTestReservations = useCallback(async () => {
    const { data: deleted, error } = await supabase
      .from('reservations')
      .delete()
      .ilike('name', '%teste%')
      .select('id');
    if (error) {
      console.error('[useReservations] deleteTestReservations error:', error);
      return { error, deletedCount: 0 };
    }
    const count = deleted?.length || 0;
    if (count > 0) {
      const deletedIds = new Set((deleted || []).map((d: { id: string }) => d.id));
      setReservations((prev) => prev.filter((r) => !deletedIds.has(r.id)));
    }
    return { error: null, deletedCount: count };
  }, []);

  const updateReservation = useCallback(async (id: string, updates: Partial<Pick<Reservation, 'name' | 'email' | 'phone' | 'date' | 'time' | 'guests' | 'notes' | 'status'>>) => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.email !== undefined) dbUpdates.email = updates.email || null;
    if (updates.phone !== undefined) dbUpdates.phone = updates.phone || null;
    if (updates.date !== undefined) dbUpdates.date = updates.date;
    if (updates.time !== undefined) dbUpdates.time = updates.time;
    if (updates.guests !== undefined) dbUpdates.guests = updates.guests;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes || null;
    if (updates.status !== undefined) dbUpdates.status = updates.status;

    const { error } = await supabase.from('reservations').update(dbUpdates).eq('id', id);
    if (error) {
      console.error('[useReservations] updateReservation error:', error);
      return { error };
    }

    setReservations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updates } : r))
    );
    return { error: null };
  }, []);

  return { reservations, loading, addReservation, cancelReservation, confirmReservation, updateReservation, deleteReservation, deleteTestReservations };
}