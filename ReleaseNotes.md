# Release Notes

## Release 0.2.0 - 2026-03-02

- Dynamic agent list - agents are now fetched from OpenClaw Gateway
- Fallback to default agents (Nexus, Prism, Orion, Aristotowl) if fetch fails
- Agent list updates automatically when connecting to Gateway
- Settings dropdown now shows available agents dynamically

## Release 0.1.0 - 2026-03-02

- Initial release of ClawChat Obsidian plugin
- WebSocket connection to OpenClaw Gateway
- Device identity-based authentication with setup code support
- Chat interface with agent selection (Nexus, Prism, Orion, Aristotowl)
- Vault context awareness - sends current file with messages
- Settings panel with connection status and configuration
- Pairing modal for device authorization
- Setup code modal for easy connection via `/pair` command
- Support for local and remote (Tailscale) Gateway connections
- Dark/light theme support with Obsidian CSS variables
