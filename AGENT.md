# Clawdian Agent Instructions

> **READ THIS FILE AND `CODE_REFERENCE.md` BEFORE ANY CODE CHANGES**

## Quick Reference

- **Project**: Clawdian - Obsidian plugin for AI chat with vault context
- **Location**: `/Users/nexus/.openclaw/agents/main/workspace/projects/clawdian`
- **Test Vault**: `/Users/nexus/.openclaw/agents/main/workspace/projects/clawdian-vault`
- **Plugin Path**: `.obsidian/plugins/clawdian/`
- **Repo**: `https://github.com/nexushoff-bot/clawdian`

## Before Starting Work

1. **READ `CODE_REFERENCE.md`** - Contains architecture, data structures, lifecycle events
2. **Check current state** - Run `git status` and `git log --oneline -5`
3. **Identify affected files** - Based on CODE_REFERENCE.md component map

## After Making Changes

1. **Update `CODE_REFERENCE.md`** if you:
   - Add new functions or classes
   - Change data structures or interfaces
   - Modify lifecycle events
   - Add new CSS classes
   - Change file structure

2. **Build and test**:
   ```bash
   npm run build
   cp main.js manifest.json styles.css ../clawdian-vault/.obsidian/plugins/clawdian/
   ```

3. **Commit with descriptive message**:
   ```bash
   git add -A
   git commit -m "feat: description of change"
   git push origin main
   ```

## Critical Learnings (Don't Repeat These Mistakes)

### File System Access
- **ALWAYS use `vault.adapter`** for file operations, NOT `vault.getAbstractFileByPath()`
- Obsidian's file index doesn't track externally-created files
- Use: `adapter.exists()`, `adapter.read()`, `adapter.write()`, `adapter.mkdir()`

### History Storage
- Location: `.clawdian/chat-history.json` in vault root
- Structure: `{ messages: ChatMessage[], lastUpdated: number }`
- Each message has: `id`, `timestamp`, `agentId`, `agentName`, `role`, `content`
- History is GLOBAL (group chat style), not per-agent

### WebSocket Connection
- Wait for `connect.challenge` event before sending `connect` request
- Client ID must be `'cli'` (restricted schema value)
- Only process `chat` events with `state === 'final'`
- Track `runId` to prevent duplicate messages

### Token Storage
- Use Obsidian's Secret Storage: `.obsidian/plugins/clawdian/.secrets/token`
- NEVER store tokens in settings or localStorage
- Access via `app.vault.adapter.read/write`

## Common Tasks

### Add a new slash command
1. Add to `showCommandPalette()` in ChatView.ts
2. Create `commandXxx()` method
3. Update CODE_REFERENCE.md

### Modify message rendering
1. Edit `renderMessage()` in ChatView.ts
2. Check dark/light mode compatibility in styles.css
3. Update CODE_REFERENCE.md

### Change history structure
1. Update `ChatMessage` interface in main.ts
2. Update `loadChatHistory()` and `saveChatHistory()`
3. Consider migration for existing history files
4. Update CODE_REFERENCE.md

## Testing Checklist

- [ ] Reload plugin in Obsidian
- [ ] Open dev console (`Cmd+Option+I`)
- [ ] Check for `[Clawdian]` prefixed logs
- [ ] Test connection flow
- [ ] Test message send/receive
- [ ] Test history persistence (close and reopen)
- [ ] Test slash commands
- [ ] Test file attachments

## Key Files

| File | Purpose |
|------|---------|
| `src/main.ts` | Plugin class, history storage, token management |
| `src/components/ChatView.ts` | UI, message rendering, slash commands |
| `src/utils/OpenClawClient.ts` | WebSocket connection, message handling |
| `src/settings.ts` | Settings tab, preferences |
| `styles.css` | All CSS classes |
| `CODE_REFERENCE.md` | Architecture documentation |
| `AGENT.md` | This file - workflow instructions |