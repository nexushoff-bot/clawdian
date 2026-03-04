import { PluginSettingTab, Setting, App, Notice } from 'obsidian';
import ClawdianPlugin from './main';
import { PairingModal } from './components/PairingModal';

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
    'main': '#6366f1',      // Indigo
    'nexus': '#6366f1',     // Indigo
    'aristotowl': '#f97316', // Orange
    'prism': '#ec4899',     // Pink
    'orion': '#10b981',     // Emerald
};

export interface ClawdianSettings {
    gatewayUrl: string;
    gatewayToken: string;
    defaultAgent: string;
    lastAgent: string;
    agentColors: Record<string, string>;
    includeVaultContext: boolean;
    contextSize: 'small' | 'medium' | 'large' | 'max';
    autoConnect: boolean;
}

export const DEFAULT_SETTINGS: ClawdianSettings = {
    gatewayUrl: 'ws://127.0.0.1:18789',
    gatewayToken: '',
    defaultAgent: '',
    lastAgent: '',
    agentColors: {},
    includeVaultContext: true,
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

    constructor(app: App, plugin: ClawdianPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Clawdian Settings' });

        // Connection Status
        const statusSection = containerEl.createEl('div', { cls: 'clawdian-settings-section' });
        statusSection.createEl('h3', { text: 'Connection Status' });
        
        const deviceId = this.plugin.client.getDeviceId();
        const isConnected = this.plugin.client.isConnected();

        new Setting(statusSection)
            .setName('Status')
            .setDesc(isConnected ? '✅ Connected' : '❌ Disconnected');
        
        // Add connect/disconnect button
        new Setting(statusSection)
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
                            this.plugin.tryConnect().then(() => {
                                this.display();
                            });
                        });
                }
            });

        if (deviceId) {
            new Setting(statusSection)
                .setName('Device ID')
                .setDesc(deviceId)
                .addButton(btn => {
                    btn.setButtonText('Copy')
                        .onClick(() => {
                            navigator.clipboard.writeText(deviceId);
                            new Notice('Device ID copied!');
                        });
                });
        }

        // Gateway URL
        containerEl.createEl('h3', { text: 'Gateway Configuration' });
        
        new Setting(containerEl)
            .setName('Gateway URL')
            .setDesc('OpenClaw Gateway WebSocket URL')
            .addText(text => text
                .setPlaceholder('ws://127.0.0.1:18789')
                .setValue(this.plugin.settings.gatewayUrl)
                .onChange(async (value) => {
                    this.plugin.settings.gatewayUrl = value;
                    await this.plugin.saveSettings();
                }));

        // Manual Token (fallback)
        new Setting(containerEl)
            .setName('Gateway Token (optional)')
            .setDesc('Only needed if auto-pairing fails')
            .addText(text => {
                text.inputEl.type = 'password';
                text.setPlaceholder('device-token')
                    .setValue(this.plugin.settings.gatewayToken)
                    .onChange(async (value) => {
                        this.plugin.settings.gatewayToken = value;
                        await this.plugin.saveSettings();
                    });
            })
            .addButton(btn => {
                btn.setButtonText('Test Connection')
                    .onClick(() => {
                        this.plugin.client.updateConfig(
                            this.plugin.settings.gatewayUrl,
                            this.plugin.settings.gatewayToken
                        );
                        this.plugin.client.connect().then(() => {
                            new Notice('✅ Connected successfully!');
                            this.display(); // Refresh
                        }).catch((err: Error) => {
                            new Notice('❌ Connection failed: ' + err.message);
                            // Show pairing modal if needed
                            if (deviceId) {
                                new PairingModal(this.app, deviceId, () => {
                                    this.plugin.client.clearDeviceToken();
                                    this.plugin.client.connect();
                                }).open();
                            }
                        });
                    });
            });

        // Agent Selection
        containerEl.createEl('h3', { text: 'Preferences' });

        const agentSetting = new Setting(containerEl)
            .setName('Default Agent')
            .setDesc('Which agent to chat with by default');
        
        // Get agents from client or use defaults
        const agents = this.plugin.client.getAgents();
        const dropdown = agentSetting.addDropdown(dropdown => {
            if (agents.length > 0) {
                // Use fetched agents
                agents.forEach(agent => {
                    dropdown.addOption(agent.id, agent.name || agent.id);
                });

            } else {
                // No agents available
                dropdown.addOption('', 'No agents available');
            }
            // Use lastAgent if available, otherwise defaultAgent
            dropdown.setValue(this.plugin.settings.lastAgent || this.plugin.settings.defaultAgent);
            dropdown.onChange(async (value) => {
                this.plugin.settings.defaultAgent = value;
                this.plugin.settings.lastAgent = value;
                await this.plugin.saveSettings();
            });
            return dropdown;
        });

        // Agent Colors Section
        containerEl.createEl('h3', { text: 'Agent Colors' });
        containerEl.createEl('p', { 
            text: 'Customize the color for each agent. Colors are used in the chat interface.',
            cls: 'clawdian-settings-desc'
        });

        if (agents.length > 0) {
            agents.forEach(agent => {
                const currentColor = this.plugin.settings.agentColors[agent.id] || 
                                    DEFAULT_AGENT_COLORS[agent.id] || 
                                    AGENT_COLORS[0];
                
                new Setting(containerEl)
                    .setName(agent.name || agent.id)
                    .setDesc(`Color for ${agent.name || agent.id}`)
                    .addColorPicker(picker => {
                        picker.setValue(currentColor);
                        picker.onChange(async (value) => {
                            this.plugin.settings.agentColors[agent.id] = value;
                            await this.plugin.saveSettings();
                        });
                    });
            });
        } else {
            containerEl.createEl('p', { 
                text: 'Connect to see available agents',
                cls: 'clawdian-settings-hint'
            });
        }

        new Setting(containerEl)
            .setName('Include vault context')
            .setDesc('Send current file and vault info with messages')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeVaultContext)
                .onChange(async (value) => {
                    this.plugin.settings.includeVaultContext = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Context size')
            .setDesc('Maximum characters from file to include as context')
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
            .setName('Auto-connect on startup')
            .setDesc('Automatically connect to Gateway when Obsidian starts')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoConnect)
                .onChange(async (value) => {
                    this.plugin.settings.autoConnect = value;
                    await this.plugin.saveSettings();
                }));

        // Reset
        containerEl.createEl('h3', { text: 'Advanced' });
        
        new Setting(containerEl)
            .setName('Reset Device Identity')
            .setDesc('Clear stored device identity and token')
            .addButton(btn => {
                btn.setButtonText('Reset')
                    .setWarning()
                    .onClick(() => {
                        this.plugin.client['deviceManager'].clearIdentity();
                        new Notice('Device identity cleared. Restart plugin to re-pair.');
                        this.display();
                    });
            });
    }
}
