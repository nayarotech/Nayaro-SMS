/**
 * Builds a realistic demo school through the real services (so audit logs,
 * admission numbers, guardian matching etc. all behave as in production).
 */
import { bsToAd } from "../src/lib/nepali-date.js";
import { prisma } from "../src/lib/prisma.js";
import type { Actor } from "../src/modules/audit/audit.service.js";
import { createAcademicYear } from "../src/modules/academic/academic-year.service.js";
import { addSubjectTeacher, setClassTeacher } from "../src/modules/academic/assignment.service.js";
import { createClass, setClassSubjects } from "../src/modules/academic/class.service.js";
import { createSubject } from "../src/modules/academic/subject.service.js";
import { createPeriod, setTimetableSlot } from "../src/modules/academic/timetable.service.js";
import { SYSTEM_ROLE_KEYS } from "../src/modules/permissions/default-roles.js";
import { admitStudent } from "../src/modules/students/student.service.js";
import { createUser } from "../src/modules/users/user.service.js";
import type { Gender, GuardianRelation } from "../src/generated/prisma/client.js";

// Small deterministic random generator so every seed run produces the same school
let state = 20820101;
const random = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];

const BOYS = ["Aarav", "Bibek", "Sujan", "Prabin", "Nabin", "Rohan", "Kushal", "Anish", "Sagar", "Bishal", "Aayush", "Suman", "Ritesh", "Kiran", "Dipesh", "Saurav"];
const GIRLS = ["Aasha", "Sita", "Pooja", "Srijana", "Anjali", "Prakriti", "Sabina", "Nisha", "Riya", "Shristi", "Kritika", "Sneha", "Aakriti", "Manisha", "Puja", "Sarita"];
const SURNAMES = ["Sharma", "Shrestha", "Adhikari", "Thapa", "Karki", "Gurung", "Tamang", "Rai", "Magar", "Poudel", "Bhandari", "KC", "Maharjan", "Basnet", "Koirala", "Joshi"];
const FATHERS = ["Ram", "Hari", "Krishna", "Shyam", "Gopal", "Bikash", "Rajesh", "Dinesh", "Mahesh", "Suresh", "Ramesh", "Prakash"];
const MOTHERS = ["Gita", "Sunita", "Kamala", "Laxmi", "Radha", "Sarita", "Bimala", "Mina", "Anita", "Durga", "Parbati", "Rita"];
const OCCUPATIONS = ["Business", "Teacher", "Farmer", "Government service", "Engineer", "Driver", "Shopkeeper", "Nurse", "Banker", "Homemaker"];
const PLACES = ["Baneshwor", "Koteshwor", "Kalanki", "Balaju", "Chabahil", "Lalitpur", "Bhaktapur", "Kirtipur", "Budhanilkantha", "Maharajgunj"];

