import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "@/database/connection";

export interface MembershipAttributes {
  id: number;

  userId: number;
  salesUserId: number | null;
  planId: number | null;

  packageName: string;
  packagePrice: number;

  paymentMethod: string;
  paymentStatus: string;
  paidAmount: number;
  paidAt: Date | null;
  paymentProofPhoto: string | null;

  memberStatus: string;
  salesStatus: string;

  startedAt: Date | null;
  expiredAt: Date | null;

  userScheduleSet: boolean;
  scheduleEditCount: number;

  notes: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export type MembershipCreationAttributes = Optional<
  MembershipAttributes,
  | "id"
  | "salesUserId"
  | "planId"
  | "packagePrice"
  | "paymentMethod"
  | "paymentStatus"
  | "paidAmount"
  | "paidAt"
  | "paymentProofPhoto"
  | "memberStatus"
  | "salesStatus"
  | "startedAt"
  | "expiredAt"
  | "userScheduleSet"
  | "scheduleEditCount"
  | "notes"
  | "createdAt"
  | "updatedAt"
>;

class Membership
  extends Model<MembershipAttributes, MembershipCreationAttributes>
  implements MembershipAttributes
{
  declare id: number;

  declare userId: number;
  declare salesUserId: number | null;
  declare planId: number | null;

  declare packageName: string;
  declare packagePrice: number;

  declare paymentMethod: string;
  declare paymentStatus: string;
  declare paidAmount: number;
  declare paidAt: Date | null;
  declare paymentProofPhoto: string | null;

  declare memberStatus: string;
  declare salesStatus: string;

  declare startedAt: Date | null;
  declare expiredAt: Date | null;

  declare userScheduleSet: boolean;
  declare scheduleEditCount: number;

  declare notes: string | null;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Membership.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "user_id",
    },

    salesUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "sales_user_id",
    },

    planId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "plan_id",
    },

    packageName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "package_name",
    },

    packagePrice: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "package_price",
    },

    paymentMethod: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: "cashier",
      field: "payment_method",
    },

    paymentStatus: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: "unpaid",
      field: "payment_status",
    },

    paidAmount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "paid_amount",
    },

    paidAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "paid_at",
    },

    paymentProofPhoto: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "payment_proof_photo",
    },

    memberStatus: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: "pending",
      field: "member_status",
    },

    salesStatus: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: "pending",
      field: "sales_status",
    },

    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "started_at",
    },

    expiredAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "expired_at",
    },

    userScheduleSet: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "user_schedule_set",
    },

    scheduleEditCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "schedule_edit_count",
    },

    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "memberships",
    modelName: "Membership",
    timestamps: true,
    underscored: true,
  },
);

export default Membership;