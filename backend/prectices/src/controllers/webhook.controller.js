const handlePaymentWebhook = async (req, res, next) => {
  try {
    const event = req.body;

    console.log("Webhook received:");
    console.log(event);

    if (event.event === "payment.succeeded") {
      console.log(
        `Payment ${event.paymentId} succeeded`
      );

      // Update payment
      // Update order
      // Update order status
    }

    return res.status(200).json({
      success: true,
      message: "Webhook received"
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  handlePaymentWebhook
};