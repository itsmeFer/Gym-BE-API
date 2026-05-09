"use strict";

async function addColumnIfNotExists(queryInterface, tableName, columnName, definition) {
  const table = await queryInterface.describeTable(tableName);

  if (!table[columnName]) {
    await queryInterface.addColumn(tableName, columnName, definition);
  }
}

async function removeColumnIfExists(queryInterface, tableName, columnName) {
  const table = await queryInterface.describeTable(tableName);

  if (table[columnName]) {
    await queryInterface.removeColumn(tableName, columnName);
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfNotExists(queryInterface, "memberships", "sales_user_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await addColumnIfNotExists(queryInterface, "memberships", "plan_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await addColumnIfNotExists(queryInterface, "memberships", "package_name", {
      type: Sequelize.STRING(100),
      allowNull: false,
      defaultValue: "Membership",
    });

    await addColumnIfNotExists(queryInterface, "memberships", "package_price", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await addColumnIfNotExists(queryInterface, "memberships", "payment_method", {
      type: Sequelize.STRING(30),
      allowNull: false,
      defaultValue: "cashier",
    });

    await addColumnIfNotExists(queryInterface, "memberships", "payment_status", {
      type: Sequelize.STRING(30),
      allowNull: false,
      defaultValue: "unpaid",
    });

    await addColumnIfNotExists(queryInterface, "memberships", "paid_amount", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await addColumnIfNotExists(queryInterface, "memberships", "paid_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await addColumnIfNotExists(queryInterface, "memberships", "payment_proof_photo", {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await addColumnIfNotExists(queryInterface, "memberships", "member_status", {
      type: Sequelize.STRING(30),
      allowNull: false,
      defaultValue: "pending",
    });

    await addColumnIfNotExists(queryInterface, "memberships", "sales_status", {
      type: Sequelize.STRING(30),
      allowNull: false,
      defaultValue: "pending",
    });

    await addColumnIfNotExists(queryInterface, "memberships", "started_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await addColumnIfNotExists(queryInterface, "memberships", "expired_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await addColumnIfNotExists(queryInterface, "memberships", "user_schedule_set", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await addColumnIfNotExists(queryInterface, "memberships", "schedule_edit_count", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await addColumnIfNotExists(queryInterface, "memberships", "notes", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await removeColumnIfExists(queryInterface, "memberships", "notes");
    await removeColumnIfExists(queryInterface, "memberships", "schedule_edit_count");
    await removeColumnIfExists(queryInterface, "memberships", "user_schedule_set");
    await removeColumnIfExists(queryInterface, "memberships", "expired_at");
    await removeColumnIfExists(queryInterface, "memberships", "started_at");
    await removeColumnIfExists(queryInterface, "memberships", "sales_status");
    await removeColumnIfExists(queryInterface, "memberships", "member_status");
    await removeColumnIfExists(queryInterface, "memberships", "payment_proof_photo");
    await removeColumnIfExists(queryInterface, "memberships", "paid_at");
    await removeColumnIfExists(queryInterface, "memberships", "paid_amount");
    await removeColumnIfExists(queryInterface, "memberships", "payment_status");
    await removeColumnIfExists(queryInterface, "memberships", "payment_method");
    await removeColumnIfExists(queryInterface, "memberships", "package_price");
    await removeColumnIfExists(queryInterface, "memberships", "package_name");
    await removeColumnIfExists(queryInterface, "memberships", "plan_id");
    await removeColumnIfExists(queryInterface, "memberships", "sales_user_id");
  },
};