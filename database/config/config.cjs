"use strict";

const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function env(...keys) {
  for (const key of keys) {
    const value = process.env[key];

    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return undefined;
}

const config = {
  username: env("DB_USER", "POSTGRES_USER", "DATABASE_USER") || "postgres",
  password: env("DB_PASSWORD", "DB_PASS", "POSTGRES_PASSWORD", "DATABASE_PASSWORD") || null,
  database: env("DB_NAME", "POSTGRES_DB", "DATABASE_NAME") || "prima_gym_db",
  host: env("DB_HOST", "POSTGRES_HOST", "DATABASE_HOST") || "127.0.0.1",
  port: Number(env("DB_PORT", "POSTGRES_PORT", "DATABASE_PORT") || 5432),
  dialect: "postgres",
  logging: false,
};

module.exports = {
  development: config,
  test: config,
  production: config,
};