const clients = new Set();

const subscribe = (req, res) => {

  res.setHeader(
    "Content-Type",
    "text/event-stream"
  );

  res.setHeader(
    "Cache-Control",
    "no-cache"
  );

  res.setHeader(
    "Connection",
    "keep-alive"
  );

  res.flushHeaders();

  clients.add(res);

  res.write(
    `event: connected\n` +
    `data: ${JSON.stringify({
      message: "Connected to ShopSphere"
    })}\n\n`
  );

  req.on("close", () => {
    clients.delete(res);
  });
};

module.exports = {
  subscribe,
  clients
};