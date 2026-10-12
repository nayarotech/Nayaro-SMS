import clsx from "clsx";
import { useState } from "react";
import { adToBs, bsToAd } from "@/lib/dates";
import { Input } from "./form";

interface DateInputProps {
  /** AD date "YYYY-MM-DD" (what the API stores) or "" */
  value: string;
  onChange: (adDate: string) => void;
  disabled?: boolean;
  /** Which calendar to type in. Defaults to BS. */
  calendar?: "bs" | "ad";
}

const display = (ad: string, calendar: "bs" | "ad") => (ad ? (calendar === "bs" ? (adToBs(ad) ?? "") : ad) : "");

/**
 * Date field that lets people type in Bikram Sambat (or AD) and always
 * gives back an AD date. Shows the other calendar's date underneath.
 */
export function DateInput({ value, onChange, disabled, calendar: initialCalendar = "bs" }: DateInputProps) {
  const [calendar, setCalendar] = useState<"bs" | "ad">(initialCalendar);
  const [text, setText] = useState(() => display(value, calendar));

  // When the value or calendar changes from outside, show it (React's "adjust state while rendering" pattern)
  const [shown, setShown] = useState({ value, calendar });
  if (shown.value !== value || shown.calendar !== calendar) {
    setShown({ value, calendar });
    setText(display(value, calendar));
  }

  const complete = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const converted = complete ? (calendar === "bs" ? bsToAd(text) : adToBs(text)) : null;
  const invalid = complete && !converted;

  const onText = (next: string) => {
    setText(next);
    if (!next) return onChange("");
    if (/^\d{4}-\d{2}-\d{2}$/.test(next)) {
      const ad = calendar === "bs" ? bsToAd(next) : next;
      if (ad && adToBs(ad)) onChange(ad);
    }
  };

  return (
    <div>
      <div className="flex">
        <Input
          value={text}
          onChange={(e) => onText(e.target.value)}
          placeholder={calendar === "bs" ? "2082-01-15" : "2025-04-28"}
          disabled={disabled}
          className={clsx("rounded-r-none", invalid && "border-red-400")}
        />
        <div className="flex shrink-0 rounded-r-lg border border-l-0 border-slate-300 bg-slate-50 p-0.5 text-xs">
          {(["bs", "ad"] as const).map((c) => (
            <button
              key={c}
              type="button"
              disabled={disabled}
              onClick={() => setCalendar(c)}
              className={clsx("rounded-md px-2 font-medium uppercase", calendar === c ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <p className={clsx("mt-1 text-xs", invalid ? "text-red-600" : "text-slate-500")}>
        {invalid ? "Not a valid date" : converted ? `= ${converted} ${calendar === "bs" ? "AD" : "BS"}` : "YYYY-MM-DD"}
      </p>
    </div>
  );
}
