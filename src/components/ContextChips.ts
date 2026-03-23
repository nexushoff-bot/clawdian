/**
 * ContextChips - Manage context attachments in chat input
 * Shows file references, selected text, and other context as removable chips
 */

import { setIcon } from 'obsidian';

export interface ContextItem {
    id: string;
    type: 'file' | 'text' | 'url' | 'note';
    label: string;
    value: string;
    icon?: string;
}

export class ContextChips {
    container: HTMLElement;
    chipsEl: HTMLElement;
    items: ContextItem[] = [];
    onChange?: (items: ContextItem[]) => void;

    constructor(parent: HTMLElement) {
        this.container = parent.createEl('div', { 
            cls: 'clawchat-context-container' 
        });
        
        // Chips wrapper
        this.chipsEl = this.container.createEl('div', { 
            cls: 'clawchat-context-chips' 
        });

        // Empty state hint
        const hintEl = this.container.createEl('div', { 
            cls: 'clawchat-context-hint',
            text: 'Drop files or click + to add context'
        });

        this.chipsEl.addEventListener('click', () => {
            hintEl.style.display = this.items.length === 0 ? 'block' : 'none';
        });
    }

    /**
     * Add a file context chip
     */
    addFile(path: string): ContextItem {
        const item: ContextItem = {
            id: crypto.randomUUID(),
            type: 'file',
            label: this.basename(path),
            value: path,
            icon: 'file-text'
        };

        this.addItem(item);
        return item;
    }

    /**
     * Add selected text as context
     */
    addText(text: string, _source?: string): ContextItem {
        const truncated = text.length > 50 ? text.slice(0, 50) + '...' : text;
        const item: ContextItem = {
            id: crypto.randomUUID(),
            type: 'text',
            label: truncated,
            value: text,
            icon: 'text-select'
        };

        this.addItem(item);
        return item;
    }

    /**
     * Add a note reference
     */
    addNote(path: string, alias?: string): ContextItem {
        const item: ContextItem = {
            id: crypto.randomUUID(),
            type: 'note',
            label: alias || this.basename(path),
            value: path,
            icon: 'sticky-note'
        };

        this.addItem(item);
        return item;
    }

    /**
     * Add a URL reference
     */
    addURL(url: string, title?: string): ContextItem {
        const item: ContextItem = {
            id: crypto.randomUUID(),
            type: 'url',
            label: title || this.truncateUrl(url),
            value: url,
            icon: 'link'
        };

        this.addItem(item);
        return item;
    }

    /**
     * Add a generic context item
     */
    addItem(item: ContextItem): void {
        // Check for duplicates
        const existing = this.items.find(i => 
            i.type === item.type && i.value === item.value
        );
        if (existing) {
            // Flash the existing chip
            this.flashChip(existing.id);
            return;
        }

        this.items.push(item);
        this.renderChip(item);
        this.emitChange();

        // Show container if it was hidden
        this.container.addClass('clawchat-context-has-items');
    }

    /**
     * Remove a context item by ID
     */
    removeItem(id: string): void {
        const index = this.items.findIndex(i => i.id === id);
        if (index === -1) return;

        const chipEl = this.chipsEl.querySelector(`[data-chip-id="${id}"]`);
        if (chipEl) {
            chipEl.addClass('clawchat-chip-removing');
            setTimeout(() => {
                chipEl.remove();
                this.items.splice(index, 1);
                this.emitChange();

                if (this.items.length === 0) {
                    this.container.removeClass('clawchat-context-has-items');
                }
            }, 200);
        }
    }

    /**
     * Get all context items
     */
    getContext(): Record<string, string[] | undefined> {
        const result: Record<string, string[]> = {};
        
        this.items.forEach(item => {
            switch (item.type) {
                case 'file':
                    if (!result.files) result.files = [];
                    result.files.push(item.value);
                    break;
                case 'text':
                    if (!result.selectedText) result.selectedText = [];
                    result.selectedText.push(item.value);
                    break;
                case 'note':
                    if (!result.notes) result.notes = [];
                    result.notes.push(item.value);
                    break;
                case 'url':
                    if (!result.urls) result.urls = [];
                    result.urls.push(item.value);
                    break;
            }
        });

        return result;
    }

