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
        contentEl.addClass('clawchat-token-modal');

        new Setting(contentEl).setName('connect to openclaw').setHeading();

        // Instructions
        const instructions = contentEl.createEl('div', { cls: 'clawchat-instructions' });
        instructions.createEl('p', { text: 'to get your gateway token:' });
        
        const ol = instructions.createEl('ol');
        const step1 = ol.createEl('li');
        step1.createEl('span', { text: 'open a terminal and run: ' });
        step1.createEl('code', { text: 'openclaw dashboard' });
        
        ol.createEl('li', { text: 'click on "overview" in the dashboard' });
        ol.createEl('li', { text: 'copy the gateway token' });

        // Gateway URL input
        new Setting(contentEl)
            .setName('gateway url')
            .setDesc('your openclaw gateway websocket url')
            .addText(text => {
                this.gatewayInput = text.inputEl;
                text.setPlaceholder('wss://your-gateway-url');
                text.setValue(this.gatewayUrl);
            });

        // Token input
        new Setting(contentEl)
            .setName('gateway token')
            .setDesc('paste the token from your dashboard')
            .addText(text => {
                this.tokenInput = text.inputEl;
                text.setPlaceholder('your-gateway-token');
                text.inputEl.type = 'password';
                this.tokenInput.addEventListener('input', () => {
                    this.token = this.tokenInput.value;
                });
            });

        // Security note
        const securityNote = contentEl.createEl('div', { cls: 'clawchat-security-note' });
        securityNote.createEl('small', { 
            text: '🔒 your token is stored securely using obsidian\'s Secret Storage API.' 
        });

        // Buttons
        new Setting(contentEl)
            .addButton(btn => {
                btn.setButtonText('connect')
                    .setCta()
                    .onClick(() => {
                        const gateway = this.gatewayInput.value.trim();
                        const token = this.tokenInput.value.trim();

                        if (!gateway) {
                            new Notice('Please enter the gateway URL');
                            return;
                        }
                        if (!token) {
                            new Notice('please enter the gateway token');
                            return;
                        }

                        this.close();
                        this.onConnect(gateway, token);
                    });
            })
            .addButton(btn => {
                btn.setButtonText('cancel')
                    .onClick(() => this.close());
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}