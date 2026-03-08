import { Plugin, WorkspaceLeaf, Notice, TFile } from 'obsidian';
import { ClawdianSettingTab, ClawdianSettings, DEFAULT_SETTINGS } from './settings';
import { ChatView, VIEW_TYPE_CHAT } from './components/ChatView';
import { OpenClawClient } from './utils/OpenClawClient';
import { TokenModal } from './components/TokenModal';

// Global chat history interface
export interface ChatMessage {
    id: string;
    timestamp: number;
    agentId: string;
    agentName: string;
    role: 'user' | 'assistant';
    content: string;
}

export interface ChatHistory {
    messages: ChatMessage[];
    lastUpdated: number;
}

export default class ClawdianPlugin extends Plugin {
    settings: ClawdianSettings;
    client: OpenClawClient;
    private tokenKey = 'clawdian-gateway-token';
    chatHistory: ChatHistory = { messages: [], lastUpdated: 0 };
    readonly HISTORY_FILE = '.clawdian/chat-history.json';

    async onload() {
        console.log('[Clawdian] Plugin loading...');
        
        // Load settings first
        await this.loadSettings();
        
        // Load chat history EARLY (before view opens)
        await this.loadChatHistory();
        console.log('[Clawdian] History loaded:', this.chatHistory.messages.length, 'messages');
        
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
            
            this.tryConnect().then((connected) => {
                if (connected) {
                    new Notice('🦞 Connected');
                }
            }).catch((err: Error) => {
                console.log('[Clawdian] Auto-connect failed:', err.message);
            });
        }

        console.log('[Clawdian] Plugin loaded');
    }

    /**
     * Load chat history from file
     */
    async loadChatHistory(): Promise<void> {
        try {
            const file = this.app.vault.getAbstractFileByPath(this.HISTORY_FILE);
            if (file instanceof TFile) {
                const content = await this.app.vault.read(file);
                this.chatHistory = JSON.parse(content);
                console.log('[Clawdian] Chat history loaded:', this.chatHistory.messages.length, 'messages');
            }
        } catch (e) {
            console.log('[Clawdian] No history file, starting fresh');
            this.chatHistory = { messages: [], lastUpdated: Date.now() };
        }
    }

    /**
     * Save chat history to file
     */
    async saveChatHistory(): Promise<void> {
        try {
            // Ensure directory exists - safely handle "already exists" error
            const dir = '.clawdian';
            try {
                const dirFile = this.app.vault.getAbstractFileByPath(dir);
                if (!dirFile) {
                    await this.app.vault.createFolder(dir);
                }
            } catch (folderError: any) {
                // Ignore "Folder already exists" error
                if (!folderError.message?.includes('already exists')) {
                    throw folderError;
                }
            }

            this.chatHistory.lastUpdated = Date.now();
            const content = JSON.stringify(this.chatHistory, null, 2);
            
            const file = this.app.vault.getAbstractFileByPath(this.HISTORY_FILE);
            if (file instanceof TFile) {
                await this.app.vault.modify(file, content);
            } else {
                try {
                    await this.app.vault.create(this.HISTORY_FILE, content);
                } catch (fileError: any) {
                    // If file was created between check and create, modify instead
                    if (fileError.message?.includes('already exists')) {
                        const existingFile = this.app.vault.getAbstractFileByPath(this.HISTORY_FILE);
                        if (existingFile instanceof TFile) {
                            await this.app.vault.modify(existingFile, content);
                        }
                    } else {
                        throw fileError;
                    }
                }
            }
        } catch (e) {
            console.error('[Clawdian] Failed to save history:', e);
        }
    }

    /**
     * Add message to history
     */
    async addMessageToHistory(message: Omit<ChatMessage, 'id' | 'timestamp'>): Promise<void> {
        const newMessage: ChatMessage = {
            ...message,
            id: this.generateId(),
            timestamp: Date.now()
        };
        this.chatHistory.messages.push(newMessage);
        // Keep only last 500 messages to prevent file bloat
        if (this.chatHistory.messages.length > 500) {
            this.chatHistory.messages = this.chatHistory.messages.slice(-500);
        }
        await this.saveChatHistory();
    }

    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
    }

    /**
     * Load token from Obsidian's Secret Storage
     */
    async loadToken(): Promise<string | null> {
        try {
            const adapter = (this.app.vault as any).adapter;
            if (adapter?.read) {
                const secretPath = `.obsidian/plugins/${this.manifest.id}/.secrets/token`;
                try {
                    const data = await adapter.read(secretPath);
                    if (data && data.trim()) {
                        return data.trim();
                    }
                } catch {
                    return null;
                }
            }
            return null;
        } catch (e) {
            console.log('[Clawdian] No stored token found');
            return null;
        }
    }

    /**
     * Save token to Obsidian's Secret Storage
     */
    async saveToken(token: string): Promise<void> {
        const adapter = (this.app.vault as any).adapter;
        if (adapter?.write && adapter?.mkdir) {
            const secretDir = `.obsidian/plugins/${this.manifest.id}/.secrets`;
            const secretPath = `${secretDir}/token`;
            
            try {
                await adapter.mkdir(secretDir);
            } catch (e) {
                // Directory may already exist
            }
            
            await adapter.write(secretPath, token);
            console.log('[Clawdian] Token saved to Secret Storage');
        } else {
            console.error('[Clawdian] Secret Storage not available!');
            throw new Error('Secret Storage not available');
        }
    }

    /**
     * Clear stored token from Secret Storage
     */
    async clearToken(): Promise<void> {
        const adapter = (this.app.vault as any).adapter;
        if (adapter?.remove) {
            const secretPath = `.obsidian/plugins/${this.manifest.id}/.secrets/token`;
            try {
                await adapter.remove(secretPath);
            } catch (e) {
                // File may not exist
            }
        }
    }

    setupClientCallbacks() {
        this.client.onConnect = () => {
            console.log('[Clawdian] Connected to Gateway');
        };

        this.client.onDisconnect = () => {
            console.log('[Clawdian] Disconnected from Gateway');
        };

        this.client.onError = (err) => {
            console.error('[Clawdian] Client error:', err);
        };

        this.client.onAuthError = (msg) => {
            console.error('[Clawdian] Auth error:', msg);
            this.showTokenModal();
        };
    }

    showTokenModal() {
        const modal = new TokenModal(
            this.app,
            this.settings.gatewayUrl,
            async (gateway: string, token: string) => {
                this.settings.gatewayUrl = gateway;
                await this.saveSettings();
                
                await this.saveToken(token);
                
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
        const token = await this.loadToken();
        
        if (!token) {
            return false;
        }

        try {
            await this.client.connect();
            return true;
        } catch (err: any) {
            console.error('[Clawdian] Connection failed:', err.message);
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