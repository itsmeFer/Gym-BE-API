'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('user_permissions', 'methods', {
      type: Sequelize.STRING(4),
      allowNull: false,
      defaultValue: 'CRUD',
    });
    console.log('[Migration] Added methods column to user_permissions');
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('user_permissions', 'methods');
  },
};
