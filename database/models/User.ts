import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "@/database/connection";

export type UserRole =
    | "admin"
    | "direktur"
    | "manager"
    | "trainer"
    | "sales"
    | "customer";

interface UserAttributes {
    id: number;
    name: string;
    phone: string;
    email: string;
    password: string;
    role: UserRole;
    referralCode: string;
    referredByCode: string | null;
    referredByUserId: number | null;
    isActive: boolean;
}

type UserCreationAttributes = Optional<
    UserAttributes,
    "id" | "role" | "referralCode" | "referredByCode" | "referredByUserId" | "isActive"
>;

export class User
    extends Model<UserAttributes, UserCreationAttributes>
    implements UserAttributes {
    public id!: number;
    public name!: string;
    public phone!: string;
    public email!: string;
    public password!: string;
    public role!: UserRole;
    public referralCode!: string;
    public referredByCode!: string | null;
    public referredByUserId!: number | null;
    public isActive!: boolean;
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
            type: DataTypes.ENUM("admin", "direktur", "manager", "trainer", "sales", "customer"),
            allowNull: false,
            defaultValue: "customer",
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
    },
    {
        sequelize,
        tableName: "users",
        timestamps: true,
        underscored: true,
    }
);