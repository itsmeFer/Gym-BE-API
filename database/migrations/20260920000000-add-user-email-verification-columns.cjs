"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      const table = "users";
      const columns = [
        { name: "email_verified_at", type: Sequelize.DATE },
        { name: "email_verification_code_hash", type: Sequelize.STRING(255) },
        { name: "email_verification_expires_at", type: Sequelize.DATE },
        { name: "email_verification_last_sent_at", type: Sequelize.DATE },
        { name: "pending_email", type: Sequelize.STRING(150) },
      ];

      for (const col of columns) {
        const [rows] = await queryInterface.sequelize.query(
          `SHOW COLUMNS FROM \`${table}\` LIKE '${col.name}'`
        );

        if (rows.length === 0) {
          await queryInterface.addColumn(table, col.name, {
            type: col.type,
            allowNull: true,
          });
        }
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  down: async (queryInterface) => {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      const columns = [
        "pending_email",
        "email_verification_last_sent_at",
        "email_verification_expires_at",
        "email_verification_code_hash",
        "email_verified_at",
      ];

      for (const col of columns) {
        await queryInterface.removeColumn("users", col);
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
