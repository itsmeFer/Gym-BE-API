import nodemailer from "nodemailer";

type SendPasswordResetOtpParams = {
  to: string;
  name: string;
  code: string;
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
  const secure =
    String(process.env.SMTP_SECURE ?? "false").toLowerCase() === "true";

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

export async function sendPasswordResetOtpEmail({
  to,
  name,
  code,
}: SendPasswordResetOtpParams) {
  const transporter = createTransporter();

  const fromName = process.env.MAIL_FROM_NAME || "Prima Fitness Club";
  const fromEmail = process.env.MAIL_FROM_EMAIL || process.env.SMTP_USER;

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject: "Kode Reset Password Akun Prima Fitness Club",
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #0c0d0e; padding: 32px 16px; color: #f5f5f5;">
        <div style="max-width: 500px; margin: auto; background: #181a1d; border-radius: 16px; padding: 32px; border: 1px solid #2d3139;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #dce900; margin: 0; font-size: 22px; letter-spacing: 1px; text-transform: uppercase;">Prima Fitness Club</h1>
            <p style="color: #9aa0a6; font-size: 13px; margin: 6px 0 0 0;">Pemulihan Kata Sandi Akun</p>
          </div>

          <p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
            Halo <b>${name}</b>,
          </p>

          <p style="font-size: 14px; color: #cccccc; line-height: 1.6; margin: 0 0 24px 0;">
            Kami menerima permintaan untuk mereset kata sandi akun Anda. Gunakan kode verifikasi di bawah ini untuk melanjutkan proses:
          </p>

          <div style="text-align: center; margin: 28px 0;">
            <div style="display: inline-block; letter-spacing: 8px; font-size: 32px; font-weight: 800; color: #0c0d0e; background: #dce900; padding: 14px 28px; border-radius: 12px; font-family: monospace;">
              ${code}
            </div>
          </div>

          <p style="font-size: 13px; color: #ffb4a9; line-height: 1.5; margin: 0 0 16px 0;">
            Kode OTP ini hanya berlaku selama <b>5 menit</b>. Jangan berikan kode ini kepada siapa pun, termasuk staf Prima Fitness Club.
          </p>

          <p style="font-size: 13px; color: #80868b; line-height: 1.5; margin: 0;">
            Jika Anda tidak merasa mengajukan reset password ini, abaikan email ini. Akun Anda tetap aman.
          </p>

          <hr style="border: none; border-top: 1px solid #2d3139; margin: 28px 0;" />

          <p style="font-size: 12px; color: #5f6368; text-align: center; margin: 0;">
            &copy; ${new Date().getFullYear()} Prima Fitness Club. All rights reserved.
          </p>
        </div>
      </div>
    `,
  });
}
