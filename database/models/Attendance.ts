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
  location: string | null;
  deviceMac: string | null;
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
  | "location"
  | "deviceMac"
  | "note"
  | "isManual"
  | "createdAt"
  | "updatedAt"
>;

class Attendance
  extends Model<AttendanceAttributes, AttendanceCreationAttributes>
  implements AttendanceAttributes
{
  public id!: number;
  public userId!: number | null;
  public fullName!: string;
  public role!: string;
  public attendanceDate!: string;
  public checkIn!: string | null;
  public checkOut!: string | null;
  public status!: string;
  public location!: string | null;
  public deviceMac!: string | null;
  public note!: string | null;
  public isManual!: boolean;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
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

    location: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    deviceMac: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "device_mac",
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