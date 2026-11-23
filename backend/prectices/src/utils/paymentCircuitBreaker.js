const CircuitBreaker = require("opossum");
const paymentClient =
  require("../services/payment.service");

const createPayment = async (data) => {
  const response =
    await paymentClient.post(
      "/payments",
      data
    );

  return response.data;
};

const paymentBreaker =
  new CircuitBreaker(
    createPayment,
    {
      timeout: 5000,

      errorThresholdPercentage: 50,

      resetTimeout: 10000
    }
  );

paymentBreaker.on(
  "open",
  () => {
    console.log(
      "Payment circuit opened"
    );
  }
);

paymentBreaker.on(
  "halfOpen",
  () => {
    console.log(
      "Payment circuit half-open"
    );
  }
);

paymentBreaker.on(
  "close",
  () => {
    console.log(
      "Payment circuit closed"
    );
  }
);

module.exports = {
  paymentBreaker
};