const { Client } = require('pg');
const client = new Client({
  user: 'postgres',
  host: '127.0.0.1',
  database: 'prima_gym_db',
  password: '',
  port: 5432
});

async function seedPlans() {
  await client.connect();

  const now = new Date();

  const plans = [
    {
      program_name: 'Gym',
      customer_category: 'New Member',
      package_code: 'GYM-BASIC',
      name: 'Gym Basic 1 Bulan',
      description: 'Akses penuh ke semua alat fitness Prima Gym selama 1 bulan.',
      price: 250000,
      duration_days: 30,
      benefits: JSON.stringify(["Akses semua alat", "Loker gratis", "Free Wifi", "Shower"]),
      personal_trainer_sessions: 0,
      pilates_sessions: 0,
    },
    {
      program_name: 'Personal Trainer',
      customer_category: 'VIP',
      package_code: 'PT-PRO-10',
      name: 'Paket PT 10 Sesi',
      description: '10 Sesi latihan intensif bersama Personal Trainer profesional, gratis gym akses.',
      price: 1500000,
      duration_days: 60,
      benefits: JSON.stringify(["10 Sesi PT", "Free akses gym 60 hari", "Konsultasi gizi", "Towel gratis"]),
      personal_trainer_sessions: 10,
      pilates_sessions: 0,
    },
    {
      program_name: 'Pilates',
      customer_category: 'Premium',
      package_code: 'PILATES-4',
      name: 'Pilates Class (4 Sesi)',
      description: 'Kelas Pilates eksklusif untuk memperbaiki postur tubuh dan kelenturan.',
      price: 600000,
      duration_days: 30,
      benefits: JSON.stringify(["4 Sesi Pilates", "Matras disediakan", "Instruktur tersertifikasi"]),
      personal_trainer_sessions: 0,
      pilates_sessions: 4,
    }
  ];

  for (const p of plans) {
    await client.query(`
      INSERT INTO membership_plans (
        program_name, customer_category, package_code, name, description, 
        price, duration_days, benefits, personal_trainer_sessions, pilates_sessions,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      p.program_name, p.customer_category, p.package_code, p.name, p.description,
      p.price, p.duration_days, p.benefits, p.personal_trainer_sessions, p.pilates_sessions,
      now, now
    ]);
  }

  console.log("Dummy plans inserted successfully.");
  await client.end();
}

seedPlans().catch(console.error);
