/**
 * Map.js - Pan/zoom/render logic with spatial indexing and LOD
 */

class QuadTree {
    constructor(bounds, capacity = 4, maxDepth = 8, depth = 0) {
        this.bounds = bounds; // {x, y, width, height}
        this.capacity = capacity;
        this.maxDepth = maxDepth;
        this.depth = depth;
        this.points = [];
        this.divided = false;
        this.children = null;
    }

    subdivide() {
        const { x, y, width, height } = this.bounds;
        const w = width / 2;
        const h = height / 2;

        this.children = {
            nw: new QuadTree({ x, y, width: w, height: h }, this.capacity, this.maxDepth, this.depth + 1),
            ne: new QuadTree({ x: x + w, y, width: w, height: h }, this.capacity, this.maxDepth, this.depth + 1),
            sw: new QuadTree({ x, y: y + h, width: w, height: h }, this.capacity, this.maxDepth, this.depth + 1),
            se: new QuadTree({ x: x + w, y: y + h, width: w, height: h }, this.capacity, this.maxDepth, this.depth + 1)
        };

        this.divided = true;
    }

    insert(point) {
        if (!this.contains(point)) {
            return false;
        }

        if (this.points.length < this.capacity || this.depth >= this.maxDepth) {
            this.points.push(point);
            return true;
        }

        if (!this.divided) {
            this.subdivide();
        }

        return (
            this.children.nw.insert(point) ||
            this.children.ne.insert(point) ||
            this.children.sw.insert(point) ||
            this.children.se.insert(point)
        );
    }

    contains(point) {
        return (
            point.x >= this.bounds.x &&
            point.x < this.bounds.x + this.bounds.width &&
            point.y >= this.bounds.y &&
            point.y < this.bounds.y + this.bounds.height
        );
    }

    query(range, found = []) {
        if (!this.intersects(range)) {
            return found;
        }

        for (const point of this.points) {
            if (this.pointInRange(point, range)) {
                found.push(point);
            }
        }

        if (this.divided) {
            this.children.nw.query(range, found);
            this.children.ne.query(range, found);
            this.children.sw.query(range, found);
            this.children.se.query(range, found);
        }

        return found;
    }

    intersects(range) {
        return !(
            range.x > this.bounds.x + this.bounds.width ||
            range.x + range.width < this.bounds.x ||
            range.y > this.bounds.y + this.bounds.height ||
            range.y + range.height < this.bounds.y
        );
    }

    pointInRange(point, range) {
        return (
            point.x >= range.x &&
            point.x <= range.x + range.width &&
            point.y >= range.y &&
            point.y <= range.y + range.height
        );
    }
}

class EmbeddingMap {
    constructor(canvasId, minimapId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.minimap = document.getElementById(minimapId);
        this.minimapCtx = this.minimap.getContext('2d');

        // Coordinate scaling factor to expand the data space
        // Transforms 200×135 data space into ~10000×6750 virtual pixel space
        // This provides enough room (83px between points) to prevent image overlap
        this.SCALE_FACTOR = 50;

        // Data
        this.allPoints = [];
        this.quadTree = null;
        this.bounds = null;
        this.filteredIds = null; // null = show all, Set = show only these IDs

        // View state
        this.camera = { x: 0, y: 0, zoom: 1 };
        this.targetCamera = { x: 0, y: 0, zoom: 1 };

        // Interaction state
        this.isDragging = false;
        this.lastMouse = { x: 0, y: 0 };
        this.velocity = { x: 0, y: 0 };

        // Image cache
        this.imageCache = new Map();
        this.imageLoadQueue = [];
        this.maxConcurrentLoads = 6;
        this.currentLoads = 0;

        // Rendering
        this.animationFrame = null;
        this.hoveredPoint = null;

        // LOD thresholds - adjusted for proper zoom-dependent sizing
        // These thresholds now work with the new sizing formula
        this.LOD_DOT_THRESHOLD = 0.3; // Below this zoom, show dots (4-8px)
        this.LOD_SMALL_THRESHOLD = 1.0; // Below this, show small thumbnails (16-32px)
        this.LOD_MEDIUM_THRESHOLD = 3.0; // Below this, show medium thumbnails (64-128px)
        // Above medium = large thumbnails (256px)

        this.init();
    }

