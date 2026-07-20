const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Creates a Stripe Checkout Session in SUBSCRIPTION mode for a Trade Partner's
// monthly management fee. Uses inline recurring price_data so no Product/Price
// needs to be pre-created in the Stripe Dashboard.
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
    const body = JSON.parse(event.body || '{}');
    const {
      amount, partnerId, partnerName, partnerEmail, plan,
      companyId, successUrl, cancelUrl
    } = body;

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid monthly fee amount.' }) };
    }
    if (!partnerId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing partnerId.' }) };
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `AlumiCraft Trade Partner — ${plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : 'Partner'} Plan`,
            description: `Monthly coordination fee for ${partnerName || 'Trade Partner'}`
          },
          unit_amount: Math.round(parseFloat(amount) * 100),
          recurring: { interval: 'month' }
        },
        quantity: 1
      }],
      customer_email: partnerEmail || undefined,
      metadata: {
        partner_id: String(partnerId || ''),
        partner_name: partnerName || '',
        company_id: companyId || '',
        plan: plan || ''
      },
      subscription_data: {
        metadata: {
          partner_id: String(partnerId || ''),
          partner_name: partnerName || '',
          company_id: companyId || '',
          plan: plan || ''
        }
      },
      success_url: successUrl || 'https://alumicraft-stripe.netlify.app?billing=success',
      cancel_url: cancelUrl || 'https://alumicraft-stripe.netlify.app?billing=cancelled',
    });

    return { statusCode: 200, headers, body: JSON.stringify({ url: session.url, sessionId: session.id }) };

  } catch (err) {
    console.error('Stripe subscription error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
