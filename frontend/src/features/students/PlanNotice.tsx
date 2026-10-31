import { TriangleAlert, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { usePlan } from "./students.api";

/**
 * Tells staff who admit students how much of the school's plan is used.
 * Hidden until the school is close to its limit (or always, with `always`).
 */
export function PlanNotice({ always = false, className }: { always?: boolean; className?: string }) {
  const { can } = useAuth();
  const { data: plan } = usePlan();
  if (!plan || plan.studentLimit === null || !can(["student.create", "student.edit"])) return null;
  if (!always && !plan.nearLimit) return null;

  const contact = plan.salesContact ? `Contact ${plan.salesContact} to upgrade your plan.` : "Contact us to upgrade your plan.";
  const tone = plan.full ? "border-red-200 bg-red-50 text-red-900" : plan.nearLimit ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-700";
  const percent = Math.min(100, (plan.activeStudents / plan.studentLimit) * 100);

  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3 text-sm", tone, className)} role={plan.full ? "alert" : undefined}>
      {plan.nearLimit ? <TriangleAlert className="size-5 shrink-0" /> : <Users className="size-5 shrink-0 text-slate-400" />}
      <div className="min-w-48 flex-1">
        <p className="font-medium">
          {plan.full
            ? `Student limit reached: ${plan.activeStudents} of ${plan.studentLimit} active students`
            : `${plan.activeStudents} of ${plan.studentLimit} active students`}
          {!plan.full && plan.nearLimit && ` · ${plan.remaining} ${plan.remaining === 1 ? "place" : "places"} left`}
        </p>
        {plan.nearLimit && <p className="mt-0.5">{plan.full ? `New admissions are paused. ${contact}` : contact}</p>}
      </div>
      <span className="h-2 w-32 overflow-hidden rounded-full bg-black/10">
        <span className={cn("block h-full rounded-full", plan.full ? "bg-red-500" : plan.nearLimit ? "bg-amber-500" : "bg-brand")} style={{ width: `${percent}%` }} />
      </span>
    </div>
  );
}
