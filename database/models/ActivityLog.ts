import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "@/database/connection";

export interface ActivityLogAttributes {
  id: number;
  actorId?: number | null;
  action: string;
  targetType: string;
  targetId?: number | null;
  description: string;
  ipAddress?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ActivityLogCreationAttributes = Optional<
  ActivityLogAttributes,
  "id" | "actorId" | "targetId" | "ipAddress" | "createdAt" | "updatedAt"
>;

export class ActivityLog
  extends Model<ActivityLogAttributes, ActivityLogCreationAttributes>
  implements ActivityLogAttributes
{
  declare id: number;
  declare actorId: number | null;
  declare action: string;
  declare targetType: string;
  declare targetId: number | null;
  declare description: string;
  declare ipAddress: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

ActivityLog.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    actorId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "actor_id",
      references: { model: "users", key: "id" },
    },
    action: {
      type: DataTypes.STRING(60),
      allowNull: false,
      field: "action",
    },
    targetType: {
      type: DataTypes.STRING(40),
      allowNull: false,
      field: "target_type",
    },
    targetId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "target_id",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: "description",
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "ip_address",
    },
  },
  {
    sequelize,
    tableName: "activity_logs",
    modelName: "ActivityLog",
    timestamps: true,
    underscored: true,
  }
);

export default ActivityLog;
