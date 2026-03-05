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
    selectedColorAgentId: string = ''; // Track selected agent for color picker
    colorPickerEl: any = null; // Reference to color picker for updates

    constructor(app: App, plugin: ClawdianPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Clawdian Settings' });

        const deviceId = this.plugin.client.getDeviceId();
        const isConnected = this.plugin.client.isConnected();
        const agents = this.plugin.client.getAgents();
        
        // Initialize selected agent for color picker
        if (!this.selectedColorAgentId && agents.length > 0) {
            this.selectedColorAgentId = agents[0].id;
        }

        // ==================== Connection Status ====================
        containerEl.createEl('h3', { text: 'Connection Status' });
        
        // Status + Connect/Disconnect button in same row
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
                        .onClick(() => {
                            this.plugin.tryConnect().then(() => {
                                this.display();
                            });
                        });
                }
            });

        // Auto-connect on startup (moved to Connection Status section)
        new Setting(containerEl)
            .setName('Auto-connect on startup')
            .setDesc('Automatically connect to Gateway when Obsidian starts')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoConnect)
                .onChange(async (value) => {
                    this.plugin.settings.autoConnect = value;
                    await this.plugin.saveSettings();
                }));

        if (deviceId) {
            new Setting(containerEl)
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

        // ==================== Gateway Configuration ====================
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
                            this.display();
                        }).catch((err: Error) => {
                            new Notice('❌ Connection failed: ' + err.message);
                            if (deviceId) {
                                new PairingModal(this.app, deviceId, () => {
                                    this.plugin.client.clearDeviceToken();
                                    this.plugin.client.connect();
                                }).open();
                            }
                        });
                    });
            });

        // ==================== Preferences ====================
        containerEl.createEl('h3', { text: 'Preferences' });

        // Default Agent
        const agentSetting = new Setting(containerEl)
            .setName('Default Agent')
            .setDesc('Which agent to chat with by default');
        
        agentSetting.addDropdown(dropdown => {
            if (agents.length > 0) {
                agents.forEach(agent => {
                    dropdown.addOption(agent.id, agent.name || agent.id);
                });
            } else {
                dropdown.addOption('', 'No agents available');
            }
            dropdown.setValue(this.plugin.settings.lastAgent || this.plugin.settings.defaultAgent);
            dropdown.onChange(async (value) => {
                this.plugin.settings.defaultAgent = value;
                this.plugin.settings.lastAgent = value;
                await this.plugin.saveSettings();
                this.display(); // Refresh to update color picker
            });
            return dropdown;
        });

        // Agent Color - single row with dropdown + color picker
        if (agents.length > 0) {
            const colorSetting = new Setting(containerEl)
                .setName('Agent Color')
                .setDesc('Select an agent and customize its chat color');
            
            colorSetting.addDropdown(dropdown => {
                agents.forEach(agent => {
                    dropdown.addOption(agent.id, agent.name || agent.id);
                });
                dropdown.setValue(this.selectedColorAgentId);
                dropdown.onChange(async (value) => {
                    this.selectedColorAgentId = value;
                    // Update color picker directly without refresh
                    const color = this.plugin.settings.agentColors[value] || 
                                 DEFAULT_AGENT_COLORS[value] || 
                                 AGENT_COLORS[0];
                    if (this.colorPickerEl) {
                        this.colorPickerEl.setValue(color);
                    }
                });
                return dropdown;
            });

            // Color picker for selected agent
            colorSetting.addColorPicker(picker => {
                const color = this.plugin.settings.agentColors[this.selectedColorAgentId] || 
                             DEFAULT_AGENT_COLORS[this.selectedColorAgentId] || 
                             AGENT_COLORS[0];
                picker.setValue(color);
                this.colorPickerEl = picker; // Store reference for updates
                picker.onChange(async (value) => {
                    this.plugin.settings.agentColors[this.selectedColorAgentId] = value;
                    await this.plugin.saveSettings();
                });
            });
        }

        // ==================== Context ====================
        containerEl.createEl('h3', { text: 'Context' });

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

        // ==================== Advanced ====================
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
