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
        console.log('[Clawdian] loadChatHistory() called');
        console.log('[Clawdian] Looking for history file at:', this.HISTORY_FILE);
        
        try {
            // Use adapter for direct file system access (bypasses Obsidian's file index)
            const adapter = this.app.vault.adapter;
            
            // Check if file exists
            const exists = await adapter.exists(this.HISTORY_FILE);
            console.log('[Clawdian] File exists:', exists);
            
            if (exists) {
                const content = await adapter.read(this.HISTORY_FILE);
                console.log('[Clawdian] Raw file content length:', content.length);
                console.log('[Clawdian] Raw content preview:', content.substring(0, 200));
                
                const parsed = JSON.parse(content);
                console.log('[Clawdian] Parsed JSON keys:', Object.keys(parsed));
                
                this.chatHistory = parsed;
                console.log('[Clawdian] Chat history loaded:', this.chatHistory.messages.length, 'messages');
                console.log('[Clawdian] Last updated:', new Date(this.chatHistory.lastUpdated).toISOString());
                
                // Log first few messages
                if (this.chatHistory.messages.length > 0) {
                    console.log('[Clawdian] First message:', this.chatHistory.messages[0]);
                }
            } else {
                console.log('[Clawdian] File does not exist - starting fresh');
                this.chatHistory = { messages: [], lastUpdated: Date.now() };
            }
        } catch (e: any) {
            console.error('[Clawdian] Error loading history:', e.message || e);
            console.log('[Clawdian] Starting with empty history');
            this.chatHistory = { messages: [], lastUpdated: Date.now() };
        }
    }

    /**
     * Save chat history to file
     */
    async saveChatHistory(): Promise<void> {
        console.log('[Clawdian] saveChatHistory() called');
        console.log('[Clawdian] Messages to save:', this.chatHistory.messages.length);
        
        // Log first message as sample
        if (this.chatHistory.messages.length > 0) {
            const sampleMsg = this.chatHistory.messages[this.chatHistory.messages.length - 1];
            console.log('[Clawdian] Latest message to save:', {
                id: sampleMsg.id,
                role: sampleMsg.role,
                content: sampleMsg.content.substring(0, 50) + '...',
                timestamp: new Date(sampleMsg.timestamp).toISOString()
            });
        }
        
        try {
            // Use adapter for direct file system access
            const adapter = this.app.vault.adapter;
            
            // Ensure directory exists
            const dir = '.clawdian';
            console.log('[Clawdian] Checking/creating directory:', dir);
            
            try {
                const dirExists = await adapter.exists(dir);
                if (!dirExists) {
                    await adapter.mkdir(dir);
                    console.log('[Clawdian] Created directory');
                } else {
                    console.log('[Clawdian] Directory already exists');
                }
            } catch (folderError: any) {
                console.log('[Clawdian] Folder operation result:', folderError.message || 'success');
                // Ignore "already exists" errors
                if (!folderError.message?.includes('already exists')) {
                    throw folderError;
                }
            }

            this.chatHistory.lastUpdated = Date.now();
            const content = JSON.stringify(this.chatHistory, null, 2);
            console.log('[Clawdian] JSON content length:', content.length);
            
            // Write file directly
            await adapter.write(this.HISTORY_FILE, content);
            console.log('[Clawdian] File written successfully');
        } catch (e: any) {
            console.error('[Clawdian] Failed to save history:', e.message || e);
            console.error('[Clawdian] Stack:', e.stack);
        }
    }

    /**
     * Add message to history
     */
    async addMessageToHistory(message: Omit<ChatMessage, 'id' | 'timestamp'>): Promise<void> {
        console.log('[Clawdian] addMessageToHistory() called');
        console.log('[Clawdian] Message being added:', {
            agentId: message.agentId,
            agentName: message.agentName,
            role: message.role,
            contentPreview: message.content.substring(0, 100) + (message.content.length > 100 ? '...' : '')
        });
        
        const newMessage: ChatMessage = {
            ...message,
            id: this.generateId(),
            timestamp: Date.now()
        };
        
        console.log('[Clawdian] Generated message ID:', newMessage.id);
        
        this.chatHistory.messages.push(newMessage);
        console.log('[Clawdian] Messages count after push:', this.chatHistory.messages.length);
        
        // Keep only last 500 messages to prevent file bloat
        if (this.chatHistory.messages.length > 500) {
            this.chatHistory.messages = this.chatHistory.messages.slice(-500);
            console.log('[Clawdian] Trimmed to last 500 messages');
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