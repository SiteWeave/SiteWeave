# Cursor setup for SiteWeave (skills + MCP)

One-time steps in the Cursor app (cannot be set from the repo alone):

1. **Agent Skills** — Settings → Rules → enable **Agent Skills**.
2. **Impeccable slash commands** (`/polish`, `/audit`, etc.) — use **Cursor Nightly** (Settings → Beta) if those commands do not appear.
3. **GitHub MCP** — add a [Personal Access Token](https://github.com/settings/personal-access-tokens/new) to your global MCP config:
   - File: `%USERPROFILE%\.cursor\mcp.json`
   - Replace `YOUR_GITHUB_PAT` in the `github` server `Authorization` header (or set `GITHUB_PERSONAL_ACCESS_TOKEN` in your environment and use that value).
4. **Playwright** — after clone, run once from repo root: `npx playwright install`
5. **MCP status** — Settings → MCP: confirm **github** (global), **playwright** and **sosumi** (project) show connected. Restart Cursor after editing MCP JSON.

Project MCP: [`.cursor/mcp.json`](mcp.json).

Design skills are **gitignored**. Reinstall after clone from repo root:

```bash
npx skills experimental_install
```

Or install individually:

```bash
npx skills add pbakaus/impeccable -y
npx skills add https://github.com/Leonxlnx/taste-skill --skill design-taste-frontend -y
npx skills add https://github.com/emilkowalski/skill --skill emil-design-eng -y
npx skills add https://github.com/onurdrmzzz/react-native-mobile-skill -y
npx skills add jakubkrehel/make-interfaces-feel-better -y
npx skills add https://sosumi.ai -y
```

They install under `.agents/skills/` (not committed). Locked versions live in [`skills-lock.json`](../skills-lock.json) at the repo root.

## Discovering more skills

- **[Awesome Claude Skills](https://github.com/travisvn/awesome-claude-skills)** — curated list of community skills, tools, and resources (browse here; the repo itself is not installable).
- **[skills.sh](https://skills.sh/)** — search by keyword and see install counts.
- **CLI search** — from repo root: `npx skills find [query]` (e.g. `npx skills find playwright`).

To install a specific skill from a GitHub repo:

```bash
npx skills add owner/repo --skill skill-name -y
```

For a large community bundle (28 skills), see [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) — install all or cherry-pick with `--skill`:

```bash
npx skills add ComposioHQ/awesome-claude-skills --list    # preview
npx skills add ComposioHQ/awesome-claude-skills --skill mcp-builder webapp-testing -y
```