    /**
     * Get context items as array
     */
    getItems(): ContextItem[] {
        return [...this.items];
    }

    /**
     * Clear all context items
     */
    clear(): void {
        this.items = [];
        this.chipsEl.empty();
        this.container.removeClass('clawchat-context-has-items');
        this.emitChange();
    }

    /**
     * Set callback for change events
     */
    onItemsChange(callback: (items: ContextItem[]) => void): void {
        this.onChange = callback;
    }

    private renderChip(item: ContextItem) {
        const chipEl = this.chipsEl.createEl('div', {
            cls: `clawchat-chip clawchat-chip-${item.type}`,
            attr: { 'data-chip-id': item.id, 'data-context-type': item.type }
        });

        // Icon
        if (item.icon) {
            const iconEl = chipEl.createEl('span', { cls: 'clawchat-chip-icon' });
            setIcon(iconEl, item.icon);
        }

        // Label
        chipEl.createEl('span', { 
            cls: 'clawchat-chip-label',
            text: item.label,
            attr: { title: item.value }
        });

        // Type indicator (small badge)
        const badgeEl = chipEl.createEl('span', { 
            cls: 'clawchat-chip-badge',
            text: this.getTypeLabel(item.type)
        });
        void badgeEl;

        // Remove button
        const removeBtn = chipEl.createEl('button', {
            cls: 'clawchat-chip-remove',
            attr: { 'aria-label': 'Remove', type: 'button' }
        });
        setIcon(removeBtn, 'x');
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeItem(item.id);
        });

        // Click to preview (for files and notes)
        if (item.type === 'file' || item.type === 'note') {
            chipEl.addClass('clawchat-chip-clickable');
            chipEl.addEventListener('click', (e) => {
                if (e.target !== removeBtn && !removeBtn.contains(e.target as Node)) {
                    this.previewItem(item);
                }
            });
        }

        // Animate in
        requestAnimationFrame(() => {
            chipEl.addClass('clawchat-chip-visible');
        });
    }

    private flashChip(id: string) {
        const chipEl = this.chipsEl.querySelector(`[data-chip-id="${id}"]`);
        if (chipEl) {
            chipEl.addClass('clawchat-chip-flash');
            setTimeout(() => chipEl.removeClass('clawchat-chip-flash'), 600);
        }
    }

    private previewItem(item: ContextItem) {
        // Dispatch custom event that ChatView can handle
        const event = new CustomEvent('clawchat:preview-context', {
            detail: item,
            bubbles: true
        });
        this.container.dispatchEvent(event);
    }

    private emitChange() {
        if (this.onChange) {
            this.onChange(this.items);
        }
    }

    private getTypeLabel(type: ContextItem['type']): string {
        const labels: Record<string, string> = {
            file: 'FILE',
            text: 'TEXT',
            note: 'NOTE',
            url: 'LINK'
        };
        return labels[type] || type.toUpperCase();
    }

    private basename(path: string): string {
        return path.split('/').pop() || path;
    }

    private truncateUrl(url: string): string {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch {
            return url.slice(0, 30) + (url.length > 30 ? '...' : '');
        }
    }
}

/**
 * QuickActionButtons - Context-aware action buttons below input
 */
export class QuickActionButtons {
    container: HTMLElement;

