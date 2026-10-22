# ADR 0012: Groups

- Status: Accepted
- Date: 2026-10-15

## Context

Friends who queue together want one page for their stack (issue #26): a named group, an
invite link, their record as a party, best lineups, who plays what and a weekly board. Two
rules shape it: party membership must never be invented (missing party data is unknown, never
solo or together), and a player's own data stays theirs.

## Decision

A new `groups` feature (ADR 0009 layout), collection `groups`, members embedded.

- **Membership.** The creator owns the group. Anyone with a Dota Den account who opens the
  invite link while signed in can join. Up to 10 members per group; a player can be in up to 5
  groups (owned or joined). Members can leave; the owner can rename, reset the link, remove
  members and delete the group. Joining is atomic (no member at index 9, not already in).
- **Invite link.** `/groups/join/<token>`: 24 random characters from a 62-letter alphabet
  (`crypto.randomInt`, about 143 bits), unique index. Resetting replaces it, so the old link
  stops working. The join page sends no referrer and is not indexed. Members see the link so
  they can pass it on; only the owner resets it.
- **Access.** `/groups/[id]` and every API call check membership first and answer 404 to
  anyone else, so a group's existence isn't revealed. The page checks before streaming, so the
  status really is 404.
- **Party data source.** Our synced match facts don't keep party ids, so they can't say who
  was in whose party. The group page reuses the Together feature's cache of classified shared
  matches (`together_matches`) and its party rule (same party id, party size ≥ 2 for both).
  Each visit checks at most 2 member pairs, the never-checked and then the stalest (older than
  6 hours), side by side, with 6 match details each: the same 12-detail budget as one Together
  page visit. A pair is marked fresh once all its shared matches are classified, so big
  histories fill in over a few visits; the page says how many pairs are still unchecked. Members linked by
  confirmed party pairs in one match form one party (they share a party id); separate parties
  in a match stay separate. A match where members shared a team without party data is counted
  as unknown and shown apart, never as together and never as solo.
- **Who plays what and the weekly board** come from members' imported matches: most played
  heroes in the last 30 days, ranked wins and losses over the last 7 days. No MMR, real or
  estimated (the leaderboards' ±25 estimate is left out on purpose).
- **Privacy.** Joining is the consent to share, with that group's members only: Steam name and
  avatar, records from confirmed party games, recent heroes and ranked wins and losses, all
  derived from public match data. Never logged MMR, notes, tags, goals or sessions. The join
  page says this before the Join button. Profile visibility ("private" by default) controls
  public listing and stays as it is; groups don't list anyone publicly.
- **Your data.** "Download your data" includes your groups: name, your role, when you joined
  and the member count (not other members' accounts or the invite token). Deleting your account
  removes you from every group. A group you own passes to its longest-standing member; one with
  nobody else in it is deleted. The same hand-over applies when an owner leaves.

## Consequences

- No new upstream data model: party detection stays in one place (Together), and its cache is
  shared between pair pages and group pages.
- A new group's numbers take a few visits to fill in for members with long shared histories.
- Member pairs are only checked from the group page, so the numbers are as fresh as the last
  visit by any member.
