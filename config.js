require("dotenv").load();

module.exports = {
  clientId: process.env.slackClientId,
  clientSecret: process.env.slackClientSecret,
  scopes: ["bot"]
};
