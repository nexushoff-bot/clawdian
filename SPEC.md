# ClawChat Specification

## Overview
Connect Obsidian to OpenClaw agents with full context awareness.

## Core Features

### Phase 1: MVP (Week 1)
- [ ] Sidebar chat panel
- [ ] WebSocket connection to OpenClaw Gateway
- [ ] Send/receive messages
- [ ] Basic vault context (current file path)

### Phase 2: Context (Week 2)
- [ ] Include file content in context
- [ ] Vault search integration
- [ ] Agent selection (Nexus/Prism/Orion/Aristotowl)
- [ ] Settings panel for Gateway URL/token

### Phase 3: Polish (Week 3)
- [ ] Message history persistence
- [ ] Slash commands (/search, /create, /summarize)
- [ ] Inline suggestions like Copilot
- [ ] Mobile support

## Technical Requirements

- Obsidian API v1.4+
- TypeScript 5.0+
- WebSocket client for Gateway connection
- LocalStorage for settings

## API Surface

```typescript
interface ClawChatSettings {
  gatewayUrl: string;
  gatewayToken: string;
  defaultAgent: 'nexus' | 'prism' | 'orion' | 'aristotowl';
  includeVaultContext: boolean;
}

interface OpenClawMessage {
  sessionKey: string;
  content: string;
  context?: {
    currentFile?: string;
    vaultSearch?: string[];
  };
}
```

## Success Criteria
- [ ] Plugin installs via Obsidian Community Plugins
- [ ] Chat opens in sidebar (Cmd/Ctrl+Shift+C)
- [ ] Messages reach OpenClaw with vault context
- [ ] Responses display in chat panel
- [ ] Settings persist across restarts
