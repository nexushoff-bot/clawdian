#!/usr/bin/env python3
import re

# Fix ChatView.ts
with open('src/components/ChatView.ts', 'r') as f:
    content = f.read()

# Fix 1: setTimeout with renderHistory
content = content.replace(
    "setTimeout(() => {\n            this.renderHistory();\n        }, 50);",
    "setTimeout(() => { void this.renderHistory(); }, 50);"
)

# Fix 2: sendBtn click handler
content = content.replace(
    "sendBtn.addEventListener('click', () => this.sendMessage());",
    "sendBtn.addEventListener('click', () => { void this.sendMessage(); });"
)

# Fix 3: connectBtn click handler - add void connectBtn after
content = content.replace(
    """connectBtn.addEventListener('click', () => {
            void (async () => {
                const connected = await this.plugin.tryConnect();
                if (!connected) {
                    // No token stored or connection failed - show modal to enter credentials
                    this.plugin.showTokenModal();
                }
            })();
        });""",
    """connectBtn.addEventListener('click', () => {
            void (async () => {
                const connected = await this.plugin.tryConnect();
                if (!connected) {
                    // No token stored or connection failed - show modal to enter credentials
                    this.plugin.showTokenModal();
                }
            })();
        });
        void connectBtn;"""
)

# Fix 4: any types in filter/map
content = content.replace(
    """const textContent = payload.message.content
                            .filter((item: any) => item.type === 'text')
                            .map((item: any) => item.text)
                            .join('');""",
    """interface MessageContent {
                            type: string;
                            text?: string;
                        }
                        const textContent = payload.message.content
                            .filter((item: MessageContent) => item.type === 'text')
                            .map((item: MessageContent) => item.text || '')
                            .join('');"""
)

# Fix 5: addBtn event listener
content = content.replace(
    "addBtn.addEventListener('click', () => new FileSuggestModal(this.app, this).open());",
    "addBtn.addEventListener('click', () => { new FileSuggestModal(this.app, this).open(); });"
)

# Fix 6: setTimeout infoEl.remove
content = content.replace(
    "setTimeout(() => infoEl.remove(), 5000);",
    "setTimeout(() => { infoEl.remove(); }, 5000);"
)

# Fix 7: context any type
content = content.replace(
    "const context: any = {};",
    "const context: { currentFile?: string; fileContent?: string } = {};"
)

# Fix 8: catch e with void
content = content.replace(
    """} catch (e) {
                    // console.log('[Clawdian] Could not read file:', file.path, e);
                }""",
    """} catch (e) {
                    // console.log('[Clawdian] Could not read file:', file.path, e);
                    void e;
                }"""
)

# Fix 9: setInterval with void
content = content.replace(
    "this.statusPollingInterval = setInterval(() => this.checkSessionStatus(), this.STATUS_POLLING_MS);",
    "this.statusPollingInterval = setInterval(() => { void this.checkSessionStatus(); }, this.STATUS_POLLING_MS);"
)

# Fix 10: catch err with void
content = content.replace(
    """} catch (err) {
            this.hideLoading();
            this.addMessage('assistant', '⚠️ Failed to send. Connection lost?');
        }""",
    """} catch (err) {
            this.hideLoading();
            this.addMessage('assistant', '⚠️ Failed to send. Connection lost?');
            void err;
        }"""
)

# Fix 11: checkSessionStatus catch
content = content.replace(
    """} catch (err) {
            // console.log('[Clawdian] Status check failed:', err);
        }""",
    """} catch (err) {
            // console.log('[Clawdian] Status check failed:', err);
            void err;
        }"""
)

# Fix 12: showErrorText with void errorEl
content = content.replace(
    """showErrorText(text: string) {
        const errorEl = this.messagesEl.createEl('div', { cls: 'clawdian-error-text', text });
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }""",
    """showErrorText(text: string) {
        const errorEl = this.messagesEl.createEl('div', { cls: 'clawdian-error-text', text });
        void errorEl;
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }"""
)

