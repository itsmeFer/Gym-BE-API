import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "@/database/connection";

export interface UserPermissionAttributes {
  id: number;
  userId: number;
  featureKey: string;
  methods: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type UserPermissionCreationAttributes = Optional<
  UserPermissionAttributes,
  "id" | "createdAt" | "updatedAt"
>;

export class UserPermission
  extends Model<UserPermissionAttributes, UserPermissionCreationAttributes>
  implements UserPermissionAttributes
{
  declare id: number;
  declare userId: number;
  declare featureKey: string;
  declare methods: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

UserPermission.init(
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
      references: { model: "users", key: "id" },
    },
    featureKey: {
      type: DataTypes.STRING(80),
      allowNull: false,
      field: "feature_key",
    },
    methods: {
      type: DataTypes.STRING(4),
      allowNull: false,
      defaultValue: "CRUD",
      field: "methods",
    },
  },
  {
    sequelize,
    tableName: "user_permissions",
    modelName: "UserPermission",
    timestamps: true,
    underscored: true,
  }
);

export default UserPermission;