    init() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Mouse/touch events
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.onMouseUp());
        this.canvas.addEventListener('mouseleave', () => this.onMouseUp());
        this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

        // Touch events
        this.canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', () => this.onTouchEnd());

        this.startRenderLoop();
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        const dpr = window.devicePixelRatio || 1;

        this.canvas.width = container.clientWidth * dpr;
        this.canvas.height = container.clientHeight * dpr;
        this.canvas.style.width = container.clientWidth + 'px';
        this.canvas.style.height = container.clientHeight + 'px';

        this.ctx.scale(dpr, dpr);

        // Resize minimap
        this.minimap.width = 180;
        this.minimap.height = 180;
    }

    loadData(data) {
        // Apply coordinate scaling to expand the data space
        // Scale all point coordinates by SCALE_FACTOR
        this.allPoints = data.points.map(point => ({
            ...point,
            x: point.x * this.SCALE_FACTOR,
            y: point.y * this.SCALE_FACTOR
        }));

        // Scale bounds by SCALE_FACTOR
        this.bounds = {
            minX: data.bounds.minX * this.SCALE_FACTOR,
            minY: data.bounds.minY * this.SCALE_FACTOR,
            maxX: data.bounds.maxX * this.SCALE_FACTOR,
            maxY: data.bounds.maxY * this.SCALE_FACTOR
        };

        // Build quadtree with scaled coordinates
        const padding = 10 * this.SCALE_FACTOR;
        const qtBounds = {
            x: this.bounds.minX - padding,
            y: this.bounds.minY - padding,
            width: (this.bounds.maxX - this.bounds.minX) + padding * 2,
            height: (this.bounds.maxY - this.bounds.minY) + padding * 2
        };

        this.quadTree = new QuadTree(qtBounds);

        for (const point of this.allPoints) {
            this.quadTree.insert(point);
        }

        // Center camera on data
        this.resetView();
    }

    resetView() {
        if (!this.bounds) return;

        const centerX = (this.bounds.minX + this.bounds.maxX) / 2;
        const centerY = (this.bounds.minY + this.bounds.maxY) / 2;

        const dataWidth = this.bounds.maxX - this.bounds.minX;
        const dataHeight = this.bounds.maxY - this.bounds.minY;

        const canvasWidth = this.canvas.clientWidth;
        const canvasHeight = this.canvas.clientHeight;

        const zoomX = canvasWidth / dataWidth;
        const zoomY = canvasHeight / dataHeight;
        // Start fully zoomed out to show all points as tiny dots (~4px each)
        // Use 0.95 factor to fit entire map with minimal padding
        const zoom = Math.min(zoomX, zoomY) * 0.95;

        this.camera = { x: centerX, y: centerY, zoom };
        this.targetCamera = { ...this.camera };
    }

    // Camera transformations
    worldToScreen(x, y) {
        const canvasWidth = this.canvas.clientWidth;
        const canvasHeight = this.canvas.clientHeight;

        return {
            x: (x - this.camera.x) * this.camera.zoom + canvasWidth / 2,
            y: (y - this.camera.y) * this.camera.zoom + canvasHeight / 2
        };
    }

    screenToWorld(x, y) {
        const canvasWidth = this.canvas.clientWidth;
        const canvasHeight = this.canvas.clientHeight;

        return {
            x: (x - canvasWidth / 2) / this.camera.zoom + this.camera.x,
            y: (y - canvasHeight / 2) / this.camera.zoom + this.camera.y
        };
    }

    // Get visible viewport in world coordinates
    getViewportBounds() {
        const topLeft = this.screenToWorld(0, 0);
        const bottomRight = this.screenToWorld(this.canvas.clientWidth, this.canvas.clientHeight);

        return {
            x: topLeft.x,
            y: topLeft.y,
            width: bottomRight.x - topLeft.x,
            height: bottomRight.y - topLeft.y
        };
    }

    // Event handlers
    onMouseDown(e) {
        this.isDragging = true;
        this.lastMouse = { x: e.clientX, y: e.clientY };
        this.velocity = { x: 0, y: 0 };
        this.canvas.classList.add('dragging');
    }

    onMouseMove(e) {
        if (this.isDragging) {
            const dx = e.clientX - this.lastMouse.x;
            const dy = e.clientY - this.lastMouse.y;

            this.velocity = { x: dx, y: dy };

            this.targetCamera.x -= dx / this.camera.zoom;
            this.targetCamera.y -= dy / this.camera.zoom;

            this.lastMouse = { x: e.clientX, y: e.clientY };
        } else {
            // Update hovered point
            this.updateHover(e.offsetX, e.offsetY);
        }
    }

    onMouseUp() {
        this.isDragging = false;
        this.canvas.classList.remove('dragging');
    }

    onWheel(e) {
        e.preventDefault();

        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Get world position under cursor BEFORE zoom
        const worldPosBefore = this.screenToWorld(mouseX, mouseY);

        // Apply zoom
        const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
        const newZoom = Math.max(0.05, Math.min(20, this.targetCamera.zoom * zoomFactor));

        // Calculate world position under cursor AFTER zoom using the NEW zoom value
        const canvasWidth = this.canvas.clientWidth;
        const canvasHeight = this.canvas.clientHeight;
        const worldPosAfterX = (mouseX - canvasWidth / 2) / newZoom + this.targetCamera.x;
        const worldPosAfterY = (mouseY - canvasHeight / 2) / newZoom + this.targetCamera.y;

        // Adjust camera so the world point stays under cursor
        this.targetCamera.x += worldPosBefore.x - worldPosAfterX;
        this.targetCamera.y += worldPosBefore.y - worldPosAfterY;
        this.targetCamera.zoom = newZoom;
    }

    onTouchStart(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            this.onMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
        }
    }

    onTouchMove(e) {
        e.preventDefault();
        if (e.touches.length === 1 && this.isDragging) {
            const touch = e.touches[0];
            this.onMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
        }
    }

    onTouchEnd() {
        this.onMouseUp();
    }

    updateHover(x, y) {
        const worldPos = this.screenToWorld(x, y);
        const visiblePoints = this.getVisiblePoints();

        let closestPoint = null;
        let closestDist = Infinity;
        const hoverRadius = 30 / this.camera.zoom;

        for (const point of visiblePoints) {
            const dist = Math.sqrt((point.x - worldPos.x) ** 2 + (point.y - worldPos.y) ** 2);
            if (dist < hoverRadius && dist < closestDist) {
                closestPoint = point;
                closestDist = dist;
            }
        }

        if (closestPoint !== this.hoveredPoint) {
            this.hoveredPoint = closestPoint;

            if (this.onHoverChange) {
                this.onHoverChange(this.hoveredPoint);
            }
        }
    }

    getVisiblePoints() {
        if (!this.quadTree) return [];

        const viewport = this.getViewportBounds();
        let points = this.quadTree.query(viewport);

        // Apply filter if active
        if (this.filteredIds !== null) {
            points = points.filter(p => this.filteredIds.has(p.id));
        }

        return points;
    }

    // Image loading
    loadImage(id) {
        if (this.imageCache.has(id)) {
            return this.imageCache.get(id);
        }

        const img = new Image();
        img.dataset.id = id;
        this.imageCache.set(id, img);

        this.imageLoadQueue.push(img);
        this.processImageQueue();

        return img;
    }

    processImageQueue() {
        while (this.currentLoads < this.maxConcurrentLoads && this.imageLoadQueue.length > 0) {
            const img = this.imageLoadQueue.shift();
            this.currentLoads++;

            img.onload = () => {
                this.currentLoads--;
                this.processImageQueue();
            };

            img.onerror = () => {
                this.currentLoads--;
                this.processImageQueue();
            };

            img.src = `thumbnails/image_${img.dataset.id}.jpg`;
        }
    }

    // Rendering
    startRenderLoop() {
        const render = () => {
            this.update();
            this.render();
            this.animationFrame = requestAnimationFrame(render);
        };
        render();
    }

    update() {
        // Smooth camera interpolation
        const lerp = 0.15;
        this.camera.x += (this.targetCamera.x - this.camera.x) * lerp;
        this.camera.y += (this.targetCamera.y - this.camera.y) * lerp;
        this.camera.zoom += (this.targetCamera.zoom - this.camera.zoom) * lerp;

        // Apply momentum when not dragging
        if (!this.isDragging) {
            this.velocity.x *= 0.92;
            this.velocity.y *= 0.92;

            if (Math.abs(this.velocity.x) > 0.1 || Math.abs(this.velocity.y) > 0.1) {
                this.targetCamera.x -= this.velocity.x / this.camera.zoom;
                this.targetCamera.y -= this.velocity.y / this.camera.zoom;
            }
        }
    }

    render() {
        const ctx = this.ctx;
        const canvasWidth = this.canvas.clientWidth;
        const canvasHeight = this.canvas.clientHeight;

        // Clear canvas
        ctx.fillStyle = '#0f0f0f';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        if (!this.quadTree) return;

        const visiblePoints = this.getVisiblePoints();

        // Calculate image size based on viewport width in scaled coordinate space
        // Scaled data width = 200 * SCALE_FACTOR = 10000 units
        // Formula: imageSize = 4 * (scaledDataWidth / viewportWidth)
        // - When viewportWidth = 10000 (full map): imageSize = 4px
        // - When viewportWidth = 1000 (zoomed in 10x): imageSize = 40px
        // - When viewportWidth = 100 (zoomed in 100x): imageSize = 400px
        const viewport = this.getViewportBounds();
        const viewportWidth = viewport.width;
        const scaledDataWidth = this.bounds.maxX - this.bounds.minX;

        let displaySize = 2.5 * (scaledDataWidth / viewportWidth);
        displaySize = Math.max(2, Math.min(256, displaySize));

        // Determine render mode based on display size
        let renderMode;
        if (displaySize <= 8) {
            renderMode = 'dot';
        } else if (displaySize <= 32) {
            renderMode = 'small';
        } else if (displaySize <= 128) {
            renderMode = 'medium';
        } else {
            renderMode = 'large';
        }

        // Render points
        for (const point of visiblePoints) {
            const screen = this.worldToScreen(point.x, point.y);
            const size = displaySize;

            if (renderMode === 'dot') {
                // Draw as colored dot
                ctx.fillStyle = this.filteredIds && !this.filteredIds.has(point.id) ? '#333' : '#6366f1';
                ctx.beginPath();
                ctx.arc(screen.x, screen.y, size / 2, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Draw thumbnail
                const img = this.loadImage(point.id);

                if (img.complete && img.naturalWidth > 0) {
                    const alpha = this.filteredIds && !this.filteredIds.has(point.id) ? 0.2 : 1.0;
                    ctx.globalAlpha = alpha;

                    ctx.drawImage(img, screen.x - size / 2, screen.y - size / 2, size, size);

                    ctx.globalAlpha = 1.0;

                    // Draw prompt text only when zoomed very close
                    // Truncated text at 128-200px, full text above 200px
                    if (size > 128) {
                        const maxWidth = size;
                        // Show fuller text when very zoomed in (>200px)
                        const truncateLength = size > 200 ? 100 : 30;
                        const truncated = this.truncateText(point.prompt, truncateLength);

                        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                        ctx.fillRect(screen.x - size / 2, screen.y + size / 2, size, 20);

                        ctx.fillStyle = '#e0e0e0';
                        ctx.font = '10px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.fillText(truncated, screen.x, screen.y + size / 2 + 14, maxWidth);
                    }
                } else {
                    // Placeholder while loading
                    ctx.fillStyle = '#2a2a2a';
                    ctx.fillRect(screen.x - size / 2, screen.y - size / 2, size, size);
                }
            }

            // Highlight hovered point
            if (this.hoveredPoint === point) {
                ctx.strokeStyle = '#6366f1';
                ctx.lineWidth = 3;
                ctx.strokeRect(screen.x - size / 2 - 2, screen.y - size / 2 - 2, size + 4, size + 4);
            }
        }

        // Render minimap
        this.renderMinimap();

        // Notify visible point count
        if (this.onVisibleCountChange) {
            this.onVisibleCountChange(visiblePoints.length);
        }
    }

    renderMinimap() {
        const ctx = this.minimapCtx;
        const width = this.minimap.width;
        const height = this.minimap.height;

        // Clear
        ctx.fillStyle = '#141414';
        ctx.fillRect(0, 0, width, height);

        if (!this.bounds) return;

        // Draw all points as small dots
        const dataWidth = this.bounds.maxX - this.bounds.minX;
        const dataHeight = this.bounds.maxY - this.bounds.minY;
        const scale = Math.min(width / dataWidth, height / dataHeight) * 0.9;
        const offsetX = (width - dataWidth * scale) / 2;
        const offsetY = (height - dataHeight * scale) / 2;

        ctx.fillStyle = '#3a3a3a';
        for (const point of this.allPoints) {
            const x = (point.x - this.bounds.minX) * scale + offsetX;
            const y = (point.y - this.bounds.minY) * scale + offsetY;
            ctx.fillRect(x, y, 1, 1);
        }

        // Draw viewport rectangle
        const viewport = this.getViewportBounds();
        const vx = (viewport.x - this.bounds.minX) * scale + offsetX;
        const vy = (viewport.y - this.bounds.minY) * scale + offsetY;
        const vw = viewport.width * scale;
        const vh = viewport.height * scale;

        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2;
        ctx.strokeRect(vx, vy, vw, vh);
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    // Public methods for external control
    zoomIn() {
        this.targetCamera.zoom *= 1.3;
    }

    zoomOut() {
        this.targetCamera.zoom /= 1.3;
        this.targetCamera.zoom = Math.max(0.05, this.targetCamera.zoom);
    }

    panTo(x, y, zoom) {
        this.targetCamera.x = x;
        this.targetCamera.y = y;
        if (zoom !== undefined) {
            this.targetCamera.zoom = zoom;
        }
    }

    setFilter(ids) {
        this.filteredIds = ids;
    }

    clearFilter() {
        this.filteredIds = null;
    }

    getPointById(id) {
        return this.allPoints.find(p => p.id === id);
    }
}