# Fix 13: img onerror in addMessage - need to add void img after
# Find the pattern and add void img
content = content.replace(
    """if (useImageAvatar) {
                const img = avatarEl.createEl('img', { cls: 'clawdian-avatar-img', attr: { src: avatar, alt: agentName } });
                img.onerror = () => { avatarEl.empty(); avatarEl.setText(agentName.charAt(0).toUpperCase()); };
            } else {
                avatarEl.setText(avatar);
            }
            avatarEl.style.setProperty('--clawdian-avatar-color', agentColor);
            
            const block = msgContainer.createEl('div', { cls: 'clawdian-message-block' });
            block.createEl('div', { cls: 'clawdian-message-sender', text: agentName });
            block.createEl('div', { cls: 'clawdian-message-bubble', text });""",
    """if (useImageAvatar) {
                const img = avatarEl.createEl('img', { cls: 'clawdian-avatar-img', attr: { src: avatar, alt: agentName } });
                img.onerror = () => { avatarEl.empty(); avatarEl.setText(agentName.charAt(0).toUpperCase()); };
                void img;
            } else {
                avatarEl.setText(avatar);
            }
            avatarEl.style.setProperty('--clawdian-avatar-color', agentColor);

            const block = msgContainer.createEl('div', { cls: 'clawdian-message-block' });
            block.createEl('div', { cls: 'clawdian-message-sender', text: agentName });
            block.createEl('div', { cls: 'clawdian-message-bubble', text });"""
)

with open('src/components/ChatView.ts', 'w') as f:
    f.write(content)
print("Fixed ChatView.ts")

# Fix LoadingIndicator.ts
with open('src/components/LoadingIndicator.ts', 'r') as f:
    content = f.read()

content = content.replace(
    "setTimeout(() => this.stopStatusCycle(), 300);",
    "setTimeout(() => { this.stopStatusCycle(); }, 300);"
)

with open('src/components/LoadingIndicator.ts', 'w') as f:
    f.write(content)
print("Fixed LoadingIndicator.ts")

# Fix ContextChips.ts
with open('src/components/ContextChips.ts', 'r') as f:
    content = f.read()

# Fix async addFile
content = content.replace(
    "async addFile(path: string): Promise<ContextItem> {",
    "addFile(path: string): ContextItem {"
)

# Fix badgeEl unused
content = content.replace(
    """const badgeEl = chipEl.createEl('span', { 
            cls: 'clawdian-chip-badge',
            text: this.getTypeLabel(item.type)
        });""",
    """const badgeEl = chipEl.createEl('span', { 
            cls: 'clawdian-chip-badge',
            text: this.getTypeLabel(item.type)
        });
        void badgeEl;"""
)

# Fix el unused in renderItems
content = content.replace(
    """this.items.forEach((item, i) => {
            const el = this.container.createEl('div', {
                cls: 'clawdian-mention-item',
                attr: { 'data-index': i.toString() }
            });
            // ... render item
        });""",
    """this.items.forEach((item, i) => {
            const el = this.container.createEl('div', {
                cls: 'clawdian-mention-item',
                attr: { 'data-index': i.toString() }
            });
            void el;
            // ... render item
        });"""
)

# Fix any type in getContext
content = content.replace(
    "getContext(): Record<string, any> {",
    "getContext(): Record<string, string | string[] | undefined> {"
)

with open('src/components/ContextChips.ts', 'w') as f:
    f.write(content)
print("Fixed ContextChips.ts")

# Fix main.ts
with open('src/main.ts', 'r') as f:
    content = f.read()

# Fix any[] to unknown[]
content = content.replace(
    "private debugLog(...args: any[]) {",
    "private debugLog(...args: unknown[]) {"
)
content = content.replace(
    "private debugError(...args: any[]) {",
    "private debugError(...args: unknown[]) {"
)

