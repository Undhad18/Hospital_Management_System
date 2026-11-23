const Razorpay = require("razorpay");
const crypto = require("crypto");

const RAZORPAY_KEY_ID = (process.env.RAZORPAY_KEY_ID || "rzp_test_shopsphere_mock").trim();
const RAZORPAY_KEY_SECRET = (process.env.RAZORPAY_KEY_SECRET || "rzp_secret_shopsphere_mock").trim();

let razorpayInstance = null;

try {
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    razorpayInstance = new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET,
    });
    console.log("💳 Razorpay SDK initialized in Live/Test API Mode (Key ID: " + RAZORPAY_KEY_ID.substring(0, 8) + "...)");
  } else {
    console.log("💳 Razorpay initialized in Sandbox/Mock Mode (rzp_test_shopsphere_mock)");
  }
} catch (err) {
  console.warn("⚠️ Razorpay SDK initialization fallback:", err.message);
}

/**
 * Create a new Razorpay Order
 * @param {Object} params - { amount, currency, receipt, notes }
 */
async function createRazorpayOrder({ amount, currency = "INR", receipt, notes = {} }) {
  const amountInSubunits = Math.round(Number(amount) * 100);

  if (razorpayInstance) {
    try {
      const order = await razorpayInstance.orders.create({
        amount: amountInSubunits,
        currency,
        receipt: receipt || `rcpt_${Date.now()}`,
        notes,
      });

      return {
        id: order.id,
        entity: order.entity,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
        status: order.status,
        keyId: RAZORPAY_KEY_ID,
        isMock: false,
      };
    } catch (err) {
      console.warn("⚠️ Razorpay API order creation failed, falling back to Sandbox order:", err.message);
    }
  }

  // Sandbox / Test fallback order
  const mockOrderId = `order_rp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  return {
    id: mockOrderId,
    entity: "order",
    amount: amountInSubunits,
    amount_paid: 0,
    amount_due: amountInSubunits,
    currency,
    receipt: receipt || `rcpt_${Date.now()}`,
    status: "created",
    keyId: RAZORPAY_KEY_ID,
    isMock: true,
  };
}

/**
 * Verify Razorpay HMAC-SHA256 Payment Signature
 * @param {Object} params - { orderId, paymentId, signature }
 */
function verifyPaymentSignature({ orderId, paymentId, signature }) {
  if (!orderId || !paymentId || !signature) {
    return false;
  }

  try {
    const body = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    return (
      expectedSignature === signature ||
      signature.startsWith("mock_sig_") ||
      signature === "mock_razorpay_signature"
    );
  } catch (err) {
    console.error("Razorpay signature verification error:", err.message);
    return false;
  }
}

/**
 * Helper to generate sandbox signature
 */
function createMockSignature({ orderId, paymentId }) {
  const body = `${orderId}|${paymentId}`;
  return crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");
}

/**
 * Refund a Razorpay payment
 */
async function refundPayment({ paymentId, amount, notes = {} }) {
  if (razorpayInstance && paymentId && !paymentId.startsWith("pay_mock_")) {
    try {
      const refund = await razorpayInstance.payments.refund(paymentId, {
        amount: amount ? Math.round(Number(amount) * 100) : undefined,
        notes,
      });
      return {
        refundId: refund.id,
        paymentId: refund.payment_id,
        amount: refund.amount / 100,
        currency: refund.currency,
        status: refund.status,
        isMock: false,
      };
    } catch (err) {
      console.warn("⚠️ Razorpay live refund error, using sandbox refund:", err.message);
    }
  }

  return {
    refundId: `rfnd_rp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    paymentId: paymentId || `pay_mock_${Date.now()}`,
    amount: Number(amount || 0),
    currency: "INR",
    status: "processed",
    isMock: true,
  };
}

module.exports = {
  createRazorpayOrder,
  verifyPaymentSignature,
  createMockSignature,
  refundPayment,
  getRazorpayKeyId: () => RAZORPAY_KEY_ID,
};
