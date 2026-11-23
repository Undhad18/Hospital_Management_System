const sleep = (ms) =>
  new Promise((resolve) =>
    setTimeout(resolve, ms)
  );

const retry = async (
  operation,
  options = {}
) => {
  const {
    retries = 3,
    delay = 1000
  } = options;

  let lastError;

  for (
    let attempt = 0;
    attempt <= retries;
    attempt++
  ) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === retries) {
        throw lastError;
      }

      await sleep(
        delay * Math.pow(2, attempt)
      );
    }
  }

  throw lastError;
};

module.exports = {
  retry
};