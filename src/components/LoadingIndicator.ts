/**
 * LoadingIndicator - A modern typing indicator component
 * Shows animated dots to indicate the agent is thinking
 */

export class LoadingIndicator {
    element: HTMLElement;
    parent: HTMLElement;
    isVisible = false;
    animationInterval?: number;

    constructor(parent: HTMLElement) {
        this.parent = parent;
        this.element = this.createElement();
    }

    private createSvgIcon(): SVGSVGElement {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '18');
        svg.setAttribute('height', '18');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');

        const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path1.setAttribute('d', 'M12 8V4H8');
        svg.appendChild(path1);

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('width', '16');
        rect.setAttribute('height', '12');
        rect.setAttribute('x', '4');
        rect.setAttribute('y', '8');
        rect.setAttribute('rx', '2');
        svg.appendChild(rect);

        const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path2.setAttribute('d', 'M2 14h2');
        svg.appendChild(path2);

        const path3 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path3.setAttribute('d', 'M20 14h2');
        svg.appendChild(path3);

        const path4 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path4.setAttribute('d', 'M15 13v2');
        svg.appendChild(path4);

        const path5 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path5.setAttribute('d', 'M9 13v2');
        svg.appendChild(path5);

        return svg;
    }

    private createElement(): HTMLElement {
        const wrapper = this.parent.createEl('div', { 
            cls: 'clawchat-loading-wrapper' 
        });

        // Create message group structure matching ChatView
        const groupEl = wrapper.createEl('div', { 
            cls: 'clawchat-message-group clawchat-message-group-agent clawchat-loading-group' 
        });

        // Avatar
        const avatarEl = groupEl.createEl('div', { 
            cls: 'clawchat-avatar clawchat-avatar-agent' 
        });
        avatarEl.setAttribute('data-agent', 'loading');
        
        // Animated avatar with pulsing effect
        const avatarInner = avatarEl.createEl('div', { cls: 'clawchat-avatar-inner' });
        avatarInner.appendChild(this.createSvgIcon());

        // Content
        const contentEl = groupEl.createEl('div', { cls: 'clawchat-message-content' });
        
        // Header
        const headerEl = contentEl.createEl('div', { cls: 'clawchat-message-header' });
        headerEl.createEl('span', { 
            cls: 'clawchat-message-author',
            text: 'Claw chat'
        });
        headerEl.createEl('span', { 
            cls: 'clawchat-loading-status',
            text: 'Thinking...'
        });

        // Typing bubble with animated dots
        const bubbleEl = contentEl.createEl('div', { 
            cls: 'clawchat-message-bubble clawchat-loading-bubble'
        });

        const dotsContainer = bubbleEl.createEl('div', { cls: 'clawchat-typing-dots' });
        for (let i = 0; i < 3; i++) {
            dotsContainer.createEl('span', { cls: 'clawchat-typing-dot' });
        }

        // Progress bar for long operations
        const progressContainer = bubbleEl.createEl('div', { 
            cls: 'clawchat-loading-progress' 
        });
        progressContainer.createEl('div', { 
            cls: 'clawchat-loading-progress-bar' 
        });

        // Status text that cycles through different states
        contentEl.createEl('div', { 
            cls: 'clawchat-loading-status-text' 
        });

        return wrapper;
    }

    show(): void {
        if (this.isVisible) return;
        this.isVisible = true;
        this.element.addClass('clawchat-loading-visible');
        this.element.removeClass('clawchat-loading-hidden');

        // Start status cycling
        this.startStatusCycle();
    }

    hide(): void {
        if (!this.isVisible) return;
        this.isVisible = false;
        
        this.element.removeClass('clawchat-loading-visible');
        this.element.addClass('clawchat-loading-hidden');
        
        // Wait for exit animation
        setTimeout(() => {
            this.stopStatusCycle();
        }, 300);
    }

    private startStatusCycle(): void {
        const statuses = [
            'thinking...',
            'analyzing context...',
            'processing...',
            'generating response...'
        ];
        let index = 0;

        const updateStatus = (): void => {
            if (!this.isVisible) return;
            const statusEl = this.element.querySelector('.clawchat-loading-status-text');
            if (statusEl) {
                statusEl.textContent = statuses[index];
                index = (index + 1) % statuses.length;
            }
        };

        updateStatus();
        this.animationInterval = window.setInterval(updateStatus, 2000);
    }

    private stopStatusCycle(): void {
        if (this.animationInterval) {
            clearInterval(this.animationInterval);
            this.animationInterval = undefined;
        }
    }

    /**
     * Update loading progress (0-100)
     */
    setProgress(percent: number): void {
        const progressBar = this.element.querySelector('.clawchat-loading-progress-bar');
        if (progressBar instanceof HTMLElement) {
            progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
            
            // Show progress bar when there's actual progress
            if (percent > 0) {
                this.element.addClass('clawchat-loading-has-progress');
            }
        }
    }

    /**
     * Set custom status message
     */
    setStatus(message: string): void {
        const statusEl = this.element.querySelector('.clawchat-loading-status');
        if (statusEl) {
            statusEl.textContent = message;
        }
    }

    /**
     * Destroy the indicator
     */
    destroy(): void {
        this.stopStatusCycle();
        this.element.remove();
    }
}

/**
 * LoadingSkeleton - Placeholder for streaming content
 * Shows gray blocks while content is loading
 */
export class LoadingSkeleton {
    element: HTMLElement;

    constructor(parent: HTMLElement, lines = 3) {
        this.element = parent.createEl('div', { cls: 'clawchat-skeleton' });
        
        for (let i = 0; i < lines; i++) {
            const line = this.element.createEl('div', { 
                cls: 'clawchat-skeleton-line',
                attr: { style: `--skeleton-delay: ${i * 0.1}s` }
            });
            // Vary the width for realism
            const width = i === lines - 1 ? 60 : 100;
            line.addClass(`clawchat-skeleton-width-${width}`);
        }
    }

    remove(): void {
        this.element.addClass('clawchat-skeleton-fade-out');
        setTimeout(() => this.element.remove(), 300);
    }
}