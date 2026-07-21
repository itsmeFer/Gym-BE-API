const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');
const fs = require('fs');

if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'prima_gym_db',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  logging: false,
});

async function addPhotoUrlColumn() {
  try {
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');

    // Check if column exists
    const [results] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='users' and column_name='photo_url';
    `);

    if (results.length === 0) {
      await sequelize.query('ALTER TABLE users ADD COLUMN photo_url VARCHAR(255);');
      console.log('Added photo_url column to users table.');
    } else {
      console.log('photo_url column already exists.');
    }

  } catch (error) {
    console.error('Unable to connect to the database or modify schema:', error);
  } finally {
    await sequelize.close();
  }
}

addPhotoUrlColumn();
