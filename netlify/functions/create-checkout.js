const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { amount, invoiceId, invoiceNum, clientName, clientEmail, servico, successUrl, cancelUrl } = JSON.parse(event.body);

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valor inválido.' }) };
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `AlumiCraft – ${servico || 'Aluminum Services'}`,
            description: `${invoiceNum || ('Invoice #' + invoiceId)} · Client: ${clientName || 'N/A'}`,
          },
          unit_amount: Math.round(parseFloat(amount) * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      customer_email: clientEmail || undefined,
      metadata: { invoice_id: String(invoiceId), invoice_num: invoiceNum || '', client_name: clientName || '' },
      success_url: successUrl || 'https://alumicraft.com?payment=success',
      cancel_url: cancelUrl || 'https://alumicraft.com?payment=cancelled',
    });

    return { statusCode: 200, headers, body: JSON.stringify({ url: session.url, sessionId: session.id }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
