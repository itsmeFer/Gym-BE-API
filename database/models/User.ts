import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "@/database/connection";

export type UserRole =
  | "admin"
  | "direktur"
  | "manager"
  | "karyawan"
  | "trainer"
  | "sales"
  | "kasir"
  | "customer";

export interface UserAttributes {
  id: number;
  name: string;
  phone: string;
  email: string;
  password: string;
  role: UserRole;
  points: number;
  maxPoints: number;
  referralCode: string;
  referredByCode: string | null;
  referredByUserId: number | null;
  isActive: boolean;

  emailVerifiedAt: Date | null;
  emailVerificationCodeHash: string | null;
  emailVerificationExpiresAt: Date | null;
  emailVerificationLastSentAt: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export type UserCreationAttributes = Optional<
  UserAttributes,
  | "id"
  | "role"
  | "points"
  | "maxPoints"
  | "referralCode"
  | "referredByCode"
  | "referredByUserId"
  | "isActive"
  | "emailVerifiedAt"
  | "emailVerificationCodeHash"
  | "emailVerificationExpiresAt"
  | "emailVerificationLastSentAt"
  | "createdAt"
  | "updatedAt"
>;

export class User
  extends Model<UserAttributes, UserCreationAttributes>
  implements UserAttributes
{
  declare id: number;
  declare name: string;
  declare phone: string;
  declare email: string;
  declare password: string;
  declare role: UserRole;
  declare points: number;
  declare maxPoints: number;
  declare referralCode: string;
  declare referredByCode: string | null;
  declare referredByUserId: number | null;
  declare isActive: boolean;

  declare emailVerifiedAt: Date | null;
  declare emailVerificationCodeHash: string | null;
  declare emailVerificationExpiresAt: Date | null;
  declare emailVerificationLastSentAt: Date | null;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },

    phone: {
      type: DataTypes.STRING(30),
      allowNull: false,
      unique: true,
    },

    email: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },

    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    role: {
      type: DataTypes.ENUM(
        "admin",
        "direktur",
        "manager",
        "karyawan",
        "trainer",
        "sales",
        "kasir",
        "customer"
      ),
      allowNull: false,
      defaultValue: "customer",
    },

    points: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100,
    },

    maxPoints: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100,
      field: "max_points",
    },

    referralCode: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      field: "referral_code",
    },

    referredByCode: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "referred_by_code",
    },

    referredByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "referred_by_user_id",
    },

    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "is_active",
    },

    emailVerifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "email_verified_at",
    },

    emailVerificationCodeHash: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "email_verification_code_hash",
    },

    emailVerificationExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "email_verification_expires_at",
    },

    emailVerificationLastSentAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "email_verification_last_sent_at",
    },
  },
  {
    sequelize,
    tableName: "users",
    modelName: "User",
    timestamps: true,
    underscored: true,
  }
);

export default User;