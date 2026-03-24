import { PluginSettingTab, Setting, App, Notice, ColorComponent } from 'obsidian';
import ClawChatPlugin from './main';

// Default color palette for agents
export const AGENT_COLORS = [
    '#6366f1', // Indigo (Nexus)
    '#f97316', // Orange (Aristotowl)
    '#10b981', // Emerald
    '#ec4899', // Pink
    '#8b5cf6', // Purple
    '#06b6d4', // Cyan
    '#f43f5e', // Rose
    '#84cc16', // Lime
    '#f59e0b', // Amber
    '#14b8a6', // Teal
];

export const DEFAULT_AGENT_COLORS: Record<string, string> = {
    'main': '#6366f1',
    'nexus': '#6366f1',
    'aristotowl': '#f97316',
    'prism': '#ec4899',
    'orion': '#10b981',
};

export interface ClawChatSettings {
    gatewayUrl: string;
    defaultAgent: string;
    lastAgent: string;
    agentColors: Record<string, string>;
    includeVaultContext: boolean;
    includeChatHistory: boolean;
    chatHistoryDepth: number;
    contextSize: 'small' | 'medium' | 'large' | 'max';
    autoConnect: boolean;
}

export const DEFAULT_SETTINGS: ClawChatSettings = {
    gatewayUrl: 'wss://your-machine.tailXXXX.ts.net',
    defaultAgent: '',
    lastAgent: '',
    agentColors: {},
    includeVaultContext: true,
    includeChatHistory: true,
    chatHistoryDepth: 5,
    contextSize: 'large',
    autoConnect: false
};

export const CONTEXT_SIZES: Record<string, { label: string; chars: number }> = {
    'small': { label: 'small (500 chars)', chars: 500 },
    'medium': { label: 'medium (1500 chars)', chars: 1500 },
    'large': { label: 'large (3000 chars)', chars: 3000 },
    'max': { label: 'max (entire file)', chars: Infinity }
};

export class ClawChatSettingTab extends PluginSettingTab {
    plugin: ClawChatPlugin;
    selectedColorAgentId = '';
    colorPickerEl: ColorComponent | null = null;

