import PDFDocument from "pdfkit";
import path from "path";

type PdfUser = {
  id?: number;
  name?: string;
  email?: string;
  phone?: string;
};

type PdfPlan = {
  name?: string;
  programName?: string;
  packageCode?: string;
  durationDays?: number;
  personalTrainerSessions?: number;
  pilatesSessions?: number;
  freeMembershipDays?: number;
  benefits?: string[];
};

type PdfMembership = {
  id?: number;
  packageName?: string;
  packagePrice?: number;
  paymentMethod?: string;
  paymentStatus?: string;
  paidAmount?: number;
  paidAt?: Date | string | null;
  memberStatus?: string;
  startedAt?: Date | string | null;
  expiredAt?: Date | string | null;
  notes?: string | null;
};

type BuildMembershipAgreementPdfParams = {
  user: PdfUser;
  membership: PdfMembership;
  plan?: PdfPlan | null;
};

function getFontPath(fileName: string) {
  return path.join(process.cwd(), "public", "fonts", fileName);
}

function formatRupiah(value: unknown) {
  const number = Number(value ?? 0);

  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(number) ? number : 0);
}

function formatDate(value: unknown) {
  if (!value) return "-";

  const date = value instanceof Date ? value : new Date(String(value));

  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: unknown) {
  if (!value) return "-";

  const date = value instanceof Date ? value : new Date(String(value));

  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function safeText(value: unknown, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function addDivider(doc: PDFKit.PDFDocument) {
  doc.moveDown(0.5);
  doc
    .strokeColor("#D4AF37")
    .lineWidth(1)
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke();
  doc.moveDown(0.8);
}

function addSectionTitle(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown(0.5);
  doc.font("AppBold").fontSize(12).fillColor("#111111").text(title);
  doc.moveDown(0.3);
}

function addRow(doc: PDFKit.PDFDocument, label: string, value: string) {
  const startX = doc.page.margins.left;
  const labelWidth = 145;
  const y = doc.y;

  doc.font("AppBold").fontSize(9).fillColor("#333333").text(label, startX, y, {
    width: labelWidth,
  });

  doc
    .font("AppRegular")
    .fontSize(9)
    .fillColor("#333333")
    .text(value, startX + labelWidth, y, {
      width: doc.page.width - doc.page.margins.right - startX - labelWidth,
    });

  doc.moveDown(0.45);
}

function addBullet(doc: PDFKit.PDFDocument, text: string) {
  const x = doc.page.margins.left + 10;
  const y = doc.y;

  doc.font("AppRegular").fontSize(9).fillColor("#333333");
  doc.text("•", x, y, { width: 10 });
  doc.text(text, x + 16, y, {
    width: doc.page.width - doc.page.margins.right - x - 16,
    lineGap: 2,
  });

  doc.moveDown(0.25);
}

function addParagraph(doc: PDFKit.PDFDocument, text: string) {
  doc.font("AppRegular").fontSize(9).fillColor("#333333").text(text, {
    align: "justify",
    lineGap: 2,
  });
  doc.moveDown(0.4);
}

function addTerms(doc: PDFKit.PDFDocument) {
  addSectionTitle(doc, "Membership Terms & Conditions");

  addSectionTitle(doc, "1. Membership Policy");
  addParagraph(
    doc,
    "Membership bersifat pribadi dan eksklusif, tidak dapat dipindahtangankan atau digunakan oleh pihak lain. Setiap member wajib menggunakan akses resmi, yaitu fingerprint, saat memasuki area gym."
  );

  addSectionTitle(doc, "2. Access & Operating Hours");
  addParagraph(
    doc,
    "Akses fasilitas hanya berlaku selama masa aktif membership dan mengikuti jam operasional yang telah ditetapkan, yaitu pukul 07.00-21.00 WIB. Manajemen berhak melakukan penyesuaian jam operasional pada hari libur nasional, hari besar, atau kondisi tertentu lainnya."
  );

  addSectionTitle(doc, "3. Payment Terms");
  addParagraph(
    doc,
    "Seluruh pembayaran membership dan Personal Training (PT) dilakukan di muka, baik secara full payment maupun cicilan melalui kerja sama dengan pihak bank. Semua transaksi yang telah diselesaikan bersifat final dan tidak dapat dikembalikan (non-refundable)."
  );

  addSectionTitle(doc, "4. Membership Freeze Policy");
  addBullet(doc, "Minimum durasi freeze adalah 30 hari.");
  addBullet(doc, "Member wajib membayar biaya administrasi sebesar Rp100.000,-.");
  addBullet(
    doc,
    "Pengajuan freeze dilakukan sebelum masa aktif membership berakhir, maksimal pada 3 bulan terakhir masa membership."
  );

  addSectionTitle(doc, "5. Renewal Policy");
  addParagraph(
    doc,
    "Membership yang telah berakhir tidak dapat digunakan kembali. Member disarankan melakukan perpanjangan sebelum masa aktif habis agar akses dan benefit tetap berlanjut."
  );

  addSectionTitle(doc, "6. Club Etiquette & Facility Usage");
  addBullet(doc, "Menggunakan sepatu olahraga dan pakaian olahraga yang sesuai.");
  addBullet(doc, "Tidak menggunakan jeans atau sandal saat latihan.");
  addBullet(doc, "Menjaga kebersihan area gym.");
  addBullet(doc, "Merapikan kembali peralatan setelah digunakan.");
  addBullet(doc, "Menghormati sesama member dan staff.");
  addBullet(
    doc,
    "Tidak merokok, mengonsumsi alkohol, atau zat terlarang di area gym."
  );
  addBullet(doc, "Tidak menggunakan fasilitas di luar peruntukannya.");

  addSectionTitle(
    doc,
    "7. Personal Training, Pilates, Hyrox, dan Group Training Session Policy"
  );
  addBullet(doc, "Semua sesi berlaku sesuai paket yang dibeli.");
  addBullet(
    doc,
    "Minimal penggunaan sesi adalah 2 kali dalam seminggu selama masa aktif paket."
  );
  addBullet(
    doc,
    "Penjadwalan sesi wajib dilakukan sebelumnya melalui website resmi Prima Fitness Club."
  );
  addBullet(
    doc,
    "Pembatalan mendadak kurang dari 2 jam sebelum jadwal akan dianggap sebagai sesi terpakai."
  );
  addBullet(
    doc,
    "Seluruh paket Personal Training, Pilates, Hyrox, maupun Group Training tidak dapat dipindahtangankan kepada orang lain."
  );

  addSectionTitle(doc, "8. Safety & Liability");
  addParagraph(
    doc,
    "Member bertanggung jawab atas kondisi kesehatan pribadi selama berolahraga. Manajemen tidak bertanggung jawab atas cedera akibat kelalaian penggunaan alat, ketidaksesuaian kondisi fisik, atau penggunaan fasilitas yang tidak sesuai aturan. Barang pribadi merupakan tanggung jawab masing-masing member."
  );

  addSectionTitle(doc, "9. Privacy & Data Protection");
  addParagraph(
    doc,
    "Data pribadi member, termasuk penggunaan sistem digital seperti fingerprint, akan dijaga kerahasiaannya dan hanya digunakan untuk kepentingan operasional internal Prima Fitness Club."
  );

  addSectionTitle(doc, "10. Violations & Enforcement");
  addBullet(doc, "Teguran resmi.");
  addBullet(doc, "Pembekuan akses.");
  addBullet(doc, "Penghentian membership tanpa pengembalian dana.");
  addParagraph(
    doc,
    "Membership juga dapat dihentikan tanpa pengembalian dana apabila member terbukti menjadi atau menjalankan aktivitas sebagai Personal Trainer freelance di dalam area Prima Fitness Club tanpa izin resmi dari manajemen."
  );

  addSectionTitle(doc, "11. Policy Updates");
  addParagraph(
    doc,
    "Manajemen berhak melakukan perubahan terhadap syarat dan ketentuan ini sewaktu-waktu demi peningkatan kualitas layanan dan kenyamanan bersama."
  );
}

export async function buildMembershipAgreementPdf({
  user,
  membership,
  plan,
}: BuildMembershipAgreementPdfParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const chunks: Buffer[] = [];

      const regularFontPath = getFontPath("Roboto-Regular.ttf");
      const boldFontPath = getFontPath("Roboto-Bold.ttf");

      const doc = new PDFDocument({
        size: "A4",
        margin: 42,

        font: regularFontPath,

        info: {
          Title: `Membership Agreement - ${safeText(user.name)}`,
          Author: "Prima Fitness Club",
          Subject: "Membership Terms & Conditions",
        },

        ownerPassword: process.env.PDF_OWNER_PASSWORD || "PrimaFitnessClub",
        permissions: {
          printing: "highResolution",
          modifying: false,
          copying: false,
          annotating: false,
          fillingForms: false,
          contentAccessibility: true,
          documentAssembly: false,
        },
      } as PDFKit.PDFDocumentOptions & { font: string });

      doc.registerFont("AppRegular", regularFontPath);
      doc.registerFont("AppBold", boldFontPath);
      doc.font("AppRegular");

      doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.rect(0, 0, doc.page.width, 86).fill("#111111");

      doc.fillColor("#D4AF37").font("AppBold").fontSize(20).text(
        "PRIMA FITNESS CLUB",
        42,
        28,
        {
          align: "center",
          width: doc.page.width - 84,
        }
      );

      doc
        .fillColor("#FFFFFF")
        .font("AppRegular")
        .fontSize(10)
        .text("Membership Agreement & Terms and Conditions", 42, 55, {
          align: "center",
          width: doc.page.width - 84,
        });

      doc.y = 112;

      doc
        .font("AppBold")
        .fontSize(14)
        .fillColor("#111111")
        .text("Declaration & Agreement", { align: "center" });

      doc.moveDown(0.5);

      addParagraph(
        doc,
        "Saya telah membaca, memahami, dan menyetujui seluruh Membership Terms & Conditions yang berlaku di Prima Fitness Club. Dokumen ini diterbitkan secara otomatis oleh sistem setelah pembayaran membership dinyatakan berhasil."
      );

      addDivider(doc);

      addSectionTitle(doc, "Data Member");
      addRow(doc, "Nama Lengkap", safeText(user.name));
      addRow(doc, "Email", safeText(user.email));
      addRow(doc, "No. Telepon", safeText(user.phone));
      addRow(doc, "Member ID", String(user.id ?? "-"));

      addSectionTitle(doc, "Data Membership");
      addRow(
        doc,
        "No. Transaksi",
        `PFC-${String(membership.id ?? "-").padStart(6, "0")}`
      );
      addRow(doc, "Paket", safeText(membership.packageName ?? plan?.name));
      addRow(doc, "Program", safeText(plan?.programName));
      addRow(doc, "Kode Paket", safeText(plan?.packageCode));
      addRow(doc, "Harga Paket", formatRupiah(membership.packagePrice));
      addRow(doc, "Nominal Dibayar", formatRupiah(membership.paidAmount));
      addRow(
        doc,
        "Metode Pembayaran",
        safeText(membership.paymentMethod).toUpperCase()
      );
      addRow(
        doc,
        "Status Pembayaran",
        safeText(membership.paymentStatus).toUpperCase()
      );
      addRow(
        doc,
        "Status Membership",
        safeText(membership.memberStatus).toUpperCase()
      );

      // Hanya tampilkan tanggal pembayaran.
      // Mulai Aktif dan Berakhir sengaja tidak ditampilkan.
      addRow(doc, "Tanggal Pembayaran", formatDateTime(membership.paidAt));

      if (
        plan?.benefits &&
        Array.isArray(plan.benefits) &&
        plan.benefits.length > 0
      ) {
        addSectionTitle(doc, "Benefit Paket");

        for (const benefit of plan.benefits) {
          addBullet(doc, String(benefit));
        }
      }

      addDivider(doc);

      addTerms(doc);

      doc.moveDown(1);
      addDivider(doc);

      doc
        .font("AppBold")
        .fontSize(10)
        .fillColor("#111111")
        .text("Commit to Your Best Version.", { align: "center" });

      doc
        .font("AppRegular")
        .fontSize(9)
        .fillColor("#333333")
        .text("Prima Fitness Club Management", { align: "center" });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}