'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Create pivot table user_permissions
    await queryInterface.createTable('user_permissions', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      feature_key: {
        type: Sequelize.STRING(80),
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    // Unique constraint: one entry per user + feature
    await queryInterface.addIndex('user_permissions', {
      fields: ['user_id', 'feature_key'],
      unique: true,
      name: 'uq_user_feature',
    });

    // Index for fast lookup by user_id
    await queryInterface.addIndex('user_permissions', {
      fields: ['user_id'],
      name: 'idx_user_permissions_user_id',
    });

    console.log('[Migration] Created user_permissions pivot table');
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_permissions');
    console.log('[Migration] Dropped user_permissions table');
  },
};
