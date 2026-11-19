/**
 * The `/den` slash command as registered with Discord (scripts/discord-commands.ts). One
 * command with subcommands, so the bot takes a single name in every server. Option names
 * here are what `parseCommand` reads.
 */
import { BOT_LOCALES, MAX_PICK_HEROES, MAX_QUESTION_CHARS, OPTION } from "./bot";

const LANGUAGE_CHOICES = BOT_LOCALES.map((value) => ({
  name: { en: "English", fil: "Filipino", ceb: "Cebuano" }[value],
  value,
}));

const share = {
  type: OPTION.BOOLEAN,
  name: "share",
  description: "Post the answer for the channel to see (default: only you)",
};

const hero = (prefix: "enemy" | "ally", n: number) => ({
  type: OPTION.STRING,
  name: `${prefix}${n}`,
  description: prefix === "enemy" ? `Enemy pick ${n}` : `Ally pick ${n}`,
  autocomplete: true,
  max_length: 40,
});

export const DEN_COMMANDS = [
  {
    name: "den",
    description: "Dota Den: your games, your server's week, and Plus AI help",
    // Servers and DMs with the bot.
    contexts: [0, 1],
    options: [
      { type: OPTION.SUB_COMMAND, name: "me", description: "Your last week, form and heroes" },
      {
        type: OPTION.SUB_COMMAND,
        name: "leaderboard",
        description: "This server's ranked wins this week (linked members)",
      },
      {
        type: OPTION.SUB_COMMAND,
        name: "lang",
        description: "The bot's language for you (same as your Dota Den setting)",
        options: [
          {
            type: OPTION.STRING,
            name: "language",
            description: "English, Filipino or Cebuano",
            choices: LANGUAGE_CHOICES,
          },
        ],
      },
      {
        type: OPTION.SUB_COMMAND,
        name: "coach",
        description: "Plus: the AI coach's review of your latest match",
        options: [
          {
            type: OPTION.STRING,
            name: "match",
            description: "A match id (default: your latest match)",
            max_length: 20,
          },
          share,
        ],
      },
      {
        type: OPTION.SUB_COMMAND,
        name: "ask",
        description: "Plus: ask Dota Den about your games (same daily questions as the site)",
        options: [
          {
            type: OPTION.STRING,
            name: "question",
            description: "Your question",
            required: true,
            max_length: MAX_QUESTION_CHARS,
          },
          share,
        ],
      },
      {
        type: OPTION.SUB_COMMAND,
        name: "pick",
        description: "Plus: what to pick from your heroes against this draft",
        options: [
          ...Array.from({ length: MAX_PICK_HEROES }, (_, i) => hero("enemy", i + 1)),
          ...Array.from({ length: MAX_PICK_HEROES - 1 }, (_, i) => hero("ally", i + 1)),
          {
            type: OPTION.INTEGER,
            name: "position",
            description: "Your position",
            choices: [1, 2, 3, 4, 5].map((n) => ({ name: `Position ${n}`, value: n })),
          },
          share,
        ],
      },
      {
        type: OPTION.SUB_COMMAND,
        name: "recap",
        description: "Be in (or leave) this server's Monday recap",
        options: [{ type: OPTION.BOOLEAN, name: "on", description: "In the recap?" }],
      },
      {
        type: OPTION.SUB_COMMAND,
        name: "nudges",
        description: "Stop-loss and tilt reminders on Discord",
        options: [
          {
            type: OPTION.STRING,
            name: "where",
            description: "Where they go",
            choices: [
              { name: "Off", value: "off" },
              { name: "Direct message", value: "dm" },
              { name: "This server's bot channel", value: "server" },
            ],
          },
        ],
      },
      {
        type: OPTION.SUB_COMMAND,
        name: "setup",
        description: "Server admins: the bot channel, Monday recap and nudges",
        options: [
          {
            type: OPTION.CHANNEL,
            name: "channel",
            description: "Where the bot posts (default: this channel)",
            // Text and announcement channels.
            channel_types: [0, 5],
          },
          { type: OPTION.BOOLEAN, name: "recap", description: "Post the Monday recap (Plus)" },
          { type: OPTION.BOOLEAN, name: "nudges", description: "Take members' nudges here" },
          {
            type: OPTION.STRING,
            name: "language",
            description: "The server's language (members' own settings come first)",
            choices: LANGUAGE_CHOICES,
          },
        ],
      },
      { type: OPTION.SUB_COMMAND, name: "help", description: "What the bot does, how to link" },
    ],
  },
] as const;
