const botkit = require("botkit");
const fetch = require("node-fetch");
const pokemonGif = require("pokemon-gif");
const config = require("./config");

const MAX_COUNT = 808;
const SPRITE_URL =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

if (process.env.NODE_ENV !== "production") {
  require("dotenv").load();
}

if (
  !process.env.slackClientId ||
  !process.env.slackClientSecret ||
  !process.env.slackSigningSecret ||
  !process.env.port
) {
  console.log("Error: Specify token and port in environment");
  process.exit(1);
}

const controller = botkit
  .slackbot({
    debug: process.env.NODE_ENV === "development",
    clientSigningSecret: process.env.slackSigningSecret
  })
  .configureSlackApp(config);

controller.setupWebserver(process.env.port, function(err, webserver) {
  controller.createWebhookEndpoints(controller.webserver);

  controller.createOauthEndpoints(controller.webserver, function(err, _, res) {
    if (err) {
      res.status(500).send("ERROR: " + err);
    } else {
      res.send("Success!");
    }
  });
});

let _bots = {};

const trackBot = bot => {
  bot[bot.config.token] = bot;
};

controller.on("create_bot", function(bot, config) {
  if (_bots[bot.config.token]) {
    // already online! do nothing.
  } else {
    bot.startRTM(function(err) {
      if (!err) {
        trackBot(bot);
      }

      bot.startPrivateConversation({ user: config.createdBy }, function(
        err,
        convo
      ) {
        if (err) {
          console.log(err);
        } else {
          convo.say("I am a bot that has just joined your team");
          convo.say(
            "You must now /invite me to a channel so that I can be of use!"
          );
        }
      });
    });
  }
});

// Handle events related to the websocket connection to Slack
controller.on("rtm_open", function(bot) {
  console.log("** The RTM api just connected!");
});

controller.on("rtm_close", function(bot) {
  console.log("** The RTM api just closed");
  // you may want to attempt to re-open
});

controller.on("interactive_message_callback", (bot, message) => {
  if (message.callback_id === "encounter_pokemon") {
    const value = message.actions[0].value;
    const text = value === "good" ? `It's good!!` : `It's bad.`;
    bot.reply(message, "Hello world");
  } else {
    console.error("Could not find callback_id: " + message.callback_id);
  }
});

controller.hears("encounter", "direct_mention", async function(bot, message) {
  controller.storage.teams.save(
    {
      id: message.team,
      bot: {
        user_id: bot.identity.id,
        name: bot.identity.name
      }
    },
    (err, id) => {
      if (err) {
        throw new Error("ERROR: " + err);
      }
    }
  );
  let pokemon_obj = {};
  const targetId = Math.floor(Math.random() * Math.floor(MAX_COUNT));
  const data_list = await Promise.all([
    fetch(`https://pokeapi.co/api/v2/pokemon-species/${targetId}`),
    fetch(`https://pokeapi.co/api/v2/pokemon/${targetId}`)
  ]);

  for (let data of data_list) {
    let json = await data.json();
    if (json.hasOwnProperty("abilities")) {
      pokemon_obj = {
        abilities: json.abilities,
        ...pokemon_obj
      };
    } else {
      pokemon_obj = {
        ...json,
        ...pokemon_obj
      };
    }
  }

  let spriteUrl = "";
  try {
    spriteUrl = pokemonGif(pokemon_obj.name);
  } catch (e) {
    spriteUrl = `${SPRITE_URL}/${pokemon_obj.id}.png`;
  }

  const targetLang = pokemon_obj.names.filter(
    name => name.language.name === "ja"
  )[0];

  bot.reply(message, {
    attachments: [
      {
        title: `野生の${targetLang.name}が現れた！`,
        text: "どうする？",
        callback_id: "encounter_pokemon",
        attachment_type: "default",
        image_url: spriteUrl,
        actions: [
          {
            name: "encounter",
            text: "捕まえる",
            value: "catch",
            type: "button",
            style: "primary"
          },
          {
            name: "encounter",
            text: "捕まえない",
            value: "leave",
            type: "button",
            style: "danger"
          }
        ]
      }
    ]
  });
});
