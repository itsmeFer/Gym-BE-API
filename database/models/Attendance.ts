import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "@/database/connection";

export interface AttendanceAttributes {
  id: number;
  userId: number | null;
  fullName: string;
  role: string;
  attendanceDate: string;
  checkIn: string | null;
  checkOut: string | null;
  status: string;
  lateMinutes: number | null;
  pointPenalty: number;
  location: string | null;
  deviceMac: string | null;
  checkInPhoto: string | null;
  checkOutPhoto: string | null;
  note: string | null;
  isManual: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type AttendanceCreationAttributes = Optional<
  AttendanceAttributes,
  | "id"
  | "userId"
  | "checkIn"
  | "checkOut"
  | "status"
  | "lateMinutes"
  | "pointPenalty"
  | "location"
  | "deviceMac"
  | "checkInPhoto"
  | "checkOutPhoto"
  | "note"
  | "isManual"
  | "createdAt"
  | "updatedAt"
>;

class Attendance
  extends Model<AttendanceAttributes, AttendanceCreationAttributes>
  implements AttendanceAttributes
{
  declare id: number;
  declare userId: number | null;
  declare fullName: string;
  declare role: string;
  declare attendanceDate: string;
  declare checkIn: string | null;
  declare checkOut: string | null;
  declare status: string;
  declare lateMinutes: number | null;
  declare pointPenalty: number;
  declare location: string | null;
  declare deviceMac: string | null;
  declare checkInPhoto: string | null;
  declare checkOutPhoto: string | null;
  declare note: string | null;
  declare isManual: boolean;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Attendance.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "user_id",
    },

    fullName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "full_name",
    },

    role: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    attendanceDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: "attendance_date",
    },

    checkIn: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "check_in",
    },

    checkOut: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "check_out",
    },

    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "hadir",
    },

    lateMinutes: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "late_minutes",
    },

    pointPenalty: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "point_penalty",
    },

    location: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    deviceMac: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "device_mac",
    },

    checkInPhoto: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "check_in_photo",
    },

    checkOutPhoto: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "check_out_photo",
    },

    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    isManual: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "is_manual",
    },
  },
  {
    sequelize,
    tableName: "attendances",
    modelName: "Attendance",
    timestamps: true,
    underscored: true,
  }
);

export default Attendance;