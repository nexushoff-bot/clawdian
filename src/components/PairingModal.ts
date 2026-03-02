import { Modal, App, Setting, Notice } from 'obsidian';

export class PairingModal extends Modal {
    deviceId: string;
    onComplete: () => void;
    private checkInterval: number | null = null;

    constructor(app: App, deviceId: string, onComplete: () => void) {
        super(app);
        this.deviceId = deviceId;
        this.onComplete = onComplete;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Connect to OpenClaw' });

        contentEl.createEl('p', {
            text: 'Your device needs to be paired with the Gateway. Run this command in your terminal:'
        });

        // Command display
        const cmdEl = contentEl.createEl('div', { cls: 'clawdian-terminal-command' });
        cmdEl.createEl('code', { text: `openclaw pairing approve ${this.deviceId}` });

        // Device ID display
        contentEl.createEl('div', {
            cls: 'clawdian-pairing-code-label',
            text: `Device ID: ${this.deviceId}`
        });

        // Copy button
        new Setting(contentEl)
            .addButton(btn => {
                btn.setButtonText('Copy Command')
                    .setCta()
                    .onClick(() => {
                        navigator.clipboard.writeText(`openclaw pairing approve ${this.deviceId}`);
                        new Notice('Command copied!');
                    });
            });

        // Status
        const statusEl = contentEl.createEl('div', {
            cls: 'clawdian-pairing-status',
            text: 'Waiting for approval...'
        });

        // Alternative manual entry
        contentEl.createEl('h3', { text: 'Or enter token manually:' });
        let tokenInput: HTMLInputElement;
        new Setting(contentEl)
            .addText(text => {
                tokenInput = text.inputEl;
                text.setPlaceholder('device-token-here');
            });
        new Setting(contentEl)
            .addButton(btn => {
                btn.setButtonText('Use Token')
                    .onClick(() => {
                        const token = tokenInput.value.trim();
                        if (token) {
                            this.onComplete();
                            this.close();
                        }
                    });
            });

        // Cancel
        new Setting(contentEl)
            .addButton(btn => {
                btn.setButtonText('Cancel')
                    .onClick(() => this.close());
            });

        // Simulate checking for completion
        this.checkInterval = window.setInterval(() => {
            // In real implementation, this would check connection status
            // For now, user closes modal after running command
        }, 2000);
    }

    onClose() {
        if (this.checkInterval) {
            window.clearInterval(this.checkInterval);
        }
    }
}
