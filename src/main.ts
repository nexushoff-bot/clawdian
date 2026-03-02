import { Plugin, WorkspaceLeaf, Notice } from 'obsidian';
import { ClawdianSettingTab, ClawdianSettings, DEFAULT_SETTINGS } from './settings';
import { ChatView, VIEW_TYPE_CHAT } from './components/ChatView';
import { OpenClawClient } from './utils/OpenClawClient';
import { PairingModal } from './components/PairingModal';

export default class ClawdianPlugin extends Plugin {
    settings: ClawdianSettings;
    client: OpenClawClient;

    async onload() {
        await this.loadSettings();
        
        // Initialize OpenClaw client
        this.client = new OpenClawClient(
            this.settings.gatewayUrl,
            this.settings.gatewayToken
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

        console.log('[Clawdian] Plugin loaded. Click 🦞 to connect.');
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
            // Show pairing modal if auth failed
            if (msg.includes('pairing') || msg.includes('token') || msg.includes('auth')) {
                const deviceId = this.client.getDeviceId();
                if (deviceId) {
                    new PairingModal(this.app, deviceId, () => {
                        // Retry after user acknowledges
                    }).open();
                }
            }
        };
    }

    async tryConnect(): Promise<boolean> {
        try {
            await this.client.connect();
            return true;
        } catch (err: any) {
            console.error('[Clawdian] Connection failed:', err.message);
            new Notice('❌ Connection failed: ' + err.message);
            
            // Show pairing modal
            const deviceId = this.client.getDeviceId();
            if (deviceId) {
                new PairingModal(this.app, deviceId, () => {
                    // User closed modal
                }).open();
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
            const connected = await this.tryConnect();
            if (!connected) {
                // View will show "Connect" button
            }
        }
    }
}
