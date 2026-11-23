const {
  clients
} = require("../controllers/realtime.controller");

const broadcast = (
  eventName,
  data
) => {

  const message =
    `event: ${eventName}\n` +
    `data: ${JSON.stringify(data)}\n\n`;

  for (const client of clients) {
    client.write(message);
  }
};

module.exports = {
  broadcast
};