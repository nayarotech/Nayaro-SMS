/**
 * Marks → grades, GPA, result and rank. Pure functions (no database), so the
 * rules are easy to read, test and change.
 *
 * Default scale: Nepal's NEB letter grading (used for SEE and school exams).
 * Each school can change the bands in Exams → Grading scale.
 */

export interface GradeBand {
  /** Lowest percentage for this band (inclusive) */
  min: number;
  grade: string;
  gradePoint: number;
  remark: string;
}

export const NEB_GRADING: GradeBand[] = [
  { min: 90, grade: "A+", gradePoint: 4.0, remark: "Outstanding" },
  { min: 80, grade: "A", gradePoint: 3.6, remark: "Excellent" },
  { min: 70, grade: "B+", gradePoint: 3.2, remark: "Very good" },
  { min: 60, grade: "B", gradePoint: 2.8, remark: "Good" },
  { min: 50, grade: "C+", gradePoint: 2.4, remark: "Satisfactory" },
  { min: 40, grade: "C", gradePoint: 2.0, remark: "Acceptable" },
  { min: 35, grade: "D", gradePoint: 1.6, remark: "Basic" },
  { min: 0, grade: "NG", gradePoint: 0, remark: "Not graded" },
];

export interface SubjectConfig {
  subjectId: string;
  subjectName: string;
  theoryFullMarks: number;
  theoryPassMarks: number;
  practicalFullMarks: number;
  practicalPassMarks: number;
  creditHours: number;
}

export interface MarkInput {
  theory: number | null;
  practical: number | null;
  status: "PRESENT" | "ABSENT" | "MEDICAL";
}

export type SubjectOutcome = "PASS" | "FAIL" | "ABSENT" | "MEDICAL" | "MISSING";

export interface SubjectResult {
  subjectId: string;
  subjectName: string;
  creditHours: number;
  fullMarks: number;
  theory: number | null;
  practical: number | null;
  obtained: number | null;
  percentage: number | null;
  grade: string;
  gradePoint: number | null;
  /** Grade for the theory and practical parts separately (shown on NEB-style report cards) */
  theoryGrade: string | null;
  practicalGrade: string | null;
  outcome: SubjectOutcome;
}

export interface StudentResult {
  subjects: SubjectResult[];
  totalObtained: number;
  totalFull: number;
  percentage: number;
  gpa: number | null;
  grade: string;
  /** PASS: every subject passed · FAIL: at least one failed or absent · INCOMPLETE: marks missing or medical */
  result: "PASS" | "FAIL" | "INCOMPLETE";
}

const round = (value: number, places = 2) => Math.round(value * 10 ** places) / 10 ** places;

/** Sorted from the highest band; the first band whose minimum the percentage reaches. */
export function gradeForPercentage(percentage: number, bands: GradeBand[] = NEB_GRADING): GradeBand {
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  return sorted.find((band) => percentage >= band.min) ?? sorted[sorted.length - 1];
}

/**
 * Overall grade for a GPA. Each grade covers GPAs up to and including its grade
 * point (NEB: 3.61–4.00 A+, 3.21–3.60 A, 2.81–3.20 B+, 2.41–2.80 B, 2.01–2.40 C+,
 * 1.61–2.00 C, up to 1.60 D; 0 is NG).
 */
export function gradeForGpa(gpa: number, bands: GradeBand[] = NEB_GRADING): string {
  const sorted = [...bands].sort((a, b) => a.gradePoint - b.gradePoint);
  if (gpa <= sorted[0].gradePoint) return sorted[0].grade;
  return (sorted.find((band) => band.gradePoint >= gpa) ?? sorted[sorted.length - 1]).grade;
}

