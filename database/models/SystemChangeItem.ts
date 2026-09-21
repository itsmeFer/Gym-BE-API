import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "@/database/connection";

export interface SystemChangeItemAttributes {
  id: number;
  systemChangeId: number;
  pointTitle: string;
  description: string;
  category: string;
  orderIndex: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type SystemChangeItemCreationAttributes = Optional<
  SystemChangeItemAttributes,
  "id" | "category" | "orderIndex" | "createdAt" | "updatedAt"
>;

export class SystemChangeItem
  extends Model<SystemChangeItemAttributes, SystemChangeItemCreationAttributes>
  implements SystemChangeItemAttributes
{
  declare id: number;
  declare systemChangeId: number;
  declare pointTitle: string;
  declare description: string;
  declare category: string;
  declare orderIndex: number;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

SystemChangeItem.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    systemChangeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "system_change_id",
      references: {
        model: "system_changes",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    pointTitle: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: "point_title",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: "Fitur Baru",
      field: "category",
    },
    orderIndex: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      field: "order_index",
    },
  },
  {
    sequelize,
    tableName: "system_change_items",
    modelName: "SystemChangeItem",
    timestamps: true,
    underscored: true,
  }
);

export default SystemChangeItem;
