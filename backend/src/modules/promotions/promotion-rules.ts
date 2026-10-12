/**
 * Year-end promotion rules. Pure functions (no database) so they are easy to
 * read and test. The system only *suggests* — staff confirm every student.
 *
 * Settings (Settings → Promotion):
 * - promotion.basis: "finalExam" (pass → promote, fail → detain) or "none" (promote everyone)
 * - promotion.minAttendancePercent: below this, detention is suggested (0 = off)
 */

export type PromotionOutcome = "PROMOTE" | "DETAIN" | "GRADUATE" | "LEAVE";

export interface PromotionRule {
  basis: "finalExam" | "none";
  minAttendancePercent: number;
}

export interface SuggestionInput {
  /** No higher class exists, so passing means graduating */
  isTopClass: boolean;
  /** Result in the exam used for promotion; null when there is none */
  examResult: "PASS" | "FAIL" | "INCOMPLETE" | null;
  attendancePercent: number | null;
}

export interface Suggestion {
  /** null = the system can't tell; staff must decide */
  outcome: PromotionOutcome | null;
  reason: string;
}

export function suggestOutcome(input: SuggestionInput, rule: PromotionRule): Suggestion {
  const moveUp: PromotionOutcome = input.isTopClass ? "GRADUATE" : "PROMOTE";

  if (rule.basis === "finalExam") {
    if (input.examResult === null) return { outcome: null, reason: "No result in the final exam" };
    if (input.examResult === "INCOMPLETE") return { outcome: null, reason: "Result incomplete (marks missing or medical)" };
    if (input.examResult === "FAIL") return { outcome: "DETAIN", reason: "Failed the final exam" };
  }

  if (rule.minAttendancePercent > 0 && input.attendancePercent !== null && input.attendancePercent < rule.minAttendancePercent) {
    return { outcome: "DETAIN", reason: `Attendance ${input.attendancePercent}% is below the required ${rule.minAttendancePercent}%` };
  }

  if (rule.basis === "finalExam") return { outcome: moveUp, reason: input.isTopClass ? "Passed the final exam in the highest class" : "Passed the final exam" };
  return { outcome: moveUp, reason: input.isTopClass ? "Highest class" : "Everyone is promoted" };
}

export type RollNumbering = "rank" | "name" | "keep";

export interface RollCandidate {
  studentId: string;
  name: string;
  previousRollNo: number | null;
  gpa: number | null;
  percentage: number | null;
}

/**
 * Roll numbers for students joining one section in the new year.
 * - rank: best result first (GPA, then percentage), students without a result after them by name
 * - name: alphabetical
 * - keep: last year's roll number where it's free, otherwise the next free number
 * Numbers already used in the section (e.g. new admissions) are never reused.
 */
export function assignRollNumbers(candidates: RollCandidate[], mode: RollNumbering, taken: Iterable<number> = []): Map<string, number> {
  const used = new Set(taken);
  const result = new Map<string, number>();
  const byName = (a: RollCandidate, b: RollCandidate) => a.name.localeCompare(b.name);
  let next = 1;
  const nextFree = () => {
    while (used.has(next)) next++;
    used.add(next);
    return next;
  };

  if (mode === "keep") {
    const sorted = [...candidates].sort((a, b) => (a.previousRollNo ?? Infinity) - (b.previousRollNo ?? Infinity) || byName(a, b));
    const later: RollCandidate[] = [];
    for (const c of sorted) {
      if (c.previousRollNo !== null && !used.has(c.previousRollNo)) {
        used.add(c.previousRollNo);
        result.set(c.studentId, c.previousRollNo);
      } else {
        later.push(c);
      }
    }
    // Students whose old number is taken go after everyone else
    next = Math.max(0, ...used) + 1;
    for (const c of later) result.set(c.studentId, nextFree());
    return result;
  }

  // New numbers start after the highest number already in the section
  next = Math.max(0, ...used) + 1;
  const sorted =
    mode === "rank"
      ? [...candidates].sort((a, b) => {
          if (a.gpa === null && b.gpa === null) return byName(a, b);
          if (a.gpa === null) return 1;
          if (b.gpa === null) return -1;
          return b.gpa - a.gpa || (b.percentage ?? 0) - (a.percentage ?? 0) || byName(a, b);
        })
      : [...candidates].sort(byName);
  for (const c of sorted) result.set(c.studentId, nextFree());
  return result;
}
