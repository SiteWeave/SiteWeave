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
npx skills add pbakaus/impeccable -y
npx skills add https://github.com/Leonxlnx/taste-skill --skill design-taste-frontend -y
npx skills add https://github.com/emilkowalski/skill --skill emil-design-eng -y
npx skills add https://github.com/onurdrmzzz/react-native-mobile-skill -y
npx skills add https://sosumi.ai -y
```

They install under `.agents/skills/` (not committed).
