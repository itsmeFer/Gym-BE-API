import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "@/database/connection";

export interface AttendanceSettingAttributes {
  id: number;
  role: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  officeLatitude: number | null;
  officeLongitude: number | null;
  allowedRadiusMeters: number;
  lateToleranceMinutes: number;
  penaltyIntervalMinutes: number;
  penaltyPointsPerInterval: number;
  maxLatePenaltyPoints: number;
  absentPenaltyPoints: number;
  isActive: boolean;
  note: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type AttendanceSettingCreationAttributes = Optional<
  AttendanceSettingAttributes,
  | "id"
  | "checkInTime"
  | "checkOutTime"
  | "officeLatitude"
  | "officeLongitude"
  | "allowedRadiusMeters"
  | "lateToleranceMinutes"
  | "penaltyIntervalMinutes"
  | "penaltyPointsPerInterval"
  | "maxLatePenaltyPoints"
  | "absentPenaltyPoints"
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
  declare id: number;
  declare role: string;
  declare checkInTime: string | null;
  declare checkOutTime: string | null;
  declare officeLatitude: number | null;
  declare officeLongitude: number | null;
  declare allowedRadiusMeters: number;
  declare lateToleranceMinutes: number;
  declare penaltyIntervalMinutes: number;
  declare penaltyPointsPerInterval: number;
  declare maxLatePenaltyPoints: number;
  declare absentPenaltyPoints: number;
  declare isActive: boolean;
  declare note: string | null;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
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

    checkOutTime: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "check_out_time",
    },

    officeLatitude: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: "office_latitude",
    },

    officeLongitude: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: "office_longitude",
    },

    allowedRadiusMeters: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100,
      field: "allowed_radius_meters",
    },

    lateToleranceMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "late_tolerance_minutes",
    },

    penaltyIntervalMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 60,
      field: "penalty_interval_minutes",
    },

    penaltyPointsPerInterval: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      field: "penalty_points_per_interval",
    },

    maxLatePenaltyPoints: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 8,
      field: "max_late_penalty_points",
    },

    absentPenaltyPoints: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 8,
      field: "absent_penalty_points",
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