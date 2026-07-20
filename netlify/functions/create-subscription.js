const gocardless = require('gocardless-nodejs');
const { Environments } = require('gocardless-nodejs');

// Creates a GoCardless Billing Request + Billing Request Flow to set up a
// Direct Debit (ACH) mandate for a Trade Partner's recurring monthly fee.
// Returns a hosted authorisation URL — the partner enters their bank details
// there; GoCardless handles all compliance, this app never sees bank data.
// The recurring Subscription itself is created by gocardless-webhook.js once
// the mandate becomes active (see 'billing_requests: fulfilled' event).
//
// Required env vars on Netlify:
//   GOCARDLESS_ACCESS_TOKEN   (GoCardless dashboard -> Developers -> Create access token)
//   GOCARDLESS_ENV            ('live' or 'sandbox', defaults to 'sandbox')

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
    if (!process.env.GOCARDLESS_ACCESS_TOKEN) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'GOCARDLESS_ACCESS_TOKEN not configured on the server.' }) };
    }

    const env = (process.env.GOCARDLESS_ENV || 'sandbox') === 'live' ? Environments.Live : Environments.Sandbox;
    const client = gocardless(process.env.GOCARDLESS_ACCESS_TOKEN, env);

    const metadata = {
      partner_id: String(partnerId || ''),
      partner_name: (partnerName || '').slice(0, 190),
      company_id: companyId || '',
      plan: plan || '',
      monthly_fee: String(amount)
    };

    // 1. Billing Request: sets up an ACH Direct Debit mandate (no upfront payment —
    //    the recurring subscription is created once the mandate becomes active).
    const billingRequest = await client.billingRequests.create({
      mandate_request: { currency: 'USD', scheme: 'ach' },
      metadata
    });

    // 2. Billing Request Flow: the hosted page where the partner authorises their bank.
    const flow = await client.billingRequestFlows.create({
      redirect_uri: successUrl || 'https://alumicraft-stripe.netlify.app?billing=success',
      exit_uri: cancelUrl || 'https://alumicraft-stripe.netlify.app?billing=cancelled',
      links: { billing_request: billingRequest.id }
    });

    return { statusCode: 200, headers, body: JSON.stringify({ url: flow.authorisation_url, billingRequestId: billingRequest.id }) };

  } catch (err) {
    console.error('GoCardless billing request error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
