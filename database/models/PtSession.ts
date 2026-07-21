import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "@/database/connection";
import { User } from "./User";

export interface PtSessionAttributes {
  id: number;
  trainerId: number;
  customerId: number;
  sessionDate: Date;
  status: "scheduled" | "completed" | "cancelled";
  pointsEarned: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type PtSessionCreationAttributes = Optional<
  PtSessionAttributes,
  "id" | "status" | "pointsEarned" | "createdAt" | "updatedAt"
>;

export class PtSession
  extends Model<PtSessionAttributes, PtSessionCreationAttributes>
  implements PtSessionAttributes
{
  declare id: number;
  declare trainerId: number;
  declare customerId: number;
  declare sessionDate: Date;
  declare status: "scheduled" | "completed" | "cancelled";
  declare pointsEarned: number;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

PtSession.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    trainerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "trainer_id",
    },
    customerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "customer_id",
    },
    sessionDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "session_date",
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: "scheduled",
    },
    pointsEarned: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "points_earned",
    },
  },
  {
    sequelize,
    tableName: "pt_sessions",
    modelName: "PtSession",
    timestamps: true,
    underscored: true,
  }
);
