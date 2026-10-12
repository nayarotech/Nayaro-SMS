import clsx from "clsx";
import type { ReactNode } from "react";
import { EmptyState, Spinner } from "./display";

export interface Column<T> {
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
}

/** A simple data table. Scrolls horizontally on small screens. */
export function Table<T>({ columns, rows, rowKey, loading, empty, onRowClick }: TableProps<T>) {
  if (loading) return <Spinner />;
  if (!rows?.length) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/60">
            {columns.map((column, index) => (
              <th key={index} className={clsx("px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500", column.className)}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={clsx(onRowClick && "cursor-pointer hover:bg-slate-50")}
            >
              {columns.map((column, index) => (
                <td key={index} className={clsx("px-4 py-3 align-middle text-slate-700", column.className)}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
      <span>
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </span>
      <div className="flex gap-2">
        <button className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </button>
        <button className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