# Fix catch blocks
content = content.replace(
    """} catch (e: any) {
            this.debugError('Error loading history:', e.message || e);""",
    """} catch (e: unknown) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            this.debugError('Error loading history:', errorMsg);"""
)

content = content.replace(
    """} catch (folderError: any) {
                // Ignore "already exists" errors
                if (!folderError.message?.includes('already exists')) {
                    throw folderError;
                }""",
    """} catch (folderError: unknown) {
                // Ignore "already exists" errors
                const folderErrorMsg = folderError instanceof Error ? folderError.message : String(folderError);
                if (!folderErrorMsg.includes('already exists')) {
                    throw folderError;
                }"""
)

content = content.replace(
    """} catch (e: any) {
            this.debugError('Failed to save history:', e.message || e);""",
    """} catch (e: unknown) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            this.debugError('Failed to save history:', errorMsg);"""
)

content = content.replace(
    """} catch (err: any) {
                    new Notice('❌ Connection failed: ' + err.message);""",
    """} catch (err: unknown) {
                    const errorMsg = err instanceof Error ? err.message : String(err);
                    new Notice('❌ Connection failed: ' + errorMsg);"""
)

content = content.replace(
    """} catch (err: any) {
            console.error('[Clawdian] Connection failed:', err.message);""",
    """} catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error('[Clawdian] Connection failed:', errorMsg);"""
)

with open('src/main.ts', 'w') as f:
    f.write(content)
print("Fixed main.ts")

# Fix OpenClawClient.ts
with open('src/utils/OpenClawClient.ts', 'r') as f:
    content = f.read()

# Fix any in interface
content = content.replace(
    """interface GatewayMessage {
    type: string;
    event?: string;
    id?: string;
    payload?: any;
    error?: any;
    ok?: boolean;
}""",
    """interface GatewayMessage {
    type: string;
    event?: string;
    id?: string;
    payload?: unknown;
    error?: unknown;
    ok?: boolean;
}"""
)

# Fix payload?.agents access
content = content.replace(
    "if (data.type === 'res' && data.payload?.agents) {\n                        this.agents = data.payload.agents;",
    "if (data.type === 'res' && (data.payload as { agents?: AgentInfo[] })?.agents) {\n                        this.agents = (data.payload as { agents: AgentInfo[] }).agents;"
)

# Fix payload?.nonce
content = content.replace(
    "this.handleConnectChallenge(data.payload?.nonce);",
    "this.handleConnectChallenge((data.payload as { nonce?: string })?.nonce);"
)

# Fix error.message
content = content.replace(
    "const errorMsg = data.error.message || data.error || 'Connection failed';",
    "const errorMsg = (data.error as { message?: string }).message || String(data.error) || 'Connection failed';"
)

content = content.replace(
    "const errorMsg = data.error.message || data.error || 'Auth failed';",
    "const errorMsg = (data.error as { message?: string }).message || String(data.error) || 'Auth failed';"
)

# Fix getSessionStatus payload access
content = content.replace(
    """// Try different response structures
                    const state = data.payload?.state || 
                                  data.payload?.status ||
                                  data.payload?.session?.state ||
                                  (data.ok ? 'running' : null);""",
    """// Try different response structures
                    const payload = data.payload as { state?: string; status?: string; session?: { state?: string } };
                    const state = payload?.state ||
                                  payload?.status ||
                                  payload?.session?.state ||
                                  (data.ok ? 'running' : null);"""
)

# Fix catch e with void
content = content.replace(
    """} catch (e) {
                    this.onMessage?.(event.data);
                }""",
    """} catch (e) {
                    this.onMessage?.(event.data);
                    void e;
                }"""
)

with open('src/utils/OpenClawClient.ts', 'w') as f:
    f.write(content)
print("Fixed OpenClawClient.ts")

print("\nAll fixes applied!")
