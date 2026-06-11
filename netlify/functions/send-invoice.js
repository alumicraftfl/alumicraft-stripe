const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const {
      to, clientName, invoiceNum, total, subtotal, discount,
      dueDate, servico, payLink, items, notes
    } = JSON.parse(event.body || '{}');

    if (!to) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email do cliente não informado.' }) };
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Configuração de email ausente. Adicione EMAIL_USER e EMAIL_PASS nas variáveis de ambiente do Netlify.' }) };
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      tls: { rejectUnauthorized: false }
    });

    // Build line items rows
    const itemsHtml = (items || []).map((it, i) => `
      <tr style="background:${i % 2 === 0 ? '#f9fafc' : '#ffffff'}">
        <td style="padding:10px 14px;font-size:13px;color:#4a5568">${it.tipo || '-'}</td>
        <td style="padding:10px 14px;font-size:13px;color:#718096">${it.desc || '-'}</td>
        <td style="padding:10px 14px;font-size:13px;text-align:center;color:#4a5568">${it.qty}</td>
        <td style="padding:10px 14px;font-size:13px;text-align:right;color:#4a5568">$ ${parseFloat(it.preco || 0).toFixed(2)}</td>
        <td style="padding:10px 14px;font-size:13px;text-align:right;font-weight:600;color:#1a202c">$ ${(parseFloat(it.qty || 0) * parseFloat(it.preco || 0)).toFixed(2)}</td>
      </tr>`).join('');

    const discountNum = parseFloat(discount || 0);
    const totalNum    = parseFloat(total || 0);
    const subtotalNum = parseFloat(subtotal || total || 0);

    const payBlock = payLink ? `
      <div style="background:linear-gradient(135deg,#f5f3ff,#ede9fe);border:2px solid #c4b5fd;border-radius:12px;padding:24px 28px;margin:24px 0;text-align:center">
        <p style="margin:0 0 4px;font-size:16px;font-weight:800;color:#6d28d9">⚡ Pay Online — Secure Checkout</p>
        <p style="margin:0 0 16px;font-size:13px;color:#7c3aed">Pay securely with Visa, Mastercard, Apple Pay or Google Pay</p>
        <a href="${payLink}" style="display:inline-block;background:#635bff;color:#ffffff;padding:13px 36px;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.2px">💳 Pay Now — $ ${totalNum.toFixed(2)}</a>
        <p style="margin:14px 0 0;font-size:10px;color:#a78bfa;word-break:break-all">${payLink}</p>
      </div>` : '';

    const discountRow = discountNum > 0 ? `
      <div style="display:flex;justify-content:space-between;padding:9px 16px;font-size:13px;border-bottom:1px solid #e2e8f0;color:#e53e3e">
        <span>Discount</span><span>- $ ${discountNum.toFixed(2)}</span>
      </div>` : '';

    const notesBlock = notes ? `
      <div style="background:#f7fafc;border-radius:8px;padding:14px 16px;margin-bottom:24px">
        <p style="margin:0 0 5px;font-size:10px;text-transform:uppercase;color:#718096;letter-spacing:0.5px;font-weight:600">Notes / Terms</p>
        <p style="margin:0;font-size:13px;color:#4a5568;line-height:1.5">${notes}</p>
      </div>` : '';

    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invoice ${invoiceNum || ''} – AlumiCraft</title></head>
