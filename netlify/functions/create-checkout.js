const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    let amount, invoiceId, invoiceNum, clientName, clientEmail, servico, successUrl, cancelUrl;

    if (event.httpMethod === 'GET') {
      const q = event.queryStringParameters || {};
      amount = q.amount; invoiceId = q.invoiceId; invoiceNum = q.invoiceNum;
      clientName = q.clientName; clientEmail = q.clientEmail;
      servico = q.servico; successUrl = q.successUrl; cancelUrl = q.cancelUrl;
    } else if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      amount = body.amount; invoiceId = body.invoiceId; invoiceNum = body.invoiceNum;
      clientName = body.clientName; clientEmail = body.clientEmail;
      servico = body.servico; successUrl = body.successUrl; cancelUrl = body.cancelUrl;
    } else {
      return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valor inválido.' }) };
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price_data: { currency: 'usd', product_data: { name: `AlumiCraft – ${servico || 'Aluminum Services'}`, description: `${invoiceNum || ('Invoice #' + invoiceId)} · Client: ${clientName || 'N/A'}` }, unit_amount: Math.round(parseFloat(amount) * 100) }, quantity: 1 }],
      mode: 'payment',
      customer_email: clientEmail || undefined,
      metadata: { invoice_id: String(invoiceId || ''), invoice_num: invoiceNum || '', client_name: clientName || '' },
      success_url: successUrl || 'https://alumicraft-stripe.netlify.app?payment=success',
      cancel_url:  cancelUrl  || 'https://alumicraft-stripe.netlify.app?payment=cancelled',
    });

    if (event.httpMethod === 'GET') {
      return { statusCode: 302, headers: { ...headers, 'Location': session.url }, body: '' };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ url: session.url, sessionId: session.id }) };

  } catch (err) {
    console.error('Stripe error:', err.message);
    if (event.httpMethod === 'GET') {
      return { statusCode: 302, headers: { ...headers, 'Location': `https://alumicraft-stripe.netlify.app?error=${encodeURIComponent(err.message)}` }, body: '' };
    }
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
