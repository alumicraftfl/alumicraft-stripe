const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const admin = require('firebase-admin');

// Keeps Trade Partner subscription status in sync with Stripe.
// Listens for: checkout.session.completed, invoice.paid, invoice.payment_failed,
// customer.subscription.updated, customer.subscription.deleted.
// Writes status into Firestore doc: alumicraft_billing/{companyId} -> { [partnerId]: {...} }
//
// Required env vars on Netlify:
//   STRIPE_SECRET_KEY          (already used by create-checkout / create-subscription)
//   STRIPE_WEBHOOK_SECRET      (from Stripe Dashboard -> Developers -> Webhooks -> this endpoint)
//   FIREBASE_SERVICE_ACCOUNT_JSON  (full JSON of a Firebase service account key, as one line)
//   FIREBASE_PROJECT_ID        (same Firestore project used by the app's cloud sync)

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
  await ref.set({
    [partnerId]: { ...patch, updatedAt: Date.now() }
  }, { merge: true });
}

exports.handler = async (event) => {
  const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  try {
    const obj = stripeEvent.data.object;

    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        if (obj.mode === 'subscription') {
          const md = obj.metadata || {};
          await upsertBilling(md.company_id, md.partner_id, {
            status: 'active',
            subscriptionId: obj.subscription,
            customerId: obj.customer,
            plan: md.plan || ''
          });
        }
        break;
      }
      case 'invoice.paid': {
        const sub = obj.subscription ? await stripe.subscriptions.retrieve(obj.subscription) : null;
        const md = (sub && sub.metadata) || {};
        if (md.company_id) {
          await upsertBilling(md.company_id, md.partner_id, {
            status: 'active',
            subscriptionId: obj.subscription,
            customerId: obj.customer,
            lastPayment: { amount: obj.amount_paid / 100, date: obj.status_transitions?.paid_at ? obj.status_transitions.paid_at * 1000 : Date.now() }
          });
        }
        break;
      }
      case 'invoice.payment_failed': {
        const sub = obj.subscription ? await stripe.subscriptions.retrieve(obj.subscription) : null;
        const md = (sub && sub.metadata) || {};
        if (md.company_id) {
          await upsertBilling(md.company_id, md.partner_id, {
            status: 'past_due',
            subscriptionId: obj.subscription,
            customerId: obj.customer
          });
        }
        break;
      }
      case 'customer.subscription.updated': {
        const md = obj.metadata || {};
        if (md.company_id) {
          await upsertBilling(md.company_id, md.partner_id, {
            status: obj.status,
            subscriptionId: obj.id,
            customerId: obj.customer
          });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const md = obj.metadata || {};
        if (md.company_id) {
          await upsertBilling(md.company_id, md.partner_id, {
            status: 'canceled',
            subscriptionId: obj.id,
            customerId: obj.customer
          });
        }
        break;
      }
      default:
        break;
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (err) {
    console.error('Webhook handler error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
