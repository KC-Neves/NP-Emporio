import { useMemo, useState } from "react";
import { Search, MapPin } from "lucide-react";

interface Zone {
  id: number;
  neighborhood: string;
  fee: number;
  avg_time?: string;
}

interface Props {
  zones: Zone[];
  value: string;
  onChange: (value: string) => void;
}

export default function NeighborhoodAutocomplete({
  zones,
  value,
  onChange,
}: Props) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();

  const filtered = useMemo(() => {
    const term = normalize(search);

    return zones
      .filter((z) =>
        normalize(z.neighborhood).includes(term)
      )
      .sort((a, b) =>
        a.neighborhood.localeCompare(b.neighborhood)
      );
  }, [zones, search]);

  return (
    <div className="relative">
      <div className="relative">

        <Search
          size={18}
          className="absolute left-3 top-3 text-gray-400"
        />

        <input
          placeholder="Digite seu bairro..."
          className="w-full border rounded-lg py-2 pl-10 pr-4"
          value={search || value}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setSearch(e.target.value);
            onChange("");
          }}
        />

      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-80 overflow-y-auto rounded-lg border bg-white shadow-lg">

          {filtered.length === 0 && (
            <div className="p-4 text-center text-gray-500">
              Nenhum bairro encontrado
            </div>
          )}

          {filtered.map((bairro) => (
            <button
              key={bairro.id}
              type="button"
              className="w-full border-b px-4 py-3 text-left hover:bg-purple-50"
              onClick={() => {
                onChange(bairro.neighborhood);
                setSearch(bairro.neighborhood);
                setOpen(false);
              }}
            >
              <div className="flex items-center gap-2">

                <MapPin size={16} />

                <div>

                  <div className="font-semibold">
                    {bairro.neighborhood}
                  </div>

                  <div className="text-sm text-gray-500">
                    🚚 R$ {bairro.fee.toFixed(2)}
                    {" • "}
                    {bairro.avg_time ?? "30–50 min"}
                  </div>

                </div>

              </div>
            </button>
          ))}

        </div>
      )}
    </div>
  );
}