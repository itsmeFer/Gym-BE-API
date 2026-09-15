'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add 'it' to the enum_users_role type in PostgreSQL
    // PostgreSQL requires ALTER TYPE to add enum values
    await queryInterface.sequelize.query(
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_enum e
           JOIN pg_type t ON e.enumtypid = t.oid
           WHERE t.typname = 'enum_users_role' AND e.enumlabel = 'it'
         ) THEN
           ALTER TYPE public.enum_users_role ADD VALUE 'it';
         END IF;
       END;
      $$`
    );

    console.log('[Migration] Added "it" to enum_users_role (if not exists)');
  },

  async down(queryInterface, Sequelize) {
    // PostgreSQL does NOT support removing an enum value easily.
    console.log(
      '[Migration] Rollback: Cannot remove enum values in PostgreSQL without recreating the type. Manual intervention needed.'
    );
  },
};
