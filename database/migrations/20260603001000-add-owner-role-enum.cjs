'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add 'owner' to the enum_users_role type in PostgreSQL
    // PostgreSQL requires ALTER TYPE to add enum values
    await queryInterface.sequelize.query(
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_enum e
           JOIN pg_type t ON e.enumtypid = t.oid
           WHERE t.typname = 'enum_users_role' AND e.enumlabel = 'owner'
         ) THEN
           ALTER TYPE public.enum_users_role ADD VALUE 'owner';
         END IF;
       END;
      $$`
    );

    console.log('[Migration] Added "owner" to enum_users_role (if not exists)');
  },

  async down(queryInterface, Sequelize) {
    // PostgreSQL does NOT support removing an enum value easily.
    // You would need to recreate the type. Skipping for safety.
    console.log('[Migration] Rollback: Cannot remove enum values in PostgreSQL without recreating the type. Manual intervention needed.');
  },
};
