import nodemailer from "nodemailer";

type SendEmailVerificationParams = {
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

export async function sendEmailVerificationCode({
  to,
  name,
  code,
}: SendEmailVerificationParams) {
  const transporter = createTransporter();

  const fromName = process.env.MAIL_FROM_NAME || "Prima Fitness Club";
  const fromEmail = process.env.MAIL_FROM_EMAIL || process.env.SMTP_USER;

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject: "Kode Verifikasi Email Prima Fitness Club",
    html: `
      <div style="font-family: Arial, sans-serif; background: #f6f6f6; padding: 24px;">
        <div style="max-width: 520px; margin: auto; background: #ffffff; border-radius: 14px; padding: 28px; border: 1px solid #eeeeee;">
          <h2 style="margin: 0 0 12px; color: #111111;">Verifikasi Email</h2>

          <p style="font-size: 15px; color: #333333; line-height: 1.6;">
            Halo <b>${name}</b>,
          </p>

          <p style="font-size: 15px; color: #333333; line-height: 1.6;">
            Masukkan kode berikut untuk menyelesaikan registrasi akun Prima Fitness Club.
          </p>

          <div style="margin: 24px 0; text-align: center;">
            <div style="display: inline-block; letter-spacing: 8px; font-size: 34px; font-weight: 800; color: #111111; background: #f3d37a; padding: 16px 24px; border-radius: 12px;">
              ${code}
            </div>
          </div>

          <p style="font-size: 14px; color: #555555; line-height: 1.6;">
            Kode ini berlaku selama <b>5 menit</b>. Jangan berikan kode ini kepada siapa pun.
          </p>

          <p style="font-size: 14px; color: #555555; line-height: 1.6;">
            Jika kamu tidak merasa melakukan registrasi, abaikan email ini.
          </p>

          <br />

          <p style="font-size: 14px; color: #111111; font-weight: bold;">
            Prima Fitness Club Management
          </p>
        </div>
      </div>
    `,
  });
}