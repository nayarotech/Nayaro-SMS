import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/form";
import { api, type Paginated } from "@/lib/api";
import type { Guardian } from "./students.api";

/** Search existing guardians (e.g. a sibling's parent) by name, phone or child's name. */
export function GuardianPicker({ onPick }: { onPick: (guardian: Guardian) => void }) {
  const [search, setSearch] = useState("");
  const { data, isFetching } = useQuery({
    queryKey: ["guardians", "picker", search],
    queryFn: () => api.get<Paginated<Guardian>>("/guardians", { search, pageSize: 6 }),
    enabled: search.trim().length >= 2,
  });

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400" />
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search parent by name, phone or a sibling's name…" className="pl-9" autoFocus />
      {search.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          {isFetching && !data ? (
            <p className="px-3 py-2 text-sm text-slate-500">Searching…</p>
          ) : !data?.items.length ? (
            <p className="px-3 py-2 text-sm text-slate-500">No parent found. Enter new details instead.</p>
          ) : (
            data.items.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => onPick(g)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="font-medium text-slate-900">{g.fullName}</span>
                <span className="ml-2 text-slate-500">{g.phone}</span>
                {g.children.length > 0 && (
                  <span className="block text-xs text-slate-500">Parent of {g.children.map((c) => `${c.name} (${c.classSection ?? "—"})`).join(", ")}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
