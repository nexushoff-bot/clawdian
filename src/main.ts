import { Plugin, WorkspaceLeaf, Notice } from 'obsidian';
import { ClawdianSettingTab, ClawdianSettings, DEFAULT_SETTINGS } from './settings';
import { ChatView, VIEW_TYPE_CHAT } from './components/ChatView';
import { OpenClawClient } from './utils/OpenClawClient';
import { TokenModal } from './components/TokenModal';

// Vault adapter interface for Secret Storage
interface VaultAdapter {
    read: (path: string) => Promise<string>;
    write: (path: string, data: string) => Promise<void>;
    mkdir: (path: string) => Promise<void>;
    remove: (path: string) => Promise<void>;
}

// Global chat history interface
export interface ChatMessage {
    id: string;
    timestamp: number;
    agentId: string;
    agentName: string;
    agentEmoji?: string;
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
    
    // Debug logging - set DEBUG_CLAWDIAN=1 in .env for production debugging
    private debug = false;
    
    private debugLog(...args: unknown[]) {
        if (this.debug) {
            // console.log('[Clawdian]', ...args);
        }
    }
    
    private debugError(...args: unknown[]) {
        console.error('[Clawdian]', ...args);
    }

    async onload() {
        this.debugLog('Plugin loading...');
        
        // Load settings first
        await this.loadSettings();
        
        // Load chat history EARLY (before view opens)
        await this.loadChatHistory();
        
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
        this.addRibbonIcon('message-square', 'Open claw chat', () => {
            void this.activateView();
        });

        // Add command
        this.addCommand({
            id: 'open-clawdian',
            name: 'Open claw chat',
            callback: () => { void this.activateView(); }
        });

        // Add settings tab
        this.addSettingTab(new ClawdianSettingTab(this.app, this));

        // Auto-connect if enabled and we have a token
        if (this.settings.autoConnect && token) {
            this.debugLog('Auto-connect enabled, attempting connection...');
            
            void void this.tryConnect().then((connected: boolean) => {
                // Notice shown by ChatView.showConnected() to avoid duplicate
                if (connected) {
                    this.debugLog('Auto-connect successful');
                }
            }).catch((err: Error) => {
                this.debugLog('Auto-connect failed:', err.message);
            });
        }

        this.debugLog('Plugin loaded');
    }

    /**
     * Load chat history from file
     */
    async loadChatHistory(): Promise<void> {
        try {
            // Use adapter for direct file system access (bypasses Obsidian's file index)
            const adapter = this.app.vault.adapter;
            
            // Check if file exists
            const exists = await adapter.exists(this.HISTORY_FILE);
            
            if (exists) {
                const content = await adapter.read(this.HISTORY_FILE);
                const parsed = JSON.parse(content);
                this.chatHistory = parsed;
            } else {
                this.chatHistory = { messages: [], lastUpdated: Date.now() };
            }
        } catch (e: unknown) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            this.debugError('Error loading history:', errorMsg);
            this.chatHistory = { messages: [], lastUpdated: Date.now() };
        }
    }

    /**
     * Save chat history to file
     */
    async saveChatHistory(): Promise<void> {
        try {
            // Use adapter for direct file system access
            const adapter = this.app.vault.adapter;
            
            // Ensure directory exists
            const dir = '.clawdian';
            
            try {
                const dirExists = await adapter.exists(dir);
                if (!dirExists) {
                    await adapter.mkdir(dir);
                }
            } catch (folderError: unknown) {
                // Ignore "already exists" errors
                const folderErrorMsg = folderError instanceof Error ? folderError.message : String(folderError);
                if (!folderErrorMsg.includes('already exists')) {
                    throw folderError;
                }
            }

            this.chatHistory.lastUpdated = Date.now();
            const content = JSON.stringify(this.chatHistory, null, 2);
            
            // Write file directly
            await adapter.write(this.HISTORY_FILE, content);
        } catch (e: unknown) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            this.debugError('Failed to save history:', errorMsg);
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
            const adapter = (this.app.vault as { adapter?: VaultAdapter }).adapter;
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
            // console.log('[Clawdian] No stored token found');
            return null;
        }
    }

    /**
     * Save token to Obsidian's Secret Storage
     */
    async saveToken(token: string): Promise<void> {
        const adapter = (this.app.vault as { adapter?: VaultAdapter }).adapter;
        if (adapter?.write && adapter?.mkdir) {
            const secretDir = `.obsidian/plugins/${this.manifest.id}/.secrets`;
            const secretPath = `${secretDir}/token`;
            
            try {
                await adapter.mkdir(secretDir);
            } catch (e) {
                // Directory may already exist
            }
            
            await adapter.write(secretPath, token);
            // console.log('[Clawdian] Token saved to Secret Storage');
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
            // console.log('[Clawdian] Connected to Gateway');
        };

        this.client.onDisconnect = () => {
            // console.log('[Clawdian] Disconnected from Gateway');
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
                } catch (err: unknown) {
                    const errorMsg = err instanceof Error ? err.message : String(err);
                    new Notice('❌ Connection failed: ' + errorMsg);
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
        } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error('[Clawdian] Connection failed:', errorMsg);
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
            await void this.tryConnect();
        }
    }
}