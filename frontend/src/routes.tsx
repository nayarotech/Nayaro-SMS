import { createBrowserRouter, Navigate } from "react-router";
import { AppShell } from "./components/layout/AppShell";
import type { ReactNode } from "react";
import { RequireAuth, RequirePermission, WebsiteHome } from "./components/layout/guards";
import { LoginPage } from "./features/auth/LoginPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { SchoolsPage } from "./features/schools/SchoolsPage";
import { AccountPage } from "./features/auth/AccountPage";
import { AdmissionPage } from "./features/students/AdmissionPage";
import { GuardiansPage } from "./features/students/GuardiansPage";
import { StudentDetailPage } from "./features/students/StudentDetailPage";
import { StudentsPage } from "./features/students/StudentsPage";
import { AcademicYearsPage } from "./features/academic/AcademicYearsPage";
import { AssignmentsPage } from "./features/academic/AssignmentsPage";
import { ClassesPage } from "./features/academic/ClassesPage";
import { SubjectsPage } from "./features/academic/SubjectsPage";
import { SubjectChoicesPage } from "./features/academic/SubjectChoicesPage";
import { TimetablePage } from "./features/academic/TimetablePage";
import { AuditLogPage } from "./features/audit/AuditLogPage";
import { RolesPage } from "./features/roles/RolesPage";
import { SchoolProfilePage } from "./features/settings/SchoolProfilePage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { StaffDetailPage } from "./features/users/StaffDetailPage";
import { StaffListPage } from "./features/users/StaffListPage";
import { AttendanceReportsPage } from "./features/attendance/AttendanceReportsPage";
import { ProxiesPage } from "./features/attendance/ProxiesPage";
import { SectionAttendancePage } from "./features/attendance/SectionAttendancePage";
import { TakeAttendancePage } from "./features/attendance/TakeAttendancePage";
import { ExamsPage } from "./features/exams/ExamsPage";
import { MarkSheetPage } from "./features/exams/MarkSheetPage";
import { MarksHomePage } from "./features/exams/MarksHomePage";
import { ResultsPage } from "./features/exams/ResultsPage";
import { PromotionPage } from "./features/promotions/PromotionPage";
import { PageEditor } from "./features/website/editor/PageEditor";
import { WebsiteLayout } from "./features/website/WebsiteLayout";
import { EnquiriesPage } from "./features/website/EnquiriesPage";
import { GalleryPage } from "./features/website/GalleryPage";
import { HeaderFooterPage } from "./features/website/HeaderFooterPage";
import { PostsPage } from "./features/website/PostsPage";
import { ThemePage } from "./features/website/ThemePage";
import { WebsiteSettingsPage } from "./features/website/WebsiteSettingsPage";

/** Shorthand: only users with the permission can open the page (the API enforces it too). */
const guard = (permission: string | string[], element: ReactNode) => (
  <RequirePermission permission={permission}>{element}</RequirePermission>
);

const MARKS_ANY = ["marks.enter", "exam.manage", "marks.verify", "marks.publish"];
const RESULTS_ANY = ["exam.manage", "marks.verify", "marks.publish", "reportcard.generate", "attendance.mark"];
const ATTENDANCE_ANY = ["attendance.mark", "attendance.view", "attendance.report", "attendance.proxy.assign"];

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      // The page editor uses the whole screen (no sidebar)
      { path: "website/pages/:pageId/edit", element: guard("website.edit", <PageEditor />) },
      {
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "platform/schools", element: <SchoolsPage /> },

          { path: "students", element: guard("student.view", <StudentsPage />) },
          { path: "students/new", element: guard("student.create", <AdmissionPage />) },
          { path: "students/:id", element: guard("student.view", <StudentDetailPage />) },
          { path: "guardians", element: guard("guardian.view", <GuardiansPage />) },
          { path: "staff", element: guard("user.view", <StaffListPage />) },
          { path: "staff/:id", element: guard("user.view", <StaffDetailPage />) },

          { path: "attendance", element: guard(ATTENDANCE_ANY, <TakeAttendancePage />) },
          { path: "attendance/sections/:sectionId", element: guard(ATTENDANCE_ANY, <SectionAttendancePage />) },
          { path: "attendance/reports", element: guard(ATTENDANCE_ANY, <AttendanceReportsPage />) },
          { path: "attendance/proxies", element: guard("attendance.proxy.assign", <ProxiesPage />) },

          { path: "exams", element: guard("exam.manage", <ExamsPage />) },
          { path: "exams/marks", element: guard(MARKS_ANY, <MarksHomePage />) },
          { path: "exams/:examId/marks/:sectionId/:subjectId", element: guard(MARKS_ANY, <MarkSheetPage />) },
          { path: "exams/results", element: guard(RESULTS_ANY, <ResultsPage />) },
          { path: "promotions", element: guard("promotion.manage", <PromotionPage />) },

          { path: "academic/years", element: guard("academic.view", <AcademicYearsPage />) },
          { path: "academic/classes", element: guard("academic.view", <ClassesPage />) },
          { path: "academic/subjects", element: guard("academic.view", <SubjectsPage />) },
          { path: "academic/optional-subjects", element: guard(["student.view", "academic.view"], <SubjectChoicesPage />) },
          { path: "academic/assignments", element: guard("academic.view", <AssignmentsPage />) },
          { path: "academic/timetable", element: guard("academic.view", <TimetablePage />) },

          {
            path: "website",
            element: guard(["website.edit", "website.posts", "website.enquiries"], <WebsiteLayout />),
            children: [
              { index: true, element: <WebsiteHome /> },
              { path: "theme", element: guard("website.edit", <ThemePage />) },
              { path: "layout", element: guard("website.edit", <HeaderFooterPage />) },
              { path: "posts", element: guard("website.posts", <PostsPage />) },
              { path: "gallery", element: guard(["website.edit", "website.posts"], <GalleryPage />) },
              { path: "enquiries", element: guard("website.enquiries", <EnquiriesPage />) },
              { path: "settings", element: guard("website.edit", <WebsiteSettingsPage />) },
            ],
          },

          { path: "roles", element: guard("role.view", <RolesPage />) },
          { path: "settings", element: guard("school.settings.view", <SettingsPage />) },
          { path: "settings/school", element: guard("school.settings.view", <SchoolProfilePage />) },
          { path: "audit", element: guard("audit.view", <AuditLogPage />) },
          { path: "account", element: <AccountPage /> },
          { path: "*", element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);
