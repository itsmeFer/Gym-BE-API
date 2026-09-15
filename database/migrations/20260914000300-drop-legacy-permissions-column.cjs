'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // Legacy JSONB column replaced by pivot table user_permissions
    await queryInterface.sequelize.query(
      `ALTER TABLE users DROP COLUMN IF EXISTS permissions;`
    );
    console.log('[Migration] Dropped legacy permissions column from users');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `ALTER TABLE users ADD COLUMN permissions JSONB DEFAULT '[]'::jsonb;`
    );
  },
};
