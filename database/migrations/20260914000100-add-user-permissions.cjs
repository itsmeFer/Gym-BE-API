'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'users' AND column_name = 'permissions'
         ) THEN
           ALTER TABLE users ADD COLUMN permissions JSONB DEFAULT '[]'::jsonb;
         END IF;
       END;
      $$`
    );
    console.log('[Migration] Added permissions column to users table');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `ALTER TABLE users DROP COLUMN IF EXISTS permissions;`
    );
  },
};
