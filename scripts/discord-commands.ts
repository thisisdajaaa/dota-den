/**
 * Registers the Dota Den bot's slash commands with Discord (run once, and again after the
 * commands change).
 *
 * Usage: npm run discord:commands   (needs DISCORD_CLIENT_ID and DISCORD_BOT_TOKEN)
 */
const appId = process.env.DISCORD_CLIENT_ID;
const token = process.env.DISCORD_BOT_TOKEN;
if (!appId || !token) {
  console.error("Set DISCORD_CLIENT_ID and DISCORD_BOT_TOKEN first.");
  process.exit(1);
}

const SUBCOMMAND = 1;
const commands = [
  {
    name: "den",
    description: "Dota Den: your games and your server's weekly ranking",
    // Servers and DMs with the bot.
    contexts: [0, 1],
    options: [
      {
        type: SUBCOMMAND,
        name: "me",
        description: "Your last week, recent form and most played heroes",
      },
      {
        type: SUBCOMMAND,
        name: "leaderboard",
        description: "This server's ranked wins this week (linked members)",
      },
      {
        type: SUBCOMMAND,
        name: "help",
        description: "What the bot does and how to link your account",
      },
    ],
  },
];

async function main() {
  const res = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
    method: "PUT",
    headers: { authorization: `Bot ${token}`, "content-type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!res.ok) {
    console.error(`Discord answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  console.log(`Registered: ${commands.map((c) => `/${c.name}`).join(", ")}`);
}

void main();
