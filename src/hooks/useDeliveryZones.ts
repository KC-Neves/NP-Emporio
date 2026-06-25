import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";

export interface DeliveryZone {
  id: string;
  neighborhood: string;
  zone_label: string;
  fee: number;
  min_order: number;
  avg_time: string;
  active: boolean;
  created_at: string;
}

export interface ZoneFormData {
  neighborhood: string;
  zone_label: string;
  fee: number;
  min_order?: number;
  avg_time?: string;
  active?: boolean;
}

function normalizeZone(row: any): DeliveryZone {
  return {
    id: String(row.id),
    neighborhood: row.neighborhood || row.name || "",
    zone_label: row.zone_label || row.neighborhood || row.name || "Geral",
    fee: Number(row.fee ?? row.delivery_fee ?? 0),
    min_order: Number(row.min_order ?? 0),
    avg_time: row.avg_time || row.estimated_time || "30-50 min",
    active: Boolean(row.active ?? row.is_active ?? true),
    created_at: row.created_at || "",
  };
}

export function useDeliveryZones() {
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchZones = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: supaError } = await supabase
        .from("delivery_zones")
        .select("*")
        .order("display_order", { ascending: true })
        .order("neighborhood", { ascending: true });

      if (supaError) throw supaError;

      setZones((data || []).map(normalizeZone));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar taxas");
      setZones([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchZones();
  }, [fetchZones]);

  const createZone = useCallback(async (form: ZoneFormData) => {
    const { data, error: supaError } = await supabase
      .from("delivery_zones")
      .insert({
        neighborhood: form.neighborhood.trim(),
        name: form.neighborhood.trim(),
        zone_label: form.zone_label.trim(),
        fee: form.fee,
        delivery_fee: form.fee,
        min_order: form.min_order ?? 0,
        avg_time: form.avg_time?.trim() || "30-50 min",
        estimated_time: form.avg_time?.trim() || "30-50 min",
        active: form.active ?? true,
        is_active: form.active ?? true,
      })
      .select("*")
      .single();

    if (supaError) {
      return { data: null, error: new Error(supaError.message) };
    }

    const normalized = normalizeZone(data);
    setZones((prev) => [...prev, normalized]);
    return { data: normalized, error: null };
  }, []);

  const updateZone = useCallback(async (id: string, form: Partial<ZoneFormData>) => {
    const payload: Record<string, unknown> = {};

    if (form.neighborhood !== undefined) {
      payload.neighborhood = form.neighborhood.trim();
      payload.name = form.neighborhood.trim();
    }

    if (form.zone_label !== undefined) payload.zone_label = form.zone_label.trim();

    if (form.fee !== undefined) {
      payload.fee = form.fee;
      payload.delivery_fee = form.fee;
    }

    if (form.min_order !== undefined) payload.min_order = form.min_order;

    if (form.avg_time !== undefined) {
      payload.avg_time = form.avg_time?.trim();
      payload.estimated_time = form.avg_time?.trim();
    }

    if (form.active !== undefined) {
      payload.active = form.active;
      payload.is_active = form.active;
    }

    const { data, error: supaError } = await supabase
      .from("delivery_zones")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();

    if (supaError) {
      return { data: null, error: new Error(supaError.message) };
    }

    const normalized = normalizeZone(data);
    setZones((prev) => prev.map((z) => (z.id === id ? normalized : z)));
    return { data: normalized, error: null };
  }, []);

  const deleteZone = useCallback(async (id: string) => {
    const { error: supaError } = await supabase
      .from("delivery_zones")
      .delete()
      .eq("id", id);

    if (supaError) {
      return { error: new Error(supaError.message) };
    }

    setZones((prev) => prev.filter((z) => z.id !== id));
    return { error: null };
  }, []);

  const getFeeByNeighborhood = useCallback(
    (neighborhood: string): number => {
      const trimmed = neighborhood.trim().toLowerCase();
      const match = zones.find(
        (z) => z.active && z.neighborhood.toLowerCase() === trimmed
      );
      return match ? Number(match.fee) : 0;
    },
    [zones]
  );

  const getZoneByNeighborhood = useCallback(
    (neighborhood: string): DeliveryZone | undefined => {
      const trimmed = neighborhood.trim().toLowerCase();
      return zones.find(
        (z) => z.active && z.neighborhood.toLowerCase() === trimmed
      );
    },
    [zones]
  );

  const getZoneLabel = useCallback(
    (neighborhood: string): string | null => {
      const trimmed = neighborhood.trim().toLowerCase();
      const match = zones.find(
        (z) => z.active && z.neighborhood.toLowerCase() === trimmed
      );
      return match ? match.zone_label : null;
    },
    [zones]
  );

  const activeZones = useMemo(() => zones.filter((z) => z.active), [zones]);

  const zonesByLabel = useMemo(() => {
    const map = new Map<string, DeliveryZone[]>();

    for (const z of activeZones) {
      if (!map.has(z.zone_label)) {
        map.set(z.zone_label, []);
      }
      map.get(z.zone_label)!.push(z);
    }

    return map;
  }, [activeZones]);

  return {
    zones,
    activeZones,
    zonesByLabel,
    loading,
    error,
    refresh: fetchZones,
    createZone,
    updateZone,
    deleteZone,
    getFeeByNeighborhood,
    getZoneByNeighborhood,
    getZoneLabel,
  };
}