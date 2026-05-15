import nodemailer from "nodemailer";

type SendMembershipAgreementEmailParams = {
  to: string;
  memberName: string;
  pdfBuffer: Buffer;
  transactionCode: string;
};

function getRequiredEnv(key: string) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`ENV ${key} belum diisi`);
  }

  return value;
}

function createTransporter() {
  const host = getRequiredEnv("SMTP_HOST");
  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = String(process.env.SMTP_SECURE ?? "false").toLowerCase() === "true";

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: getRequiredEnv("SMTP_USER"),
      pass: getRequiredEnv("SMTP_PASS"),
    },
  });
}

export async function sendMembershipAgreementEmail({
  to,
  memberName,
  pdfBuffer,
  transactionCode,
}: SendMembershipAgreementEmailParams) {
  const transporter = createTransporter();

  const fromName = process.env.MAIL_FROM_NAME || "Prima Fitness Club";
  const fromEmail = process.env.MAIL_FROM_EMAIL || process.env.SMTP_USER;

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject: `Membership Prima Fitness Club Aktif - ${transactionCode}`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #222; line-height: 1.6;">
        <h2 style="color: #111;">Membership Prima Fitness Club Aktif</h2>
        <p>Halo <b>${memberName}</b>,</p>
        <p>
          Pembayaran membership Anda telah berhasil diproses dan membership Anda sudah aktif.
        </p>
        <p>
          Terlampir dokumen PDF Membership Agreement & Terms and Conditions Prima Fitness Club.
        </p>
        <p>
          Mohon simpan dokumen ini sebagai bukti dan referensi syarat serta ketentuan membership.
        </p>
        <br />
        <p style="font-weight: bold;">Commit to Your Best Version.</p>
        <p>Prima Fitness Club Management</p>
      </div>
    `,
    attachments: [
      {
        filename: `Prima-Fitness-Club-Membership-${transactionCode}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}