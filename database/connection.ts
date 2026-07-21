import { Sequelize } from "sequelize";
import pg from "pg";

const dbName = process.env.DB_NAME || "";
const dbUser = process.env.DB_USER || "";
const dbPassword = process.env.DB_PASSWORD || "";
const dbHost = "127.0.0.1";
const dbPort = Number(process.env.DB_PORT || 5432);

if (!dbName) {
  throw new Error("DB_NAME belum diisi di file .env atau .env.local");
}

if (!dbUser) {
  throw new Error("DB_USER belum diisi di file .env atau .env.local");
}

export const sequelize = new Sequelize(dbName, dbUser, dbPassword, {
  host: dbHost,
  port: dbPort,
  dialect: "postgres",
  dialectModule: pg,
  logging: false,
});