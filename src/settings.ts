import { PluginSettingTab, Setting, App, Notice } from 'obsidian';
import ClawdianPlugin from './main';
import { PairingModal } from './components/PairingModal';

export interface ClawdianSettings {
    gatewayUrl: string;
    gatewayToken: string;
    defaultAgent: string;
    includeVaultContext: boolean;
}

export const DEFAULT_SETTINGS: ClawdianSettings = {
    gatewayUrl: 'ws://127.0.0.1:18789',
    gatewayToken: '',
    defaultAgent: 'nexus',
    includeVaultContext: true
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
                // Fallback defaults
                dropdown.addOption('nexus', 'Nexus');
                dropdown.addOption('prism', 'Prism');
                dropdown.addOption('orion', 'Orion');
                dropdown.addOption('aristotowl', 'Aristotowl');
            }
            dropdown.setValue(this.plugin.settings.defaultAgent);
            dropdown.onChange(async (value) => {
                this.plugin.settings.defaultAgent = value;
                await this.plugin.saveSettings();
            });
            return dropdown;
        });

        new Setting(containerEl)
            .setName('Include vault context')
            .setDesc('Send current file and vault info with messages')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeVaultContext)
                .onChange(async (value) => {
                    this.plugin.settings.includeVaultContext = value;
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
