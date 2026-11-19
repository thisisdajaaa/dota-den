# Discord setup (owner)

The Discord features stay off until these are set. Nothing here is needed for local
development or tests (the E2E fixture server plays Discord). Design: ADR 0016.

## 1. Create the application

1. Go to <https://discord.com/developers/applications> → **New Application** → name it
   "Dota Den" → accept the terms.
2. **General Information**: copy **Application ID** → `DISCORD_CLIENT_ID`, and **Public Key** →
   `DISCORD_PUBLIC_KEY` (64 hex characters).
3. **Interactions Endpoint URL** (same page): `https://www.dota-den.com/api/v1/discord/interactions`.
   Set the Vercel variables and redeploy **first**: Discord sends a signed test request when you
   save, and refuses the URL unless the deployment answers it. Use the `www` host (the apex
   redirects, and Discord doesn't follow redirects).
4. **OAuth2** → **Reset Secret** → copy it → `DISCORD_CLIENT_SECRET`. Under **Redirects** add
   `https://www.dota-den.com/api/v1/discord/callback` (exactly; for a preview/staging deployment
   add its `APP_URL` + `/api/v1/discord/callback` too).
5. **Bot** → **Reset Token** → copy it → `DISCORD_BOT_TOKEN`. Leave **Public Bot** on if any
   server admin may add it (off: only you can). No privileged intents are needed (leave Presence,
   Server Members and Message Content **off**).
6. **Installation**: Install Link "Discord Provided Link" or none; Guild Install scopes
   `applications.commands` and `bot`, permissions **View Channels**, **Send Messages**,
   **Embed Links**.

## 2. Environment variables (Vercel → Project → Settings → Environment Variables, Production)

| Variable                | From                   | Used for                                                    |
| ----------------------- | ---------------------- | ----------------------------------------------------------- |
| `DISCORD_CLIENT_ID`     | General Information    | "Connect Discord", the invite link, registering commands    |
| `DISCORD_CLIENT_SECRET` | OAuth2 → Client Secret | "Connect Discord" (OAuth2 `identify`)                       |
| `DISCORD_PUBLIC_KEY`    | General Information    | Verifying slash commands (the bot is off without it)        |
| `DISCORD_BOT_TOKEN`     | Bot → Token            | Registering commands, the Monday recap, nudges (posts, DMs) |

Treat the secret and the token like passwords. Redeploy after setting them.

## 3. Register the slash commands

Locally, with the four variables in `.env.local` (or exported in the shell):

```sh
npm run discord:commands -- --guild <your test server id>   # instant, one server
npm run discord:commands                                    # global (can take up to an hour)
npm run discord:commands -- --dry-run                       # print the JSON only
```

Run it again whenever `src/modules/discord/domain/commands.ts` changes. (Right-click a server →
**Copy Server ID** needs Developer Mode: User Settings → Advanced.)

## 4. Schedule and indexes

- `npm run db:indexes` (new collections `discord_guilds`, `discord_bot_log`).
- `npm run jobs:schedules` (or the admin page's "Set up job schedules") adds
  `dota-den-discord-recap` (Mondays 01:00 UTC = 09:00 Manila).

## 5. Invite the bot to a server

The account page shows **Add the bot to your server** once the variables are set. It is:

```
https://discord.com/oauth2/authorize?client_id=<DISCORD_CLIENT_ID>&scope=bot+applications.commands&permissions=19456
```

(19456 = View Channel 1024 + Send Messages 2048 + Embed Links 16384.)

Then, in the server, someone with **Manage Server** runs
`/den setup channel:#dota recap:true nudges:true language:Filipino` (the recap needs their
Plus). Members link on the account page, then `/den recap on:true` to be in the recap and
`/den nudges where:dm` (or `where:server`) for reminders.

## Check it works

- Discord accepted the interactions URL (step 1.3).
- `/den help` answers in a server with the bot.
- Account page → **Connect Discord** → back with "Discord linked."
- `/den me` shows your card; `/den setup` posts "Dota Den will post here" in the channel.