const CLASSES = ["Nursery", "LKG", "UKG", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10"];
const SUBJECTS = [
  { name: "English", code: "ENG" },
  { name: "Nepali", code: "NEP" },
  { name: "Mathematics", code: "MATH" },
  { name: "Science", code: "SCI", hasPractical: true },
  { name: "Social Studies", code: "SOC" },
  { name: "Computer", code: "COMP", hasPractical: true },
  { name: "Health & Physical Education", code: "HPE" },
  { name: "Optional Mathematics", code: "OPT" },
  { name: "Drawing", code: "DRW" },
];

const STAFF = [
  { fullName: "Ramesh Koirala", designation: "Principal", roles: [SYSTEM_ROLE_KEYS.principal], phone: "9800000002" },
  { fullName: "Binita Joshi", designation: "Accountant", roles: [SYSTEM_ROLE_KEYS.accountant], phone: "9800000003" },
  { fullName: "Kamal Thapa", designation: "Homework Coordinator", roles: [SYSTEM_ROLE_KEYS.homeworkCoordinator], phone: "9800000004" },
  { fullName: "Sunita Gurung", designation: "English Teacher", roles: [SYSTEM_ROLE_KEYS.classTeacher, SYSTEM_ROLE_KEYS.subjectTeacher], phone: "9800000011" },
  { fullName: "Hari Prasad Adhikari", designation: "Nepali Teacher", roles: [SYSTEM_ROLE_KEYS.classTeacher, SYSTEM_ROLE_KEYS.subjectTeacher], phone: "9800000012" },
  { fullName: "Deepak Shrestha", designation: "Mathematics Teacher", roles: [SYSTEM_ROLE_KEYS.classTeacher, SYSTEM_ROLE_KEYS.subjectTeacher], phone: "9800000013" },
  { fullName: "Anita Rai", designation: "Science Teacher", roles: [SYSTEM_ROLE_KEYS.classTeacher, SYSTEM_ROLE_KEYS.subjectTeacher], phone: "9800000014" },
  { fullName: "Bikash Magar", designation: "Social Studies Teacher", roles: [SYSTEM_ROLE_KEYS.classTeacher, SYSTEM_ROLE_KEYS.subjectTeacher], phone: "9800000015" },
  { fullName: "Pratima Tamang", designation: "Computer Teacher", roles: [SYSTEM_ROLE_KEYS.subjectTeacher], phone: "9800000016" },
  { fullName: "Rajan KC", designation: "HPE Teacher", roles: [SYSTEM_ROLE_KEYS.subjectTeacher], phone: "9800000017" },
  { fullName: "Mina Basnet", designation: "Pre-primary Teacher", roles: [SYSTEM_ROLE_KEYS.classTeacher, SYSTEM_ROLE_KEYS.subjectTeacher], phone: "9800000018" },
  { fullName: "Suresh Poudel", designation: "Primary Teacher", roles: [SYSTEM_ROLE_KEYS.classTeacher, SYSTEM_ROLE_KEYS.subjectTeacher], phone: "9800000019" },
];

/** Which teacher (by designation keyword) teaches which subject. */
const SUBJECT_TEACHER: Record<string, string> = {
  English: "English",
  Nepali: "Nepali",
  Mathematics: "Mathematics",
  "Optional Mathematics": "Mathematics",
  Science: "Science",
  "Social Studies": "Social Studies",
  Computer: "Computer",
  "Health & Physical Education": "HPE",
  Drawing: "Pre-primary",
};

export async function buildDemoSchool(schoolId: string, adminUserId: string, password: string) {
  const actor: Actor = { userId: adminUserId, schoolId };
  const roles = await prisma.role.findMany({ where: { schoolId } });
  const roleId = (key: string) => roles.find((r) => r.key === key)!.id;

  // Academic years: last year (2082) and the current one (2083)
  await createAcademicYear(actor, { name: "2082", startDate: bsToAd("2082-01-01"), endDate: bsToAd("2082-12-30") });
  const year = await createAcademicYear(actor, { name: "2083", startDate: bsToAd("2083-01-01"), endDate: bsToAd("2083-12-30"), isCurrent: true });

  // Subjects
  const subjects = new Map<string, string>();
  for (const subject of SUBJECTS) subjects.set(subject.name, (await createSubject(actor, subject)).id);

  // Classes, sections and curriculum
  const classes: { id: string; name: string; sections: { id: string; name: string }[] }[] = [];
  for (const [index, name] of CLASSES.entries()) {
    const sectionNames = index >= 3 && index <= 8 ? ["A", "B"] : ["A"];
    const created = await createClass(actor, { name, order: index + 1, sections: sectionNames });
    const preprimary = index < 3;
    const studied = preprimary
      ? ["English", "Nepali", "Mathematics", "Drawing"]
      : ["English", "Nepali", "Mathematics", "Science", "Social Studies", "Computer", "Health & Physical Education", ...(index >= 11 ? ["Optional Mathematics"] : [])];
    await setClassSubjects(actor, created.id, studied.map((s) => ({ subjectId: subjects.get(s)!, isOptional: s === "Optional Mathematics" || s === "Computer" })));
    const sections = await prisma.section.findMany({ where: { classId: created.id }, orderBy: { name: "asc" } });
    classes.push({ id: created.id, name, sections });
  }

  // Staff
  const staff: { id: string; designation: string }[] = [];
  for (const [index, person] of STAFF.entries()) {
    const created = await createUser(actor, {
      fullName: person.fullName,
      phone: person.phone,
      email: `${person.fullName.split(" ")[0].toLowerCase()}@demo.school`,
      password,
      roleIds: person.roles.map(roleId),
      staffProfile: {
        designation: person.designation,
        employeeId: `EMP-${String(index + 2).padStart(3, "0")}`,
        gender: /Sunita|Binita|Anita|Pratima|Mina/.test(person.fullName) ? "FEMALE" : "MALE",
        joinDate: bsToAd(`20${70 + (index % 10)}-0${(index % 9) + 1}-15`),
        qualification: index < 3 ? "M.Ed." : pick(["B.Ed.", "M.Sc.", "M.A.", "B.Sc."]),
      },
    });
    staff.push({ id: created.id, designation: person.designation });
  }
  const teacherFor = (keyword: string) => staff.find((s) => s.designation.includes(keyword))!.id;
  const classTeachers = staff.filter((_, i) => STAFF[i].roles.includes(SYSTEM_ROLE_KEYS.classTeacher)).map((s) => s.id);

  // Class teachers and subject teachers for the current year
  const allSections = classes.flatMap((c) => c.sections.map((s) => ({ ...s, classId: c.id, className: c.name })));
  for (const [index, section] of allSections.entries()) {
    await setClassTeacher(actor, { academicYearId: year.id, sectionId: section.id, teacherId: classTeachers[index % classTeachers.length] });
    const classSubjects = await prisma.classSubject.findMany({ where: { classId: section.classId }, include: { subject: true } });
    for (const cs of classSubjects) {
      const keyword = section.className.match(/Nursery|KG/) ? "Pre-primary" : SUBJECT_TEACHER[cs.subject.name];
      await addSubjectTeacher(actor, { academicYearId: year.id, sectionId: section.id, subjectId: cs.subjectId, teacherId: teacherFor(keyword) });
    }
  }

  // Bell schedule (Sunday–Friday) and a timetable for Grade 5 A
  const times = [["10:00", "10:45"], ["10:45", "11:30"], ["11:30", "12:15"], ["12:15", "13:00"], ["13:00", "13:30"], ["13:30", "14:15"], ["14:15", "15:00"], ["15:00", "15:45"]];
  const periods = [];
  for (const [index, [startTime, endTime]] of times.entries()) {
    const isBreak = index === 4;
    periods.push(await createPeriod(actor, { name: isBreak ? "Tiffin" : `Period ${index < 4 ? index + 1 : index}`, startTime, endTime, order: index + 1, isBreak }));
  }
  const grade5A = allSections.find((s) => s.className === "Grade 5" && s.name === "A")!;
  const g5Subjects = ["English", "Nepali", "Mathematics", "Science", "Social Studies", "Computer", "Health & Physical Education"];
  for (let day = 0; day <= 5; day++) {
    for (const [index, period] of periods.filter((p) => !p.isBreak).entries()) {
      const subject = g5Subjects[(index + day) % g5Subjects.length];
      await setTimetableSlot(actor, {
        academicYearId: year.id,
        sectionId: grade5A.id,
        dayOfWeek: day,
        periodId: period.id,
        subjectId: subjects.get(subject)!,
        teacherId: teacherFor(SUBJECT_TEACHER[subject]),
      });
    }
  }

  // Students — about 120, with some siblings sharing parents
  let phoneCounter = 9811000000;
  const families: { surname: string; father: { fullName: string; phone: string }; mother: { fullName: string; phone: string }; address: string }[] = [];
  let admitted = 0;

  for (const schoolClass of classes) {
    const age = 3 + CLASSES.indexOf(schoolClass.name);
    for (const section of schoolClass.sections) {
      const count = 6 + Math.floor(random() * 5);
      for (let i = 0; i < count; i++) {
        const gender: Gender = random() < 0.5 ? "MALE" : "FEMALE";
        // One in six students is a sibling of an earlier student
        const sibling = families.length > 5 && random() < 1 / 6 ? pick(families) : null;
        const family =
          sibling ??
          (() => {
            const surname = pick(SURNAMES);
            const f = {
              surname,
              father: { fullName: `${pick(FATHERS)} ${surname}`, phone: String(phoneCounter++) },
              mother: { fullName: `${pick(MOTHERS)} ${surname}`, phone: String(phoneCounter++) },
              address: `${pick(PLACES)}, Kathmandu`,
            };
            families.push(f);
            return f;
          })();

        const birthYear = 2083 - age - 1;
        await admitStudent(actor, {
          firstName: gender === "MALE" ? pick(BOYS) : pick(GIRLS),
          lastName: family.surname,
          gender,
          dateOfBirth: bsToAd(`${birthYear}-${String(1 + Math.floor(random() * 12)).padStart(2, "0")}-${String(1 + Math.floor(random() * 28)).padStart(2, "0")}`),
          bloodGroup: pick(["A+", "B+", "O+", "AB+", "A-", "O-", null]),
          religion: pick(["Hindu", "Buddhist", "Christian", "Kirat"]),
          nationality: "Nepali",
          address: family.address,
          admissionDate: bsToAd(`2083-01-${String(5 + Math.floor(random() * 20)).padStart(2, "0")}`),
          enrollment: { academicYearId: year.id, sectionId: section.id },
          guardians: [
            {
              guardian: { ...family.father, occupation: pick(OCCUPATIONS), address: family.address, whatsappOptIn: random() < 0.7 },
              relation: "FATHER" as GuardianRelation,
              isPrimary: true,
            },
            {
              guardian: { ...family.mother, occupation: pick(OCCUPATIONS), address: family.address, whatsappOptIn: random() < 0.5 },
              relation: "MOTHER" as GuardianRelation,
            },
          ],
        });
        admitted++;
      }
    }
  }

  // A teacher who is also a parent: Deepak's child studies here (shows multiple roles)
  const deepak = staff.find((s) => s.designation.startsWith("Mathematics"))!;
  const deepakUser = await prisma.user.findUniqueOrThrow({ where: { id: deepak.id } });
  const grade3 = classes.find((c) => c.name === "Grade 3")!;
  await admitStudent(actor, {
    firstName: "Aayush",
    lastName: "Shrestha",
    gender: "MALE",
    dateOfBirth: bsToAd("2074-05-10"),
    admissionDate: bsToAd("2083-01-10"),
    address: "Baneshwor, Kathmandu",
    enrollment: { academicYearId: year.id, sectionId: grade3.sections[0].id },
    guardians: [{ guardian: { fullName: deepakUser.fullName, phone: deepakUser.phone!, whatsappOptIn: true }, relation: "FATHER", isPrimary: true }],
  });

  return { students: admitted + 1, staff: staff.length, firstParentPhone: "9811000000" };
}
