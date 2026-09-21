import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "@/database/connection";

export interface SystemChangeAttributes {
  id: number;
  authorUserId: number | null;
  authorName: string;
  version: string;
  title: string;
  category: string;
  releasedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type SystemChangeCreationAttributes = Optional<
  SystemChangeAttributes,
  "id" | "authorUserId" | "category" | "releasedAt" | "createdAt" | "updatedAt"
>;

export class SystemChange
  extends Model<SystemChangeAttributes, SystemChangeCreationAttributes>
  implements SystemChangeAttributes
{
  declare id: number;
  declare authorUserId: number | null;
  declare authorName: string;
  declare version: string;
  declare title: string;
  declare category: string;
  declare releasedAt: Date;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

SystemChange.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    authorUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "author_user_id",
    },
    authorName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: "IT Team",
      field: "author_name",
    },
    version: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: "v1.0.0",
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "General",
    },
    releasedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "released_at",
    },
  },
  {
    sequelize,
    tableName: "system_changes",
    modelName: "SystemChange",
    timestamps: true,
    underscored: true,
  }
);

export default SystemChange;
