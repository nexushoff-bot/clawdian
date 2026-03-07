import { PluginSettingTab, Setting, App, Notice } from 'obsidian';
import ClawdianPlugin from './main';

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

export interface ClawdianSettings {
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

export const DEFAULT_SETTINGS: ClawdianSettings = {
    gatewayUrl: 'ws://127.0.0.1:18789',
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
    'small': { label: 'Small (500 chars)', chars: 500 },
    'medium': { label: 'Medium (1500 chars)', chars: 1500 },
    'large': { label: 'Large (3000 chars)', chars: 3000 },
    'max': { label: 'Max (entire file)', chars: Infinity }
};

export class ClawdianSettingTab extends PluginSettingTab {
    plugin: ClawdianPlugin;
    selectedColorAgentId: string = '';
    colorPickerEl: any = null;

    constructor(app: App, plugin: ClawdianPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Clawdian Settings' });

        const isConnected = this.plugin.client.isConnected();
        const agents = this.plugin.client.getAgents();
        
        if (!this.selectedColorAgentId && agents.length > 0) {
            this.selectedColorAgentId = agents[0].id;
        }

        // Connection Status
        containerEl.createEl('h3', { text: 'Connection' });
        
        new Setting(containerEl)
            .setName('Status')
            .setDesc(isConnected ? '✅ Connected' : '❌ Disconnected')
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
                        .onClick(async () => {
                            await this.plugin.tryConnect();
                            this.display();
                        });
                }
            });

        new Setting(containerEl)
            .setName('Gateway URL')
            .setDesc('OpenClaw Gateway WebSocket URL')
            .addText(text => text
                .setPlaceholder('wss://your-gateway-url')
                .setValue(this.plugin.settings.gatewayUrl)
                .onChange(async (value) => {
                    this.plugin.settings.gatewayUrl = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Auto-connect on startup')
            .setDesc('Automatically connect when Obsidian starts')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoConnect)
                .onChange(async (value) => {
                    this.plugin.settings.autoConnect = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Reset Token')
            .setDesc('Clear stored gateway token (you\'ll need to re-enter it)')
            .addButton(btn => {
                btn.setButtonText('Clear Token')
                    .setWarning()
                    .onClick(async () => {
                        await this.plugin.clearToken();
                        new Notice('Token cleared. Reconnect to enter a new token.');
                    });
            });

        // Preferences
        containerEl.createEl('h3', { text: 'Preferences' });

        const agentSetting = new Setting(containerEl)
            .setName('Default Agent')
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
            dropdown.onChange(async (value) => {
                this.plugin.settings.defaultAgent = value;
                this.plugin.settings.lastAgent = value;
                await this.plugin.saveSettings();
                this.display();
            });
        });

        // Agent Color
        if (agents.length > 0) {
            const colorSetting = new Setting(containerEl)
                .setName('Agent Color')
                .setDesc('Customize chat color for selected agent');
            
            colorSetting.addDropdown(dropdown => {
                agents.forEach(agent => {
                    dropdown.addOption(agent.id, agent.name || agent.id);
                });
                dropdown.setValue(this.selectedColorAgentId);
                dropdown.onChange(async (value) => {
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
                picker.onChange(async (value) => {
                    this.plugin.settings.agentColors[this.selectedColorAgentId] = value;
                    await this.plugin.saveSettings();
                });
            });
        }

        // Context
        containerEl.createEl('h3', { text: 'Context' });

        new Setting(containerEl)
            .setName('Include vault context')
            .setDesc('Send current file as context with messages')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeVaultContext)
                .onChange(async (value) => {
                    this.plugin.settings.includeVaultContext = value;
                    await this.plugin.saveSettings();
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
                dropdown.onChange(async (value: 'small' | 'medium' | 'large' | 'max') => {
                    this.plugin.settings.contextSize = value;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName('Include chat history')
            .setDesc('Include previous messages as context')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeChatHistory)
                .onChange(async (value) => {
                    this.plugin.settings.includeChatHistory = value;
                    await this.plugin.saveSettings();
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
                dropdown.onChange(async (value) => {
                    this.plugin.settings.chatHistoryDepth = parseInt(value);
                    await this.plugin.saveSettings();
                });
            });
    }
}