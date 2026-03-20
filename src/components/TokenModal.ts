import { Modal, App, Setting, Notice } from 'obsidian';

export class TokenModal extends Modal {
    private gatewayUrl: string;
    private token = '';
    private gatewayInput!: HTMLInputElement;
    private tokenInput!: HTMLInputElement;
    private onConnect: (gateway: string, token: string) => void;

    constructor(
        app: App,
        gatewayUrl: string,
        onConnect: (gateway: string, token: string) => void
    ) {
        super(app);
        this.gatewayUrl = gatewayUrl;
        this.onConnect = onConnect;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('clawdian-token-modal');

        new Setting(contentEl).setName('Connect to OpenClaw').setHeading();

        // Instructions
        const instructions = contentEl.createEl('div', { cls: 'clawdian-instructions' });
        instructions.createEl('p', { text: 'To get your gateway token:' });
        
        const ol = instructions.createEl('ol');
        const step1 = ol.createEl('li');
        step1.createEl('span', { text: 'Open a terminal and run: ' });
        step1.createEl('code', { text: 'openclaw dashboard' });
        
        ol.createEl('li', { text: 'Click on "overview" in the dashboard' });
        ol.createEl('li', { text: 'Copy the gateway token' });

        // Gateway URL input
        new Setting(contentEl)
            .setName('Gateway URL')
            .setDesc('Your OpenClaw gateway websocket URL')
            .addText(text => {
                this.gatewayInput = text.inputEl;
                text.setPlaceholder('wss://your-gateway-url');
                text.setValue(this.gatewayUrl);
            });

        // Token input
        new Setting(contentEl)
            .setName('Gateway token')
            .setDesc('Paste the token from your dashboard')
            .addText(text => {
                this.tokenInput = text.inputEl;
                text.setPlaceholder('your-gateway-token');
                text.inputEl.type = 'password';
                this.tokenInput.addEventListener('input', () => {
                    this.token = this.tokenInput.value;
                });
            });

        // Security note
        const securityNote = contentEl.createEl('div', { cls: 'clawdian-security-note' });
        securityNote.createEl('small', { 
            text: '🔒 Your token is stored securely using Obsidian\'s Secret Storage API.' 
        });

        // Buttons
        new Setting(contentEl)
            .addButton(btn => {
                btn.setButtonText('Connect')
                    .setCta()
                    .onClick(() => {
                        const gateway = this.gatewayInput.value.trim();
                        const token = this.tokenInput.value.trim();

                        if (!gateway) {
                            new Notice('Please enter the gateway URL');
                            return;
                        }
                        if (!token) {
                            new Notice('Please enter the gateway token');
                            return;
                        }

                        this.close();
                        this.onConnect(gateway, token);
                    });
            })
            .addButton(btn => {
                btn.setButtonText('Cancel')
                    .onClick(() => this.close());
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}