    constructor(app: App, plugin: ClawChatPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        
        // Connection status header
        const isConnected = this.plugin.client.isConnected();
        const agents = this.plugin.client.getAgents();
        
        if (!this.selectedColorAgentId && agents.length > 0) {
            this.selectedColorAgentId = agents[0].id;
        }

        // Connection Status
        new Setting(containerEl)
            .setName('Connection')
            .setHeading();

        new Setting(containerEl)
            .setName('Status')
            .setDesc(isConnected ? '✅ connected' : '❌ disconnected')
            .addButton(btn => {
                if (isConnected) {
                    btn.setButtonText('Disconnect')
                        .onClick(() => {
                            this.plugin.client.disconnect();
                            new Notice('Disconnected');
                            this.display();
                        });
                } else {
                    btn.setButtonText('Connect')
                        .setCta()
                        .onClick(() => {
                            void this.plugin.tryConnect().then(() => {
                                this.display();
                            });
                        });
                }
            });

        new Setting(containerEl)
            .setName('Gateway URL')
            .setDesc('Openclaw gateway websocket URL')
            .addText(text => text
                // eslint-disable-next-line obsidianmd/ui/sentence-case
                .setPlaceholder('wss://your-gateway-url')
                .setValue(this.plugin.settings.gatewayUrl)
                .onChange((value) => {
                    this.plugin.settings.gatewayUrl = value;
                    void this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Auto-connect on startup')
            .setDesc('Automatically connect when Obsidian starts')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoConnect)
                .onChange((value) => {
                    this.plugin.settings.autoConnect = value;
                    void this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Reset token')
            .setDesc('Clear stored gateway token (you\'ll need to re-enter it)')
            .addButton(btn => {
                btn.setButtonText('Clear token')
                    .setWarning()
                    .onClick(() => {
                        void this.plugin.clearToken();
                        new Notice('Token cleared. Reconnect to enter a new token.');
                    });
            });

        // Preferences
        new Setting(containerEl)
            .setName('Preferences')
            .setHeading();

        const agentSetting = new Setting(containerEl)
            .setName('Default agent')
            .setDesc('Which agent to chat with by default');
        
        agentSetting.addDropdown(dropdown => {
            if (agents.length > 0) {
                agents.forEach(agent => {
                    dropdown.addOption(agent.id, agent.name || agent.id);
                });
            } else {
                dropdown.addOption('', 'Connect to see agents');
            }
            dropdown.setValue(this.plugin.settings.lastAgent || this.plugin.settings.defaultAgent);
            dropdown.onChange((value) => {
                this.plugin.settings.defaultAgent = value;
                this.plugin.settings.lastAgent = value;
                void this.plugin.saveSettings();
                this.display();
            });
        });

        // Agent Color
        if (agents.length > 0) {
            const colorSetting = new Setting(containerEl)
                .setName('Agent color')
                .setDesc('Customize chat color for selected agent');
            
            colorSetting.addDropdown(dropdown => {
                agents.forEach(agent => {
                    dropdown.addOption(agent.id, agent.name || agent.id);
                });
                dropdown.setValue(this.selectedColorAgentId);
                dropdown.onChange((value) => {
                    this.selectedColorAgentId = value;
                    const color = this.plugin.settings.agentColors[value] || 
                                 DEFAULT_AGENT_COLORS[value] || 
                                 AGENT_COLORS[0];
                    if (this.colorPickerEl) {
                        this.colorPickerEl.setValue(color);
                    }
                });
            });

            colorSetting.addColorPicker(picker => {
                const color = this.plugin.settings.agentColors[this.selectedColorAgentId] || 
                             DEFAULT_AGENT_COLORS[this.selectedColorAgentId] || 
                             AGENT_COLORS[0];
                picker.setValue(color);
                this.colorPickerEl = picker;
                picker.onChange((value) => {
                    this.plugin.settings.agentColors[this.selectedColorAgentId] = value;
                    void this.plugin.saveSettings();
                });
            });
        }

        // Context
        new Setting(containerEl)
            .setName('Context')
            .setHeading();

        new Setting(containerEl)
            .setName('Include vault context')
            .setDesc('Send current file as context with messages')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeVaultContext)
                .onChange((value) => {
                    this.plugin.settings.includeVaultContext = value;
                    void this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Context size')
            .setDesc('Maximum characters from file to include')
            .addDropdown(dropdown => {
                dropdown.addOption('small', 'Small (500 chars)');
                dropdown.addOption('medium', 'Medium (1500 chars)');
                dropdown.addOption('large', 'Large (3000 chars)');
                dropdown.addOption('max', 'Max (entire file)');
                dropdown.setValue(this.plugin.settings.contextSize);
                dropdown.onChange((value: 'small' | 'medium' | 'large' | 'max') => {
                    this.plugin.settings.contextSize = value;
                    void this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName('Include chat history')
            .setDesc('Include previous messages as context')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeChatHistory)
                .onChange((value) => {
                    this.plugin.settings.includeChatHistory = value;
                    void this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Chat history depth')
            .setDesc('Number of previous messages to include')
            .addDropdown(dropdown => {
                dropdown.addOption('1', 'Last 1 message');
                dropdown.addOption('3', 'Last 3 messages');
                dropdown.addOption('5', 'Last 5 messages');
                dropdown.addOption('10', 'Last 10 messages');
                dropdown.setValue(this.plugin.settings.chatHistoryDepth.toString());
                dropdown.onChange((value) => {
                    this.plugin.settings.chatHistoryDepth = parseInt(value);
                    void this.plugin.saveSettings();
                });
            });
    }
}