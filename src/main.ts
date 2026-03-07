import { Plugin, WorkspaceLeaf, Notice } from 'obsidian';
import { ClawdianSettingTab, ClawdianSettings, DEFAULT_SETTINGS } from './settings';
import { ChatView, VIEW_TYPE_CHAT } from './components/ChatView';
import { OpenClawClient } from './utils/OpenClawClient';
import { TokenModal } from './components/TokenModal';

export default class ClawdianPlugin extends Plugin {
    settings: ClawdianSettings;
    client: OpenClawClient;
    private tokenKey = 'clawdian-gateway-token';

    async onload() {
        await this.loadSettings();
        
        // Load token from secret storage
        const token = await this.loadToken();
        
        // Initialize OpenClaw client
        this.client = new OpenClawClient(
            this.settings.gatewayUrl,
            token || ''
        );

        // Setup callbacks
        this.setupClientCallbacks();

        // Register chat view
        this.registerView(
            VIEW_TYPE_CHAT,
            (leaf) => new ChatView(leaf, this.client, this)
        );

        // Add ribbon icon
        this.addRibbonIcon('message-square', 'Open Clawdian', () => {
            this.activateView();
        });

        // Add command
        this.addCommand({
            id: 'open-clawdian',
            name: 'Open Clawdian chat',
            hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'c' }],
            callback: () => this.activateView()
        });

        // Add settings tab
        this.addSettingTab(new ClawdianSettingTab(this.app, this));

        // Auto-connect if enabled and we have a token
        if (this.settings.autoConnect && token) {
            console.log('[Clawdian] Auto-connect enabled, attempting connection...');
            this.tryConnect().catch((err: Error) => {
                console.log('[Clawdian] Auto-connect failed:', err.message);
            });
        }

        console.log('[Clawdian] Plugin loaded. Click 🦞 to open chat.');
    }

    /**
     * Load token from Obsidian's Secret Storage API
     */
    async loadToken(): Promise<string | null> {
        try {
            // Try Obsidian's secret storage first (if available)
            if ((this.app.vault as any).adapter?.read) {
                const secretPath = `.obsidian/plugins/${this.manifest.id}/.secrets/token`;
                try {
                    const data = await (this.app.vault as any).adapter.read(secretPath);
                    return data.trim() || null;
                } catch {
                    return null;
                }
            }
            // Fallback to localStorage
            return localStorage.getItem(this.tokenKey);
        } catch (e) {
            console.log('[Clawdian] No stored token found');
            return null;
        }
    }

    /**
     * Save token to Obsidian's Secret Storage API
     */
    async saveToken(token: string): Promise<void> {
        try {
            // Try Obsidian's secret storage first
            if ((this.app.vault as any).adapter?.write) {
                const secretPath = `.obsidian/plugins/${this.manifest.id}/.secrets/token`;
                await (this.app.vault as any).adapter.write(secretPath, token);
            } else {
                // Fallback to localStorage
                localStorage.setItem(this.tokenKey, token);
            }
            console.log('[Clawdian] Token saved securely');
        } catch (e) {
            // Fallback to localStorage
            localStorage.setItem(this.tokenKey, token);
            console.log('[Clawdian] Token saved to localStorage');
        }
    }

    /**
     * Clear stored token
     */
    async clearToken(): Promise<void> {
        try {
            if ((this.app.vault as any).adapter?.remove) {
                const secretPath = `.obsidian/plugins/${this.manifest.id}/.secrets/token`;
                await (this.app.vault as any).adapter.remove(secretPath);
            }
            localStorage.removeItem(this.tokenKey);
            console.log('[Clawdian] Token cleared');
        } catch {
            localStorage.removeItem(this.tokenKey);
        }
    }

    setupClientCallbacks() {
        this.client.onConnect = () => {
            console.log('[Clawdian] Connected to Gateway');
            new Notice('🦞 Connected to OpenClaw!');
        };

        this.client.onDisconnect = () => {
            console.log('[Clawdian] Disconnected from Gateway');
        };

        this.client.onError = (err) => {
            console.error('[Clawdian] Client error:', err);
        };

        this.client.onAuthError = (msg) => {
            console.error('[Clawdian] Auth error:', msg);
            // Show token modal on auth error
            this.showTokenModal();
        };
    }

    showTokenModal() {
        const modal = new TokenModal(
            this.app,
            this.settings.gatewayUrl,
            async (gateway: string, token: string) => {
                // Update settings with gateway
                this.settings.gatewayUrl = gateway;
                await this.saveSettings();
                
                // Save token securely
                await this.saveToken(token);
                
                // Update client and connect
                this.client.updateConfig(gateway, token);
                
                try {
                    await this.client.connect();
                } catch (err: any) {
                    new Notice('❌ Connection failed: ' + err.message);
                }
            }
        );
        modal.open();
    }

    async tryConnect(): Promise<boolean> {
        // Check if we have a token
        const token = await this.loadToken();
        
        if (!token) {
            // Show token modal
            this.showTokenModal();
            return false;
        }

        try {
            await this.client.connect();
            return true;
        } catch (err: any) {
            console.error('[Clawdian] Connection failed:', err.message);
            
            // If auth error, show token modal
            if (err.message.includes('auth') || err.message.includes('token') || err.message.includes('unauthorized')) {
                this.showTokenModal();
            } else {
                new Notice('❌ Connection failed: ' + err.message);
            }
            return false;
        }
    }

    onunload() {
        this.client?.disconnect();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async activateView() {
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_CHAT);

        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            leaf = workspace.getRightLeaf(false);
            if (!leaf) return;
            await leaf.setViewState({ type: VIEW_TYPE_CHAT, active: true });
        }

        workspace.revealLeaf(leaf);

        // Connect when opening if not already connected
        if (!this.client.isConnected()) {
            await this.tryConnect();
        }
    }
}