/**
 * App.js - Main application logic
 */

class App {
    constructor() {
        this.map = null;
        this.search = null;
        this.tooltip = null;

        this.loadingOverlay = document.getElementById('loading-overlay');
        this.loadingProgress = document.querySelector('.loading-progress');

        this.totalPointsEl = document.getElementById('total-points');
        this.visiblePointsEl = document.getElementById('visible-points');

        this.zoomInBtn = document.getElementById('zoom-in');
        this.zoomOutBtn = document.getElementById('zoom-out');
        this.zoomResetBtn = document.getElementById('zoom-reset');

        this.init();
    }

    async init() {
        try {
            // Initialize map
            this.map = new EmbeddingMap('main-canvas', 'minimap-canvas');

            // Initialize search
            this.search = new SearchManager();

            // Initialize tooltip
            this.initTooltip();

            // Load data
            await this.loadData();

            // Setup event handlers
            this.setupEventHandlers();

            // Hide loading overlay
            this.hideLoading();

        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.showError(error.message);
        }
    }

    async loadData() {
        try {
            this.updateLoadingProgress('Loading data...', 0);

            const response = await fetch('data.json');

            if (!response.ok) {
                throw new Error(`Failed to load data.json: ${response.status} ${response.statusText}`);
            }

            // Get content length for progress tracking
            const contentLength = response.headers.get('content-length');
            let loaded = 0;

            if (contentLength) {
                const total = parseInt(contentLength, 10);
                const reader = response.body.getReader();
                const chunks = [];

                while (true) {
                    const { done, value } = await reader.read();

                    if (done) break;

                    chunks.push(value);
                    loaded += value.length;

                    const progress = Math.round((loaded / total) * 100);
                    this.updateLoadingProgress('Loading data...', progress);
                }

                // Combine chunks
                const allChunks = new Uint8Array(loaded);
                let position = 0;
                for (const chunk of chunks) {
                    allChunks.set(chunk, position);
                    position += chunk.length;
                }

                // Decode and parse
                const text = new TextDecoder().decode(allChunks);
                const data = JSON.parse(text);

                this.processData(data);

            } else {
                // No content length, just load normally
                const data = await response.json();
                this.processData(data);
            }

        } catch (error) {
            throw new Error(`Failed to load data: ${error.message}`);
        }
    }

    processData(data) {
        this.updateLoadingProgress('Processing data...', 100);

        // Load data into map
        this.map.loadData(data);

        // Load data into search
        this.search.setData(data.points);

        // Update stats
        this.totalPointsEl.textContent = data.points.length.toLocaleString();

        console.log(`Loaded ${data.points.length} points`);
    }

    setupEventHandlers() {
        // Map hover -> update tooltip
        this.map.onHoverChange = (point) => {
            this.updateTooltip(point);
        };

        // Map visible count -> update stats
        this.map.onVisibleCountChange = (count) => {
            this.visiblePointsEl.textContent = count.toLocaleString();
        };

        // Search result click -> pan to point
        this.search.onResultClick = (pointId) => {
            const point = this.map.getPointById(pointId);
            if (point) {
                this.map.panTo(point.x, point.y, 2.0);
                this.search.hideResults();
            }
        };

        // Search change -> filter map
        this.search.onSearchChange = (filteredIds) => {
            if (filteredIds === null) {
                this.map.clearFilter();
            } else {
                this.map.setFilter(filteredIds);
            }
        };

        // Zoom controls
        this.zoomInBtn.addEventListener('click', () => {
            this.map.zoomIn();
        });

        this.zoomOutBtn.addEventListener('click', () => {
            this.map.zoomOut();
        });

        this.zoomResetBtn.addEventListener('click', () => {
            this.map.resetView();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + F to focus search
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                this.search.focus();
            }

            // Escape to clear search
            if (e.key === 'Escape') {
                this.search.clearSearch();
            }

            // +/- for zoom (without modifier keys)
            if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                if (e.key === '+' || e.key === '=') {
                    e.preventDefault();
                    this.map.zoomIn();
                } else if (e.key === '-' || e.key === '_') {
                    e.preventDefault();
                    this.map.zoomOut();
                } else if (e.key === '0') {
                    e.preventDefault();
                    this.map.resetView();
                }
            }
        });
    }

    initTooltip() {
        this.tooltip = {
            element: document.getElementById('tooltip'),
            image: document.getElementById('tooltip-image'),
            prompt: this.tooltip_element?.querySelector('.tooltip-prompt') || document.querySelector('.tooltip-prompt')
        };

        // Track mouse for tooltip positioning
        document.addEventListener('mousemove', (e) => {
            if (this.tooltip.element.style.display === 'block') {
                this.positionTooltip(e.clientX, e.clientY);
            }
        });
    }

    updateTooltip(point) {
        if (!point) {
            this.tooltip.element.style.display = 'none';
            return;
        }

        // Update image
        this.tooltip.image.src = `thumbnails/image_${point.id}.jpg`;

        // Update prompt
        this.tooltip.prompt.textContent = point.prompt;

        // Show tooltip
        this.tooltip.element.style.display = 'block';
    }

    positionTooltip(mouseX, mouseY) {
        const tooltip = this.tooltip.element;
        const rect = tooltip.getBoundingClientRect();

        let x = mouseX + 15;
        let y = mouseY + 15;

        // Prevent tooltip from going off-screen
        if (x + rect.width > window.innerWidth) {
            x = mouseX - rect.width - 15;
        }

        if (y + rect.height > window.innerHeight) {
            y = mouseY - rect.height - 15;
        }

        tooltip.style.left = x + 'px';
        tooltip.style.top = y + 'px';
    }

    updateLoadingProgress(text, percent) {
        this.loadingProgress.textContent = `${percent}%`;
        document.querySelector('.loading-text').textContent = text;
    }

    hideLoading() {
        setTimeout(() => {
            this.loadingOverlay.classList.add('hidden');
        }, 300);
    }

    showError(message) {
        this.loadingOverlay.innerHTML = `
            <div class="loading-content">
                <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
                <div class="loading-text">Error Loading Map</div>
                <div style="color: #888; margin-top: 10px; max-width: 400px;">
                    ${this.escapeHtml(message)}
                </div>
                <div style="margin-top: 20px;">
                    <button onclick="location.reload()" style="
                        background: #6366f1;
                        color: white;
                        border: none;
                        padding: 10px 20px;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 14px;
                    ">Reload Page</button>
                </div>
            </div>
        `;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new App();
    });
} else {
    new App();
}
