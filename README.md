# Interactive Embedding Map - SD 1.5 CLIP Space

An interactive 2D visualization of ~10,000 AI-generated images positioned in CLIP embedding space. Built as a static website for GitHub Pages.

## Features

- **Interactive Map**: Smooth pan and zoom navigation with momentum
- **Smart Rendering**: Level-of-detail (LOD) system adapts based on zoom level
- **Fast Performance**: Quadtree spatial indexing for efficient viewport culling
- **Search & Filter**: Find images by prompt text with real-time highlighting
- **Lazy Loading**: Images load only when visible in viewport
- **Minimap**: Overview showing current viewport position
- **Tooltips**: Hover over images to see full resolution and complete prompt
- **Keyboard Shortcuts**:
  - `Ctrl/Cmd + F`: Focus search
  - `+/-`: Zoom in/out
  - `0`: Reset view
  - `Esc`: Clear search

## Quick Start

### 1. Preprocess Data (Already Done)

The preprocessing script has already been run to generate `data.json`. If you need to regenerate it:

```bash
# Install dependencies
pip install torch numpy

# Run preprocessing
python3 preprocess.py
```

This converts `sd_clip_embeddings_2d.pt` and `prompts.txt` into a single `data.json` file.

### 2. Add Thumbnail Images

The website expects thumbnail images in the `thumbnails/` directory:

```
thumbnails/
├── image_0.jpg
├── image_1.jpg
├── image_2.jpg
...
└── image_9762.jpg
```

Images should be 256×256 pixels in JPEG format.

### 3. Serve Locally

Use any static file server. For example:

```bash
# Python
python3 -m http.server 8000

# Node.js
npx serve

# PHP
php -S localhost:8000
```

Then open http://localhost:8000 in your browser.

### 4. Deploy to GitHub Pages

1. Push this repository to GitHub
2. Go to Settings → Pages
3. Set source to "Deploy from a branch"
4. Select your branch and `/` (root) directory
5. Save and wait for deployment

## Project Structure

```
/
├── index.html              # Main page
├── css/
│   └── style.css          # Dark theme styling
├── js/
│   ├── app.js             # Main application logic
│   ├── map.js             # Pan/zoom/rendering with quadtree
│   └── search.js          # Search and filter functionality
├── data.json              # Preprocessed embeddings (0.68 MB)
├── preprocess.py          # Data conversion script
├── prompts.txt            # Original prompts (9763 lines)
├── sd_clip_embeddings_2d.pt # Original embeddings
└── thumbnails/            # Image thumbnails (create this)
    ├── image_0.jpg
    ├── image_1.jpg
    └── ...
```

## Technical Details

### Performance Optimizations

- **Quadtree Spatial Indexing**: O(log n) viewport queries instead of O(n)
- **Viewport Culling**: Only renders points visible in current view
- **Level of Detail**:
  - Zoom < 0.1: Small colored dots
  - Zoom 0.1-0.4: Small thumbnails (16px)
  - Zoom 0.4-1.2: Medium thumbnails (32px)
  - Zoom > 1.2: Large thumbnails (64px) with prompt text
- **Lazy Image Loading**: Max 6 concurrent image loads
- **Canvas-based Rendering**: 60fps with ~10k points
- **Smooth Interpolation**: Camera movements use lerp for smoothness

### Browser Compatibility

- Modern browsers with Canvas API support
- Tested on Chrome, Firefox, Safari, Edge
- Mobile responsive (touch support included)

### Data Format

The `data.json` file structure:

```json
{
  "points": [
    {
      "id": 0,
      "x": 1.2345,
      "y": -5.6789,
      "prompt": "a cat wearing a hat..."
    }
  ],
  "bounds": {
    "minX": -100,
    "maxX": 100,
    "minY": -67.42,
    "maxY": 67.42
  }
}
```

Coordinates are normalized to approximately [-100, 100] range while maintaining aspect ratio.

## Customization

### Adjust LOD Thresholds

Edit `js/map.js` lines 233-236:

```javascript
this.LOD_DOT_THRESHOLD = 0.1;
this.LOD_SMALL_THRESHOLD = 0.4;
this.LOD_MEDIUM_THRESHOLD = 1.2;
```

### Change Color Scheme

Edit `css/style.css` color variables:

```css
background: #0a0a0a;  /* Main background */
--primary: #6366f1;   /* Accent color */
```

### Modify Search Results Limit

Edit `js/search.js` line 13:

```javascript
this.maxResults = 100;
```

## Credits

Built with vanilla JavaScript, no framework dependencies. Uses Canvas API for rendering and custom quadtree implementation for spatial indexing.

## License

MIT License - feel free to use and modify for your projects.