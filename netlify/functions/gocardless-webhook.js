const gocardless = require('gocardless-nodejs');
const { Environments, webhooks } = require('gocardless-nodejs');
const admin = require('firebase-admin');

// Keeps Trade Partner billing status in sync with GoCardless.
// Handles:
//   billing_requests: fulfilled  -> mandate authorised, creates the recurring Subscription
//   payments: confirmed / failed -> updates billing status + last payment
//   subscriptions: cancelled / finished -> marks partner billing as cancelled
//
// Writes status into Firestore doc: alumicraft_billing/{companyId} -> { [partnerId]: {...} }
// which the app's client-side syncBillingStatus() reads to update the Trade Partners page.
//
// Required env vars on Netlify:
//   GOCARDLESS_ACCESS_TOKEN
//   GOCARDLESS_ENV                    ('live' or 'sandbox')
//   GOCARDLESS_WEBHOOK_SECRET         (GoCardless dashboard -> Developers -> Webhook endpoints)
//   FIREBASE_SERVICE_ACCOUNT_JSON     (full JSON of a Firebase service account key, as one line)
//   FIREBASE_PROJECT_ID               (same Firestore project used by the app's cloud sync)

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON not configured.');
  const creds = JSON.parse(raw);
  return admin.initializeApp({
    credential: admin.credential.cert(creds),
    projectId: process.env.FIREBASE_PROJECT_ID || creds.project_id
  });
}

async function upsertBilling(companyId, partnerId, patch) {
  if (!companyId || !partnerId) return;
  initAdmin();
  const db = admin.firestore();
  const ref = db.collection('alumicraft_billing').doc(companyId);
  await ref.set({ [partnerId]: { ...patch, updatedAt: Date.now() } }, { merge: true });
}

function gcClient() {
  const env = (process.env.GOCARDLESS_ENV || 'sandbox') === 'live' ? Environments.Live : Environments.Sandbox;
  return gocardless(process.env.GOCARDLESS_ACCESS_TOKEN, env);
}

exports.handler = async (event) => {
  let events;
  try {
    events = webhooks.parse(
      event.body,
      process.env.GOCARDLESS_WEBHOOK_SECRET,
      event.headers['webhook-signature'] || event.headers['Webhook-Signature']
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: err.name === 'InvalidSignatureError' ? 498 : 400, body: `Webhook Error: ${err.message}` };
  }

  const gc = gcClient();

  try {
    for (const evt of events) {
      const resourceType = evt.resource_type; // 'billing_requests' | 'payments' | 'subscriptions' | 'mandates'
      const action = evt.action;
      const links = evt.links || {};

      // Mandate authorised -> create the recurring subscription.
      if (resourceType === 'billing_requests' && action === 'fulfilled') {
        const br = await gc.billingRequests.find(links.billing_request);
        const md = br.metadata || {};
        const mandateId = br.links && br.links.mandate;
        if (mandateId && md.partner_id) {
          const subscription = await gc.subscriptions.create({
            amount: Math.round(parseFloat(md.monthly_fee || '0') * 100),
            currency: 'USD',
            name: `AlumiCraft Trade Partner — ${md.plan || 'Partner'} Plan`,
            interval_unit: 'monthly',
            metadata: md,
            links: { mandate: mandateId }
          });
          await upsertBilling(md.company_id, md.partner_id, {
            status: 'active',
            subscriptionId: subscription.id,
            mandateId
          });
        }
      }

      // Payment collected / failed for an existing subscription.
      if (resourceType === 'payments' && (action === 'confirmed' || action === 'failed')) {
        const payment = await gc.payments.find(links.payment);
        let md = payment.metadata || {};
        if (!md.partner_id && payment.links && payment.links.subscription) {
          const sub = await gc.subscriptions.find(payment.links.subscription);
          md = sub.metadata || {};
        }
        if (md.partner_id) {
          if (action === 'confirmed') {
            await upsertBilling(md.company_id, md.partner_id, {
              status: 'active',
              lastPayment: { amount: payment.amount / 100, date: Date.now() }
            });
          } else {
            await upsertBilling(md.company_id, md.partner_id, { status: 'past_due' });
          }
        }
      }

      // Subscription ended.
      if (resourceType === 'subscriptions' && (action === 'cancelled' || action === 'finished')) {
        const sub = await gc.subscriptions.find(links.subscription);
        const md = sub.metadata || {};
        if (md.partner_id) {
          await upsertBilling(md.company_id, md.partner_id, { status: 'canceled' });
        }
      }
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (err) {
    console.error('Webhook handler error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
