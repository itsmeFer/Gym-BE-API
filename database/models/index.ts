import { User } from "./User";
import Membership from "./Membership";
import MembershipPlan from "./MembershipPlan";
import Attendance from "./Attendance";
import AttendanceSetting from "./AttendanceSetting";

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

export {
  User,
  Membership,
  MembershipPlan,
  Attendance,
  AttendanceSetting,
};