import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "@/database/connection";

export const MEMBERSHIP_CUSTOMER_CATEGORIES = [
  "prima_grup",
  "non_prima_grup",
] as const;

export type MembershipCustomerCategory =
  (typeof MEMBERSHIP_CUSTOMER_CATEGORIES)[number];

export interface MembershipPlanAttributes {
  id: number;
  programName: string;
  customerCategory: MembershipCustomerCategory;
  packageCode: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  durationDays: number;
  discountPercent: number;
  personalTrainerSessions: number;
  pilatesSessions: number;
  freeMembershipDays: number;
  benefits: string[];
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type MembershipPlanCreationAttributes = Optional<
  MembershipPlanAttributes,
  | "id"
  | "description"
  | "imageUrl"
  | "price"
  | "durationDays"
  | "discountPercent"
  | "personalTrainerSessions"
  | "pilatesSessions"
  | "freeMembershipDays"
  | "benefits"
  | "isActive"
  | "createdAt"
  | "updatedAt"
>;

class MembershipPlan
  extends Model<MembershipPlanAttributes, MembershipPlanCreationAttributes>
  implements MembershipPlanAttributes
{
  public id!: number;
  public programName!: string;
  public customerCategory!: MembershipCustomerCategory;
  public packageCode!: string;
  public name!: string;
  public description!: string | null;
  public imageUrl!: string | null;
  public price!: number;
  public durationDays!: number;
  public discountPercent!: number;
  public personalTrainerSessions!: number;
  public pilatesSessions!: number;
  public freeMembershipDays!: number;
  public benefits!: string[];
  public isActive!: boolean;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

MembershipPlan.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    programName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "program_name",
    },

    customerCategory: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "customer_category",
      validate: {
        isIn: {
          args: [[...MEMBERSHIP_CUSTOMER_CATEGORIES]],
          msg: "Customer category hanya boleh prima_grup atau non_prima_grup",
        },
      },
    },

    packageCode: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "package_code",
    },

    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    imageUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "image_url",
    },

    price: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    durationDays: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 30,
      field: "duration_days",
    },

    discountPercent: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "discount_percent",
    },

    personalTrainerSessions: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "personal_trainer_sessions",
    },

    pilatesSessions: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "pilates_sessions",
    },

    freeMembershipDays: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "free_membership_days",
    },

    benefits: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },

    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "is_active",
    },
  },
  {
    sequelize,
    tableName: "membership_plans",
    modelName: "MembershipPlan",
    timestamps: true,
    underscored: true,
  }
);

export default MembershipPlan;