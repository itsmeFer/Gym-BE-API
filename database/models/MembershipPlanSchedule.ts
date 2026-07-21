import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "@/database/connection";

export interface MembershipPlanScheduleAttributes {
  id: number;
  planId: number;
  trainerId: number | null;
  title: string;
  category: string;
  startTime: string;
  endTime: string;
  sessionLabel: string;
  room: string;
  quota: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type MembershipPlanScheduleCreationAttributes = Optional<
  MembershipPlanScheduleAttributes,
  | "id"
  | "trainerId"
  | "category"
  | "startTime"
  | "endTime"
  | "sessionLabel"
  | "room"
  | "quota"
  | "isActive"
  | "createdAt"
  | "updatedAt"
>;

export class MembershipPlanSchedule
  extends Model<
    MembershipPlanScheduleAttributes,
    MembershipPlanScheduleCreationAttributes
  >
  implements MembershipPlanScheduleAttributes
{
  public id!: number;
  public planId!: number;
  public trainerId!: number | null;
  public title!: string;
  public category!: string;
  public startTime!: string;
  public endTime!: string;
  public sessionLabel!: string;
  public room!: string;
  public quota!: number;
  public isActive!: boolean;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

MembershipPlanSchedule.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    planId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "plan_id",
      references: {
        model: "membership_plans",
        key: "id",
      },
    },
    trainerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "trainer_id",
      references: {
        model: "users",
        key: "id",
      },
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "Gym Class",
    },
    startTime: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "08:00",
      field: "start_time",
    },
    endTime: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "11:00",
      field: "end_time",
    },
    sessionLabel: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "Pagi",
      field: "session_label",
    },
    room: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "Main Gym Floor",
    },
    quota: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "is_active",
    },
  },
  {
    sequelize,
    tableName: "membership_plan_schedules",
    modelName: "MembershipPlanSchedule",
    timestamps: true,
    underscored: true,
  }
);

export default MembershipPlanSchedule;
