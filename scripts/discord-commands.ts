/**
 * Registers the Dota Den bot's slash commands with Discord (run once, and again after the
 * commands change). Global commands can take a while to show up everywhere; a test server
 * (`--guild <id>` or DISCORD_TEST_GUILD_ID) gets them at once.
 *
 * Usage: npm run discord:commands                    (global)
 *        npm run discord:commands -- --guild <id>     (one server, for testing)
 *        npm run discord:commands -- --dry-run        (print the JSON only)
 * Needs DISCORD_CLIENT_ID and DISCORD_BOT_TOKEN (see docs/discord-setup.md).
 */
import { DEN_COMMANDS } from "@/modules/discord/domain/commands";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const guildArg = args.indexOf("--guild");
const guildId = guildArg >= 0 ? args[guildArg + 1] : process.env.DISCORD_TEST_GUILD_ID;

async function main() {
  if (dryRun) {
    console.log(JSON.stringify(DEN_COMMANDS, null, 2));
    return;
  }
  const appId = process.env.DISCORD_CLIENT_ID;
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!appId || !token) {
    console.error("Set DISCORD_CLIENT_ID and DISCORD_BOT_TOKEN first.");
    process.exit(1);
  }
  if (guildId !== undefined && !/^\d{15,25}$/.test(guildId)) {
    console.error("--guild needs a server id (right-click the server → Copy Server ID).");
    process.exit(1);
  }
  const path = guildId
    ? `/applications/${appId}/guilds/${guildId}/commands`
    : `/applications/${appId}/commands`;
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    method: "PUT",
    headers: { authorization: `Bot ${token}`, "content-type": "application/json" },
    body: JSON.stringify(DEN_COMMANDS),
  });
  if (!res.ok) {
    console.error(`Discord answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  const subs = DEN_COMMANDS[0].options.map((o) => o.name).join(", ");
  console.log(`Registered /den (${subs}) ${guildId ? `in server ${guildId}` : "globally"}.`);
}

void main();