    constructor(parent: HTMLElement, actions: QuickAction[]) {
        this.container = parent.createEl('div', { 
            cls: 'clawchat-quick-actions' 
        });

        actions.forEach(action => {
            const btn = this.container.createEl('button', {
                cls: 'clawchat-quick-action',
                attr: { title: action.description || action.label }
            });
            
            if (action.icon) {
                const iconEl = btn.createEl('span', { cls: 'clawchat-quick-action-icon' });
                setIcon(iconEl, action.icon);
            }
            
            btn.createEl('span', { 
                cls: 'clawchat-quick-action-label',
                text: action.label 
            });

            btn.addEventListener('click', () => {
                action.onClick();
                btn.addClass('clawchat-quick-action-active');
                setTimeout(() => btn.removeClass('clawchat-quick-action-active'), 200);
            });
        });
    }
}

export interface QuickAction {
    id: string;
    label: string;
    icon?: string;
    description?: string;
    onClick: () => void;
}

/**
 * MentionSuggestion - @mention autocomplete for files/notes
 */
export class MentionSuggestion {
    container: HTMLElement;
    input: HTMLTextAreaElement;
    isOpen = false;
    selectedIndex = 0;
    items: MentionItem[] = [];

    constructor(parent: HTMLElement, input: HTMLTextAreaElement) {
        this.container = parent.createEl('div', { 
            cls: 'clawchat-mention-popup' 
        });
        this.input = input;
        this.setupListeners();
    }

    setupListeners() {
        this.input.addEventListener('input', (e) => this.handleInput(e));
        this.input.addEventListener('keydown', (e) => this.handleKeydown(e));
        
        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target as Node)) {
                this.close();
            }
        });
    }

    handleInput(_e: Event) {
        const value = this.input.value;
        const cursor = this.input.selectionStart || 0;
        const beforeCursor = value.slice(0, cursor);
        
        // Check for @ trigger
        const match = beforeCursor.match(/@([^\s]*)$/);
        if (match) {
            this.open(match[1]);
        } else {
            this.close();
        }
    }

    handleKeydown(e: KeyboardEvent) {
        if (!this.isOpen) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.selectedIndex = Math.min(this.selectedIndex + 1, this.items.length - 1);
                this.updateSelection();
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
                this.updateSelection();
                break;
            case 'Enter':
                e.preventDefault();
                this.selectItem(this.selectedIndex);
                break;
            case 'Escape':
                this.close();
                break;
        }
    }

    open(query: string) {
        this.isOpen = true;
        this.container.addClass('clawchat-mention-visible');
        this.updatePosition();
        this.filterItems(query);
    }

    close() {
        this.isOpen = false;
        this.container.removeClass('clawchat-mention-visible');
    }

    updatePosition() {
        // Position popup below cursor
        const coords = this.getCaretCoordinates();
        this.container.style.left = `${coords.left}px`;
        this.container.style.top = `${coords.top + 20}px`;
    }

    updateSelection() {
        const items = this.container.querySelectorAll('.clawchat-mention-item');
        items.forEach((item, i) => {
            item.toggleClass('clawchat-mention-selected', i === this.selectedIndex);
        });
    }

    filterItems(_query: string) {
        // Filter logic here - would be populated from vault files
        this.renderItems();
    }

    renderItems() {
        this.container.empty();
        this.items.forEach((item, i) => {
            const el = this.container.createEl('div', {
                cls: 'clawchat-mention-item',
                attr: { 'data-index': i.toString() }
            });
            void el;
            // ... render item
        });
    }

    selectItem(index: number) {
        const item = this.items[index];
        if (!item) return;

        const value = this.input.value;
        const cursor = this.input.selectionStart || 0;
        const before = value.slice(0, cursor);
        const after = value.slice(cursor);
        
        // Replace @query with [[link]]
        const replaced = before.replace(/@[^\s]*$/, `[[${item.path}]]`);
        this.input.value = replaced + after;
        this.input.setSelectionRange(replaced.length, replaced.length);
        
        this.close();
    }

    getCaretCoordinates(): { left: number; top: number } {
        // Simplified - in reality would need to calculate from textarea
        const rect = this.input.getBoundingClientRect();
        return { left: rect.left, top: rect.bottom };
    }
}

export interface MentionItem {
    path: string;
    displayName: string;
    icon?: string;
}
