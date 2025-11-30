/**
 * Search.js - Search and filter functionality for embedding map
 */

class SearchManager {
    constructor() {
        this.searchInput = document.getElementById('search-input');
        this.searchClear = document.getElementById('search-clear');
        this.searchResults = document.getElementById('search-results');

        this.allPoints = [];
        this.searchTimeout = null;
        this.maxResults = 100;

        this.onResultClick = null;
        this.onSearchChange = null;

        this.init();
    }

    init() {
        // Search input events
        this.searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();

            // Show/hide clear button
            this.searchClear.style.display = query ? 'block' : 'none';

            // Debounce search
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                this.performSearch(query);
            }, 300);
        });

        // Clear button
        this.searchClear.addEventListener('click', () => {
            this.clearSearch();
        });

        // Close results when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.searchInput.contains(e.target) && !this.searchResults.contains(e.target)) {
                this.hideResults();
            }
        });

        // Focus on results with keyboard
        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.clearSearch();
            } else if (e.key === 'Enter') {
                const firstResult = this.searchResults.querySelector('.search-result-item');
                if (firstResult) {
                    firstResult.click();
                }
            }
        });
    }

    setData(points) {
        this.allPoints = points;
    }

    performSearch(query) {
        if (!query) {
            this.hideResults();
            if (this.onSearchChange) {
                this.onSearchChange(null); // Clear filter
            }
            return;
        }

        const lowerQuery = query.toLowerCase();
        const results = [];

        // Search through all points
        for (const point of this.allPoints) {
            const lowerPrompt = point.prompt.toLowerCase();
            if (lowerPrompt.includes(lowerQuery)) {
                results.push({
                    point,
                    index: lowerPrompt.indexOf(lowerQuery)
                });
            }
        }

        // Sort by relevance (earlier match = more relevant)
        results.sort((a, b) => a.index - b.index);

        // Limit results
        const limitedResults = results.slice(0, this.maxResults);

        // Display results
        this.displayResults(limitedResults, query);

        // Notify filter change
        if (this.onSearchChange) {
            const filteredIds = new Set(results.map(r => r.point.id));
            this.onSearchChange(filteredIds);
        }
    }

    displayResults(results, query) {
        if (results.length === 0) {
            this.searchResults.innerHTML = `
                <div class="search-no-results">
                    No results found for "${this.escapeHtml(query)}"
                </div>
            `;
            this.searchResults.classList.add('show');
            return;
        }

        let html = '';

        for (const { point } of results) {
            const highlightedPrompt = this.highlightText(point.prompt, query);

            html += `
                <div class="search-result-item" data-point-id="${point.id}">
                    <div class="search-result-prompt">${highlightedPrompt}</div>
                    <div class="search-result-meta">
                        ID: ${point.id} · Position: (${point.x.toFixed(2)}, ${point.y.toFixed(2)})
                    </div>
                </div>
            `;
        }

        if (results.length === this.maxResults) {
            html += `
                <div class="search-result-item" style="text-align: center; color: #666; cursor: default;">
                    Showing first ${this.maxResults} results
                </div>
            `;
        }

        this.searchResults.innerHTML = html;
        this.searchResults.classList.add('show');

        // Add click handlers
        const items = this.searchResults.querySelectorAll('.search-result-item[data-point-id]');
        items.forEach(item => {
            item.addEventListener('click', () => {
                const pointId = parseInt(item.dataset.pointId);
                if (this.onResultClick) {
                    this.onResultClick(pointId);
                }
            });
        });
    }

    hideResults() {
        this.searchResults.classList.remove('show');
    }

    clearSearch() {
        this.searchInput.value = '';
        this.searchClear.style.display = 'none';
        this.hideResults();

        if (this.onSearchChange) {
            this.onSearchChange(null); // Clear filter
        }
    }

    highlightText(text, query) {
        if (!query) return this.escapeHtml(text);

        const escapedText = this.escapeHtml(text);
        const escapedQuery = this.escapeHtml(query);

        const regex = new RegExp(`(${this.escapeRegex(escapedQuery)})`, 'gi');
        return escapedText.replace(regex, '<span class="search-result-highlight">$1</span>');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    escapeRegex(text) {
        return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    getSearchQuery() {
        return this.searchInput.value.trim();
    }

    focus() {
        this.searchInput.focus();
    }
}