export function subjectResult(config: SubjectConfig, mark: MarkInput | undefined, bands: GradeBand[] = NEB_GRADING): SubjectResult {
  const fullMarks = config.theoryFullMarks + config.practicalFullMarks;
  const base = {
    subjectId: config.subjectId,
    subjectName: config.subjectName,
    creditHours: config.creditHours,
    fullMarks,
    theory: mark?.theory ?? null,
    practical: mark?.practical ?? null,
    theoryGrade: null,
    practicalGrade: null,
  };

  if (mark?.status === "ABSENT") return { ...base, obtained: 0, percentage: 0, grade: "ABS", gradePoint: 0, outcome: "ABSENT" };
  if (mark?.status === "MEDICAL") return { ...base, obtained: null, percentage: null, grade: "MED", gradePoint: null, outcome: "MEDICAL" };

  const hasPractical = config.practicalFullMarks > 0;
  if (!mark || mark.theory === null || (hasPractical && mark.practical === null)) {
    return { ...base, obtained: null, percentage: null, grade: "—", gradePoint: null, outcome: "MISSING" };
  }

  const theory = mark.theory;
  const practical = hasPractical ? (mark.practical ?? 0) : 0;
  const obtained = round(theory + practical);
  const percentage = round((obtained / fullMarks) * 100);
  const passed = theory >= config.theoryPassMarks && (!hasPractical || practical >= config.practicalPassMarks);
  const band = gradeForPercentage(percentage, bands);
  const failBand = [...bands].sort((a, b) => a.min - b.min)[0];

  return {
    ...base,
    obtained,
    percentage,
    // Failing either part means the subject isn't graded, whatever the total
    grade: passed ? band.grade : failBand.grade,
    gradePoint: passed ? band.gradePoint : failBand.gradePoint,
    theoryGrade: gradeForPercentage((theory / config.theoryFullMarks) * 100, bands).grade,
    practicalGrade: hasPractical ? gradeForPercentage((practical / config.practicalFullMarks) * 100, bands).grade : null,
    outcome: passed ? "PASS" : "FAIL",
  };
}

export function studentResult(configs: SubjectConfig[], marks: Map<string, MarkInput>, bands: GradeBand[] = NEB_GRADING): StudentResult {
  const subjects = configs.map((config) => subjectResult(config, marks.get(config.subjectId), bands));
  // Medical and missing subjects don't count towards totals or GPA
  const counted = subjects.filter((s) => s.outcome !== "MEDICAL" && s.outcome !== "MISSING");

  const totalObtained = round(counted.reduce((sum, s) => sum + (s.obtained ?? 0), 0));
  const totalFull = counted.reduce((sum, s) => sum + s.fullMarks, 0);
  const credits = counted.reduce((sum, s) => sum + s.creditHours, 0);
  const gpa = credits > 0 ? round(counted.reduce((sum, s) => sum + (s.gradePoint ?? 0) * s.creditHours, 0) / credits) : null;

  const result = subjects.some((s) => s.outcome === "MISSING" || s.outcome === "MEDICAL")
    ? "INCOMPLETE"
    : subjects.some((s) => s.outcome === "FAIL" || s.outcome === "ABSENT")
      ? "FAIL"
      : "PASS";

  return {
    subjects,
    totalObtained,
    totalFull,
    percentage: totalFull > 0 ? round((totalObtained / totalFull) * 100) : 0,
    gpa,
    grade: result === "FAIL" ? "NG" : gpa === null ? "—" : gradeForGpa(gpa, bands),
    result,
  };
}

/**
 * Ranks by GPA, then percentage. Equal scores share a rank (1, 2, 2, 4).
 * Only students with a complete PASS result are ranked.
 */
export function rankResults<T extends { result: StudentResult }>(items: T[]): Map<T, number | null> {
  const ranks = new Map<T, number | null>();
  const ranked = items
    .filter((item) => item.result.result === "PASS")
    .sort((a, b) => (b.result.gpa ?? 0) - (a.result.gpa ?? 0) || b.result.percentage - a.result.percentage);

  ranked.forEach((item, index) => {
    const previous = ranked[index - 1];
    const tied = previous && previous.result.gpa === item.result.gpa && previous.result.percentage === item.result.percentage;
    ranks.set(item, tied ? ranks.get(previous)! : index + 1);
  });
  for (const item of items) if (!ranks.has(item)) ranks.set(item, null);
  return ranks;
}
