const { Client } = require('pg');

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/prima_gym_db';

const initialChanges = [
  {
    version: 'v1.0.0',
    title: 'Integrasi Smart Gate Turnstile & Access Control',
    category: 'Integrasi',
    items: [
      {
        pointTitle: 'Sinkronisasi Otomatis Gate',
        description: 'Saat kasir menyetujui pembayaran paket member, data member langsung terdaftar di barrier gate turnstile secara otomatis.',
        orderIndex: 1
      },
      {
        pointTitle: 'Upload & Registrasi Wajah',
        description: 'Dukungan pendaftaran foto wajah member ke mesin Face Recognition gate untuk akses check-in tanpa kartu fisik.',
        orderIndex: 2
      },
      {
        pointTitle: 'Deaktivasi Otomatis & Manual',
        description: 'Member expired atau dinonaktifkan langsung kehilangan akses gate secara otomatis demi keamanan fasilitas gym.',
        orderIndex: 3
      },
      {
        pointTitle: 'Sinkronisasi Ulang Manual (Retry)',
        description: 'Tombol sync ulang di halaman detail member jika terjadi kendala koneksi sementara pada perangkat barrier gate.',
        orderIndex: 4
      }
    ]
  },
  {
    version: 'v1.1.0',
    title: 'Penyesuaian Tanggal Mulai & Masa Aktif Membership',
    category: 'Fitur',
    items: [
      {
        pointTitle: 'Edit Tanggal Mulai & Kadaluarsa',
        description: 'Admin dan staf berwenang dapat menyesuaikan tanggal mulai (start_date) dan kadaluarsa (end_date) paket langsung dari modal detail member.',
        orderIndex: 1
      },
      {
        pointTitle: 'Kalkulasi Otomatis Durasi Aktif',
        description: 'Dialog penyesuaian otomatis menghitung dan menampilkan total durasi hari aktif berdasarkan rentang tanggal yang dipilih.',
        orderIndex: 2
      },
      {
        pointTitle: 'Fitur Reset Tanggal Fleksibel',
        description: 'Tersedia tombol reset tanggal untuk mengosongkan tanggal kembali jika paket belum diaktifkan atau belum ditentukan oleh member.',
        orderIndex: 3
      },
      {
        pointTitle: 'Audit Activity Logging Lengkap',
        description: 'Seluruh riwayat perubahan tanggal membership dicatat ke dalam audit logs lengkap dengan aktor staf, nilai sebelum, dan nilai sesudah.',
        orderIndex: 4
      }
    ]
  },
  {
    version: 'v1.2.0',
    title: 'Daftar Perubahan & Penyesuaian Sistem',
    category: 'Fitur',
    items: [
      {
        pointTitle: 'Portal Changelog Seluruh Staf',
        description: 'Seluruh role staf (Admin, Manager, Kasir, Sales, Trainer, Owner, Direktur, IT) dapat memantau riwayat pembaruan sistem secara berkala.',
        orderIndex: 1
      },
      {
        pointTitle: 'Hak Akses & Pengelolaan IT Terpusat',
        description: 'Hanya tim IT yang memiliki wewenang untuk menambah, memperbarui, atau menghapus catatan penyesuaian sistem.',
        orderIndex: 2
      },
      {
        pointTitle: 'Skema Database Ternormalisasi',
        description: 'Menggunakan relasi tabel parent-child (system_changes & system_change_items) tanpa kolom JSONB sesuai standar enterprise.',
        orderIndex: 3
      },
      {
        pointTitle: 'Zero Trust & Anti-IDOR Security',
        description: 'Proteksi endpoint API dengan cryptographic JWT token verification dan role-based access control yang ketat.',
        orderIndex: 4
      }
    ]
  }
];

async function seed() {
  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    console.log('Connected to PostgreSQL database');

    // Drop old misaligned tables if existing
    await client.query('DROP TABLE IF EXISTS system_change_items CASCADE;');
    await client.query('DROP TABLE IF EXISTS system_changes CASCADE;');

    // Create tables matching Sequelize model exactly
    await client.query(`
      CREATE TABLE system_changes (
        id SERIAL PRIMARY KEY,
        author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        author_name VARCHAR(100) NOT NULL DEFAULT 'IT Team',
        version VARCHAR(30) NOT NULL,
        title VARCHAR(200) NOT NULL,
        category VARCHAR(50) NOT NULL DEFAULT 'General',
        released_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE system_change_items (
        id SERIAL PRIMARY KEY,
        system_change_id INTEGER NOT NULL REFERENCES system_changes(id) ON DELETE CASCADE,
        point_title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        order_index INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS user_system_change_reads (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        system_change_id INTEGER NOT NULL REFERENCES system_changes(id) ON DELETE CASCADE,
        read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_user_system_change_read UNIQUE (user_id, system_change_id)
      );
    `);

    const itUserRes = await client.query("SELECT id, name FROM users WHERE role = 'it' LIMIT 1");
    const itUser = itUserRes.rows[0];
    const itUserId = itUser ? itUser.id : null;
    const itUserName = itUser ? itUser.name : 'Tim IT Prima';

    for (const change of initialChanges) {
      const insertChangeRes = await client.query(
        `INSERT INTO system_changes (author_user_id, author_name, version, title, category, released_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), NOW()) RETURNING id`,
        [itUserId, itUserName, change.version, change.title, change.category]
      );

      const changeId = insertChangeRes.rows[0].id;
      for (const item of change.items) {
        await client.query(
          `INSERT INTO system_change_items (system_change_id, point_title, description, order_index, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())`,
          [changeId, item.pointTitle, item.description, item.orderIndex]
        );
      }
      console.log(`Seeded system change: ${change.version} - ${change.title} (${change.items.length} items)`);
    }

    console.log('System changes seeding completed successfully with correct Sequelize columns.');
  } catch (err) {
    console.error('Error seeding system changes:', err);
  } finally {
    await client.end();
  }
}

seed();
