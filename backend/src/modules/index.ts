import type { RouteModule } from "../http/route.js";
import {
  academicYearsModule,
  assignmentsModule,
  classesModule,
  sectionsModule,
  subjectsModule,
  timetableModule,
} from "./academic/academic.routes.js";
import { attendanceModule } from "./attendance/attendance.routes.js";
import { auditModule } from "./audit/audit.routes.js";
import { examsModule } from "./exams/exam.routes.js";
import { promotionsModule } from "./promotions/promotion.routes.js";
import { notificationsModule } from "./notifications/notification.routes.js";
import { authModule } from "./auth/auth.routes.js";
import { dashboardModule } from "./dashboard/dashboard.routes.js";
import { filesModule } from "./files/file.routes.js";
import { metaModule } from "./meta/meta.routes.js";
import { schoolProfileModule, schoolsModule } from "./schools/school.routes.js";
import { rolesModule } from "./roles/role.routes.js";
import { settingsModule } from "./settings/settings.routes.js";
import { usersModule } from "./users/user.routes.js";
import { websiteModule } from "./website/website.routes.js";
import { guardiansModule, myModule, studentsModule } from "./students/student.routes.js";

/** Every API module. Add new modules here to mount them and include them in the API docs. */
export const modules: RouteModule[] = [
  authModule,
  schoolsModule,
  schoolProfileModule,
  settingsModule,
  dashboardModule,
  rolesModule,
  usersModule,
  academicYearsModule,
  classesModule,
  sectionsModule,
  subjectsModule,
  assignmentsModule,
  timetableModule,
  studentsModule,
  guardiansModule,
  myModule,
  attendanceModule,
  examsModule,
  promotionsModule,
  websiteModule,
  notificationsModule,
  auditModule,
  filesModule,
  metaModule,
];
