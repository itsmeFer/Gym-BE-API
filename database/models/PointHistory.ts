import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "@/database/connection";
import { User } from "./User";

export interface PointHistoryAttributes {
  id: number;
  userId: number;
  amount: number;
  transactionType: string;
  description: string | null;
  relatedUserId: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type PointHistoryCreationAttributes = Optional<
  PointHistoryAttributes,
  "id" | "description" | "relatedUserId" | "createdAt" | "updatedAt"
>;

export class PointHistory
  extends Model<PointHistoryAttributes, PointHistoryCreationAttributes>
  implements PointHistoryAttributes
{
  declare id: number;
  declare userId: number;
  declare amount: number;
  declare transactionType: string;
  declare description: string | null;
  declare relatedUserId: number | null;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

PointHistory.init(
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
    amount: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    transactionType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: "transaction_type",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    relatedUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "related_user_id",
    },
  },
  {
    sequelize,
    tableName: "point_histories",
    modelName: "PointHistory",
    timestamps: true,
    underscored: true,
  }
);
