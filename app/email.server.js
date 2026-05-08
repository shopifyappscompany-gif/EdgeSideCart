import nodemailer from "nodemailer";

export async function sendSupportEmail({ shop, name, message }) {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass) {
    console.warn("[EdgeCart] EMAIL_USER or EMAIL_PASS not set — skipping email.");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: `"EdgeCart Support" <${user}>`,
    to: user,
    subject: `[EdgeCart] New message from ${shop}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#0f172a;margin-bottom:4px">New Support Message</h2>
        <p style="color:#6b7280;margin-top:0;font-size:14px">Received from EdgeCart admin</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#374151;font-weight:600;width:100px">Shop</td>
            <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#111827">${shop}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#374151;font-weight:600">Name</td>
            <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#111827">${name}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#374151;font-weight:600;vertical-align:top">Message</td>
            <td style="padding:10px 0;color:#111827;white-space:pre-wrap">${message}</td>
          </tr>
        </table>
        <p style="margin-top:24px;font-size:12px;color:#9ca3af">Sent via EdgeCart Help & Support page</p>
      </div>
    `,
  });
}
