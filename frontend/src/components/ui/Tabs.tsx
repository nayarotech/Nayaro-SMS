import clsx from "clsx";

interface TabsProps<T extends string> {
  tabs: { key: T; label: string; hidden?: boolean }[];
  active: T;
  onChange: (key: T) => void;
}

export function Tabs<T extends string>({ tabs, active, onChange }: TabsProps<T>) {
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs
        .filter((t) => !t.hidden)
        .map((tab) => (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={clsx(
              "-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium",
              active === tab.key ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {tab.label}
          </button>
        ))}
    </div>
  );
}
