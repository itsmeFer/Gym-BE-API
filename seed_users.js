const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const dbUrl = 'postgresql://postgres@localhost:5432/prima_gym_db';

const usersToSeed = [
  {
    name: 'Owner Prima Gym',
    email: 'owner@primagym.com',
    phone: '080000000002',
    password: 'owner123',
    role: 'owner',
    referral_code: 'OWNER-PRIMA'
  },
  {
    name: 'Manager Prima Gym',
    email: 'manager@primagym.com',
    phone: '080000000003',
    password: 'manager123',
    role: 'manager',
    referral_code: 'MANAGER-PRIMA'
  },
  {
    name: 'Sales Prima Gym',
    email: 'sales@primagym.com',
    phone: '080000000004',
    password: 'sales123',
    role: 'sales',
    referral_code: 'SALES-PRIMA'
  },
  {
    name: 'Kasir Prima Gym',
    email: 'kasir@primagym.com',
    phone: '080000000005',
    password: 'kasir123',
    role: 'kasir',
    referral_code: 'KASIR-PRIMA'
  },
  {
    name: 'Customer Prima Gym',
    email: 'customer@primagym.com',
    phone: '080000000006',
    password: 'customer123',
    role: 'customer',
    referral_code: 'CUSTOMER-PRIMA'
  },
  {
    name: 'Personal Trainer',
    email: 'trainer@primagym.com',
    phone: '080000000007',
    password: 'password123',
    role: 'trainer',
    referral_code: 'TRAINER-PRIMA'
  }
];

async function seed() {
  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    console.log('Connected to PostgreSQL');

    for (const u of usersToSeed) {
      // Check if user exists
      const { rows } = await client.query('SELECT id FROM users WHERE email = $1', [u.email]);
      if (rows.length > 0) {
        console.log(`User already exists: ${u.email}`);
        continue;
      }

      const hashedPassword = await bcrypt.hash(u.password, 10);
      const query = `
        INSERT INTO users (
          name, email, phone, password, role, referral_code, is_active, points, max_points, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, true, 0, 100, NOW(), NOW()
        )
      `;
      await client.query(query, [u.name, u.email, u.phone, hashedPassword, u.role, u.referral_code]);
      console.log(`Seeded user: ${u.email} (${u.role})`);
    }
  } catch (err) {
    console.error('Error seeding users:', err);
  } finally {
    await client.end();
  }
}

seed();