<body style="margin:0;padding:0;background:#edf2f7;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:620px;margin:32px auto 48px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 28px rgba(0,0,0,.12)">

  <!-- Header -->
  <div style="background:#1a5fa8;padding:28px 32px">
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <td style="vertical-align:top">
          <p style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px">AlumiCraft</p>
          <p style="margin:4px 0 0;color:#93c5fd;font-size:12px">Professional Aluminum Solutions</p>
          <p style="margin:2px 0 0;color:#93c5fd;font-size:11px">Gutters · Soffit · Pool Cage · Carport · Railing</p>
        </td>
        <td style="vertical-align:top;text-align:right">
          <p style="margin:0;color:#ffffff;font-size:26px;font-weight:800;letter-spacing:2px">INVOICE</p>
          <p style="margin:5px 0 0;color:#bfdbfe;font-size:14px;font-weight:600">${invoiceNum || ''}</p>
        </td>
      </tr>
    </table>
  </div>

  <!-- Body -->
  <div style="padding:28px 32px">

    <!-- Greeting -->
    <p style="font-size:15px;color:#1a202c;margin:0 0 4px">Hi <strong>${clientName || 'there'}</strong>,</p>
    <p style="font-size:14px;color:#718096;margin:0 0 24px">Please find your invoice details below. We appreciate your business!</p>

    <!-- Info boxes -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr>
        <td style="width:33%;padding-right:8px;vertical-align:top">
          <div style="background:#f7fafc;border-radius:8px;padding:12px 14px">
            <p style="margin:0 0 3px;font-size:10px;text-transform:uppercase;color:#718096;letter-spacing:0.5px;font-weight:600">Invoice #</p>
            <p style="margin:0;font-size:14px;font-weight:700;color:#1a202c">${invoiceNum || ''}</p>
          </div>
        </td>
        <td style="width:33%;padding-right:8px;vertical-align:top">
          <div style="background:#f7fafc;border-radius:8px;padding:12px 14px">
            <p style="margin:0 0 3px;font-size:10px;text-transform:uppercase;color:#718096;letter-spacing:0.5px;font-weight:600">Due Date</p>
            <p style="margin:0;font-size:14px;font-weight:700;color:#1a202c">${dueDate || ''}</p>
          </div>
        </td>
        <td style="width:33%;vertical-align:top">
          <div style="background:#f7fafc;border-radius:8px;padding:12px 14px">
            <p style="margin:0 0 3px;font-size:10px;text-transform:uppercase;color:#718096;letter-spacing:0.5px;font-weight:600">Service</p>
            <p style="margin:0;font-size:14px;font-weight:700;color:#1a202c">${servico || 'Aluminum Services'}</p>
          </div>
        </td>
      </tr>
    </table>

    <!-- Line items table -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;border-radius:8px;overflow:hidden">
      <thead>
        <tr style="background:#1a5fa8">
          <th style="padding:10px 14px;text-align:left;color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:0.4px;font-weight:600">Type</th>
          <th style="padding:10px 14px;text-align:left;color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:0.4px;font-weight:600">Description</th>
          <th style="padding:10px 14px;text-align:center;color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:0.4px;font-weight:600">Qty</th>
          <th style="padding:10px 14px;text-align:right;color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:0.4px;font-weight:600">Unit</th>
          <th style="padding:10px 14px;text-align:right;color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:0.4px;font-weight:600">Amount</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <!-- Totals -->
    <div style="margin-left:auto;width:260px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px">
      <div style="display:flex;justify-content:space-between;padding:9px 16px;font-size:13px;border-bottom:1px solid #e2e8f0;color:#4a5568">
        <span>Subtotal</span><span>$ ${subtotalNum.toFixed(2)}</span>
      </div>
      ${discountRow}
      <div style="display:flex;justify-content:space-between;padding:11px 16px;font-size:15px;font-weight:700;background:#1a5fa8;color:#ffffff">
        <span>TOTAL DUE</span><span>$ ${totalNum.toFixed(2)}</span>
      </div>
    </div>

    ${payBlock}
    ${notesBlock}

    <p style="font-size:13px;color:#718096;margin:0 0 4px">If you have any questions about this invoice, please don't hesitate to reach out.</p>
    <p style="font-size:13px;color:#718096;margin:0">Thank you for choosing AlumiCraft!</p>
  </div>

  <!-- Footer -->
  <div style="background:#f7fafc;padding:16px 32px;text-align:center;border-top:1px solid #e2e8f0">
    <p style="margin:0;font-size:12px;color:#718096;font-weight:600">AlumiCraft – Aluminum Industry</p>
    <p style="margin:4px 0 0;font-size:11px;color:#a0aec0">Professional Aluminum Solutions</p>
  </div>

</div>
</body></html>`;

    await transporter.sendMail({
      from: `AlumiCraft <${process.env.EMAIL_USER}>`,
      to,
      subject: `Invoice ${invoiceNum || ''} – AlumiCraft | Due: ${dueDate || ''} | $ ${totalNum.toFixed(2)}`,
      html
    });

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };

  } catch (err) {
    console.error('Email send error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
