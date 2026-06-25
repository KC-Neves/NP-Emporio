import { useMemo, useRef, useState } from "react";

interface DeliveryZone {
  id: string | number;
  neighborhood: string;
  zone_label?: string;
  fee: number;
  min_order?: number;
  avg_time?: string;
  estimated_time?: string;
  active: boolean;
}

interface Props {
  zones: DeliveryZone[];
  value: string;
  onChange: (value: string) => void;
}

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const priorityNeighborhoods = [
  "Sussuarana Velha",
  "Sussuarana Nova",
  "Sussuarana",
  "Nova Sussuarana",
  "Novo Horizonte",
  "CAB",
  "Centro Administrativo da Bahia",
  "Tancredo Neves",
  "Arenoso",
  "Narandiba",
  "Mata Escura",
  "Pernambués",
  "Cabula",
  "São Marcos",
];

export default function NeighborhoodSelector({ zones, value, onChange }: Props) {
  const [search, setSearch] = useState(value || "");
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const blurTimeout = useRef<number | null>(null);

  const uniqueActiveZones = useMemo(() => {
    const map = new Map<string, DeliveryZone>();

    zones
      .filter((z) => z.active)
      .forEach((z) => {
        const key = normalize(z.neighborhood);
        if (!map.has(key)) map.set(key, z);
      });

    return Array.from(map.values());
  }, [zones]);

  const filteredZones = useMemo(() => {
    const term = normalize(search);

    const list = uniqueActiveZones.filter((z) => {
      if (!term) return true;
      return normalize(z.neighborhood).includes(term);
    });

    return list
      .sort((a, b) => {
        const aPriority = priorityNeighborhoods.indexOf(a.neighborhood);
        const bPriority = priorityNeighborhoods.indexOf(b.neighborhood);

        if (!search.trim()) {
          if (aPriority !== -1 && bPriority === -1) return -1;
          if (aPriority === -1 && bPriority !== -1) return 1;
          if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;
        }

        return a.neighborhood.localeCompare(b.neighborhood, "pt-BR");
      })
      .slice(0, 60);
  }, [uniqueActiveZones, search]);

  const selectedZone = uniqueActiveZones.find(
    (z) => normalize(z.neighborhood) === normalize(value)
  );

  const selectZone = (zone: DeliveryZone) => {
    if (blurTimeout.current) window.clearTimeout(blurTimeout.current);
    setSearch(zone.neighborhood);
    onChange(zone.neighborhood);
    setOpen(false);
    setHighlightedIndex(0);
  };

  return (
    <div className="relative">
      <div className="relative">
        <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-np-purple-400"></i>

        <input
          type="text"
          value={search}
          placeholder="Digite seu bairro..."
          onFocus={() => setOpen(true)}
          onBlur={() => {
            blurTimeout.current = window.setTimeout(() => setOpen(false), 150);
          }}
          onChange={(e) => {
            setSearch(e.target.value);
            onChange("");
            setOpen(true);
            setHighlightedIndex(0);
          }}
          onKeyDown={(e) => {
            if (!open) return;

            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlightedIndex((prev) =>
                Math.min(prev + 1, filteredZones.length - 1)
              );
            }

            if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlightedIndex((prev) => Math.max(prev - 1, 0));
            }

            if (e.key === "Enter" && filteredZones[highlightedIndex]) {
              e.preventDefault();
              selectZone(filteredZones[highlightedIndex]);
            }

            if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          className="w-full px-4 py-3 pl-10 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm bg-white"
        />
      </div>

      {open && (
        <div className="absolute z-50 mt-2 w-full max-h-80 overflow-y-auto rounded-xl border border-np-wood-200 bg-white shadow-xl">
          {filteredZones.length === 0 ? (
            <div className="px-4 py-4 text-sm text-np-purple-500 text-center">
              Nenhum bairro encontrado.
            </div>
          ) : (
            filteredZones.map((zone, index) => {
              const time = zone.avg_time || zone.estimated_time || "30–50 min";
              const isPriority = priorityNeighborhoods.includes(zone.neighborhood);

              return (
                <button
                  key={zone.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectZone(zone)}
                  className={`w-full text-left px-4 py-3 border-b border-np-wood-100 last:border-b-0 transition-colors ${
                    highlightedIndex === index
                      ? "bg-np-purple-50"
                      : "hover:bg-np-purple-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-np-purple-900">
                        <i className="ri-map-pin-line mr-1 text-np-green-600"></i>
                        {zone.neighborhood}
                        {isPriority && (
                          <span className="ml-2 text-[10px] bg-np-gold-100 text-np-purple-800 px-2 py-0.5 rounded-full">
                            próximo
                          </span>
                        )}
                      </p>

                      <p className="text-xs text-np-purple-500 mt-1">
                        Tempo médio: {time}
                      </p>
                    </div>

                    <span className="text-sm font-bold text-np-green-700 whitespace-nowrap">
                      R$ {Number(zone.fee || 0).toFixed(2)}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      {selectedZone && (
        <p className="text-xs text-np-green-700 mt-2">
          <i className="ri-check-line mr-1"></i>
          Bairro selecionado: <strong>{selectedZone.neighborhood}</strong>
        </p>
      )}
    </div>
  );
}
