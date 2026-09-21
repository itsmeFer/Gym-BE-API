import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "@/database/connection";

export interface UserSystemChangeReadAttributes {
  id: number;
  userId: number;
  systemChangeId: number;
  readAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type UserSystemChangeReadCreationAttributes = Optional<
  UserSystemChangeReadAttributes,
  "id" | "readAt" | "createdAt" | "updatedAt"
>;

export class UserSystemChangeRead
  extends Model<UserSystemChangeReadAttributes, UserSystemChangeReadCreationAttributes>
  implements UserSystemChangeReadAttributes
{
  declare id: number;
  declare userId: number;
  declare systemChangeId: number;
  declare readAt: Date;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

UserSystemChangeRead.init(
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
      references: {
        model: "users",
        key: "id",
      },
      onDelete: "CASCADE",
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
    readAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "read_at",
    },
  },
  {
    sequelize,
    tableName: "user_system_change_reads",
    modelName: "UserSystemChangeRead",
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ["user_id", "system_change_id"],
      },
    ],
  }
);

export default UserSystemChangeRead;
