import { describe, expect, it } from "vitest";
import { gradeForGpa, gradeForPercentage, rankResults, studentResult, subjectResult, type MarkInput, type SubjectConfig } from "../src/modules/exams/grading.js";

const english: SubjectConfig = { subjectId: "eng", subjectName: "English", theoryFullMarks: 100, theoryPassMarks: 35, practicalFullMarks: 0, practicalPassMarks: 0, creditHours: 4 };
const science: SubjectConfig = { subjectId: "sci", subjectName: "Science", theoryFullMarks: 75, theoryPassMarks: 27, practicalFullMarks: 25, practicalPassMarks: 10, creditHours: 5 };
const present = (theory: number | null, practical: number | null = null): MarkInput => ({ theory, practical, status: "PRESENT" });

describe("grade bands (NEB)", () => {
  it.each([
    [100, "A+"],
    [90, "A+"],
    [89.99, "A"],
    [80, "A"],
    [70, "B+"],
    [60, "B"],
    [50, "C+"],
    [40, "C"],
    [35, "D"],
    [34.99, "NG"],
    [0, "NG"],
  ])("%s%% → %s", (percentage, grade) => {
    expect(gradeForPercentage(percentage).grade).toBe(grade);
  });

  it.each([
    [4, "A+"],
    [3.61, "A+"],
    [3.6, "A"],
    [3.21, "A"],
    [2.85, "B+"],
    [2.7, "B"],
    [2.4, "C+"],
    [1.8, "C"],
    [1.6, "D"],
    [0.8, "D"],
    [0, "NG"],
  ])("GPA %s → %s (NEB)", (gpa, grade) => {
    expect(gradeForGpa(gpa)).toBe(grade);
  });
});

describe("subject result", () => {
  it("adds theory and practical and grades the total", () => {
    const result = subjectResult(science, present(60, 22));
    expect(result.obtained).toBe(82);
    expect(result.percentage).toBe(82);
    expect(result.grade).toBe("A");
    expect(result.gradePoint).toBe(3.6);
    expect(result.theoryGrade).toBe("A");
    expect(result.practicalGrade).toBe("A");
    expect(result.outcome).toBe("PASS");
  });

  it("fails the subject when the theory part is below pass marks, even with a good total", () => {
    const result = subjectResult(science, present(25, 25));
    expect(result.obtained).toBe(50);
    expect(result.outcome).toBe("FAIL");
    expect(result.grade).toBe("NG");
    expect(result.gradePoint).toBe(0);
  });

  it("handles absent, medical and missing marks", () => {
    expect(subjectResult(english, { theory: null, practical: null, status: "ABSENT" }).outcome).toBe("ABSENT");
    expect(subjectResult(english, { theory: null, practical: null, status: "MEDICAL" }).grade).toBe("MED");
    expect(subjectResult(english, undefined).outcome).toBe("MISSING");
    expect(subjectResult(science, present(60, null)).outcome).toBe("MISSING");
  });
});

describe("student result", () => {
  it("weights GPA by credit hours", () => {
    // English 92 → A+ (4.0 × 4 credits), Science 82 → A (3.6 × 5 credits) → (16 + 18) / 9 = 3.78
    const result = studentResult([english, science], new Map([["eng", present(92)], ["sci", present(60, 22)]]));
    expect(result.gpa).toBe(3.78);
    expect(result.grade).toBe("A+");
    expect(result.totalObtained).toBe(174);
    expect(result.totalFull).toBe(200);
    expect(result.percentage).toBe(87);
    expect(result.result).toBe("PASS");
  });

  it("is FAIL when a subject is failed or absent, INCOMPLETE when marks are missing", () => {
    expect(studentResult([english, science], new Map([["eng", present(20)], ["sci", present(60, 22)]])).result).toBe("FAIL");
    expect(studentResult([english, science], new Map([["eng", { theory: null, practical: null, status: "ABSENT" }], ["sci", present(60, 22)]])).result).toBe("FAIL");
    expect(studentResult([english, science], new Map([["eng", present(80)]])).result).toBe("INCOMPLETE");
  });

  it("leaves medical subjects out of the GPA", () => {
    const result = studentResult([english, science], new Map([["eng", present(92)], ["sci", { theory: null, practical: null, status: "MEDICAL" }]]));
    expect(result.gpa).toBe(4);
    expect(result.result).toBe("INCOMPLETE");
  });

  it("uses a school's own grading scale", () => {
    const passFail = [
      { min: 40, grade: "P", gradePoint: 1, remark: "Pass" },
      { min: 0, grade: "F", gradePoint: 0, remark: "Fail" },
    ];
    expect(subjectResult(english, present(55), passFail).grade).toBe("P");
  });
});

describe("ranking", () => {
  it("ranks passed students by GPA then percentage, with shared ranks for ties", () => {
    const make = (name: string, gpa: number, percentage: number, result: "PASS" | "FAIL" = "PASS") => ({
      name,
      result: { gpa, percentage, result, subjects: [], totalObtained: 0, totalFull: 0, grade: "" },
    });
    const students = [make("a", 3.6, 85), make("b", 4, 95), make("c", 3.6, 85), make("d", 3.2, 70), make("e", 0, 20, "FAIL")];
    const ranks = rankResults(students);
    expect(students.map((s) => ranks.get(s))).toEqual([2, 1, 2, 4, null]);
  });
});
