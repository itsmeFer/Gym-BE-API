/**
 * Feature Registry - Master list of all features per domain.
 * Satu-satunya sumber kebenaran untuk manajemen hak akses fitur.
 */
export const FEATURE_DOMAINS = ["admin", "manager", "sales", "trainer", "kasir"] as const;

export type FeatureDomain = (typeof FEATURE_DOMAINS)[number];

export interface FeatureDef {
  key: string;
  label: string;
  domain: FeatureDomain;
}

export const FEATURES: FeatureDef[] = [
  // Admin Domain
  { key: "admin.kelola_karyawan", label: "Kelola Tim & Staf", domain: "admin" },
  { key: "admin.absensi", label: "Absensi Staf", domain: "admin" },
  { key: "admin.kasir", label: "Verifikasi Pembayaran (Kasir)", domain: "admin" },
  { key: "admin.kelola_kelas", label: "Kelola Kelas", domain: "admin" },
  { key: "admin.laporan", label: "Laporan Keuangan", domain: "admin" },
  { key: "admin.member", label: "Kelola Member", domain: "admin" },
  { key: "admin.membership", label: "Kelola Membership", domain: "admin" },
  { key: "admin.referral", label: "Kelola Referral", domain: "admin" },
  { key: "admin.sales_monitor", label: "Pantau Performa Sales", domain: "admin" },

  // Manager Domain
  { key: "manager.absensi", label: "Absensi Staf", domain: "manager" },
  { key: "manager.pembayaran", label: "Approval Pembayaran", domain: "manager" },
  { key: "manager.member", label: "Kelola Member", domain: "manager" },
  { key: "manager.membership", label: "Kelola Membership", domain: "manager" },
  { key: "manager.laporan", label: "Laporan", domain: "manager" },
  { key: "manager.users", label: "Kelola Users", domain: "manager" },
  { key: "manager.referral", label: "Kelola Referral", domain: "manager" },

  // Sales Domain
  { key: "sales.dashboard", label: "Dashboard Penjualan", domain: "sales" },
  { key: "sales.performa", label: "Performa Penjualan", domain: "sales" },
  { key: "sales.membership", label: "Proses Membership", domain: "sales" },
  { key: "sales.prospek", label: "Kelola Prospek", domain: "sales" },

  // Trainer Domain
  { key: "trainer.jadwal", label: "Jadwal Melatih", domain: "trainer" },
  { key: "trainer.klien", label: "Data Klien", domain: "trainer" },

  // Kasir Domain
  { key: "kasir.verifikasi", label: "Verifikasi Pembayaran", domain: "kasir" },
  { key: "kasir.pembayaran", label: "Terima Pembayaran", domain: "kasir" },
];

/** Default feature keys granted per role. */
export const ROLE_DEFAULT_FEATURES: Record<string, string[]> = {
  admin: FEATURES.filter((f) => f.domain === "admin").map((f) => f.key),
  owner: FEATURES.map((f) => f.key), // owner has all
  direktur: FEATURES.map((f) => f.key),
  manager: FEATURES.filter((f) => f.domain === "manager").map((f) => f.key),
  sales: FEATURES.filter((f) => f.domain === "sales").map((f) => f.key),
  kasir: FEATURES.filter((f) => f.domain === "kasir").map((f) => f.key),
  trainer: FEATURES.filter((f) => f.domain === "trainer").map((f) => f.key),
  it: FEATURES.map((f) => f.key), // IT has all
  karyawan: [],
  customer: [],
};

export const LEGACY_FEATURE_KEYS = ["admin.users"] as const;

export function isValidFeatureKey(key: string): boolean {
  return (
    FEATURES.some((f) => f.key === key) ||
    (LEGACY_FEATURE_KEYS as readonly string[]).includes(key)
  );
}
