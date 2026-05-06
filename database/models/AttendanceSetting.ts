import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "@/database/connection";

export interface AttendanceSettingAttributes {
  id: number;
  role: string;
  checkInTime: string | null;
  lateToleranceMinutes: number;
  isActive: boolean;
  note: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type AttendanceSettingCreationAttributes = Optional<
  AttendanceSettingAttributes,
  | "id"
  | "checkInTime"
  | "lateToleranceMinutes"
  | "isActive"
  | "note"
  | "createdAt"
  | "updatedAt"
>;

class AttendanceSetting
  extends Model<
    AttendanceSettingAttributes,
    AttendanceSettingCreationAttributes
  >
  implements AttendanceSettingAttributes
{
  public id!: number;
  public role!: string;
  public checkInTime!: string | null;
  public lateToleranceMinutes!: number;
  public isActive!: boolean;
  public note!: string | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

AttendanceSetting.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    role: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },

    checkInTime: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "check_in_time",
    },

    lateToleranceMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "late_tolerance_minutes",
    },

    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "is_active",
    },

    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "attendance_settings",
    modelName: "AttendanceSetting",
    timestamps: true,
    underscored: true,
  }
);

export default AttendanceSetting;