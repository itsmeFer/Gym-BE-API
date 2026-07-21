import { User } from "./User";
import Membership from "./Membership";
import MembershipPlan from "./MembershipPlan";
import Attendance from "./Attendance";
import AttendanceSetting from "./AttendanceSetting";

import { PtSession } from "./PtSession";
import { PointHistory } from "./PointHistory";
import MembershipPlanSchedule from "./MembershipPlanSchedule";

User.hasMany(Membership, {
  foreignKey: "userId",
  as: "memberships",
});

Membership.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

User.hasMany(Membership, {
  foreignKey: "salesUserId",
  as: "salesMemberships",
});

Membership.belongsTo(User, {
  foreignKey: "salesUserId",
  as: "sales",
});

User.hasMany(Membership, {
  foreignKey: "processedByUserId",
  as: "processedMemberships",
});

Membership.belongsTo(User, {
  foreignKey: "processedByUserId",
  as: "processedBy",
});

MembershipPlan.hasMany(Membership, {
  foreignKey: "planId",
  as: "memberships",
});

Membership.belongsTo(MembershipPlan, {
  foreignKey: "planId",
  as: "plan",
});

MembershipPlan.hasMany(MembershipPlanSchedule, {
  foreignKey: "planId",
  as: "schedules",
});

MembershipPlanSchedule.belongsTo(MembershipPlan, {
  foreignKey: "planId",
  as: "plan",
});

User.hasMany(MembershipPlanSchedule, {
  foreignKey: "trainerId",
  as: "assignedSchedules",
});

MembershipPlanSchedule.belongsTo(User, {
  foreignKey: "trainerId",
  as: "trainer",
});

User.hasMany(PtSession, {
  foreignKey: "trainerId",
  as: "taughtSessions",
});
PtSession.belongsTo(User, {
  foreignKey: "trainerId",
  as: "trainer",
});

User.hasMany(PtSession, {
  foreignKey: "customerId",
  as: "ptSessions",
});
PtSession.belongsTo(User, {
  foreignKey: "customerId",
  as: "customer",
});

User.hasMany(PointHistory, {
  foreignKey: "userId",
  as: "pointHistories",
});
PointHistory.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

PointHistory.belongsTo(User, {
  foreignKey: "relatedUserId",
  as: "relatedUser",
});

export {
  User,
  Membership,
  MembershipPlan,
  MembershipPlanSchedule,
  Attendance,
  AttendanceSetting,
  PtSession,
  PointHistory,
};