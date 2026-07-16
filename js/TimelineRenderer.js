// TimelineRenderer.js — All canvas drawing operations (stateless)

// Pencil icon dimensions
const PENCIL_SIZE = 14;
const PENCIL_PAD = 4;
const PENCIL_TOTAL = PENCIL_SIZE + PENCIL_PAD * 2;

export { PENCIL_SIZE, PENCIL_PAD, PENCIL_TOTAL };

export class TimelineRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.devicePixelRatio = 1;
        this.pencilImg = null;
        // Items are drawn by ItemsLayer as DOM now; the canvas keeps the axis.
        // The item-drawing code below stays until the DOM layer is proven at both
        // zoom extremes, so this can be flipped back in one line.
        this.drawItems = false;
        this._loadPencilIcon();
        this.setupCanvas();
    }

    _loadPencilIcon() {
        const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%23aaaaaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>`;
        const img = new Image();
        img.src = 'data:image/svg+xml,' + svgMarkup;
        img.onload = () => { this.pencilImg = img; };
    }

    setupCanvas() {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.style.width = window.innerWidth + 'px';
        this.canvas.style.height = window.innerHeight + 'px';
        this.canvas.width = window.innerWidth * dpr;
        this.canvas.height = window.innerHeight * dpr;
        this.ctx.scale(dpr, dpr);
        this.devicePixelRatio = dpr;
    }

    draw(state) {
        const ctx = this.ctx;
        const width = window.innerWidth;
        const height = window.innerHeight;
        const timelineY = 100;

        // Clear
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Duration bars (below timeline)
        if (this.drawItems) this._drawDurationBars(state);

        // Timeline base line
        ctx.strokeStyle = '#d0d0d0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, timelineY);
        ctx.lineTo(width, timelineY);
        ctx.stroke();

        // Events
        if (this.drawItems) this._drawEvents(state);

        // Markers
        this._drawMarkers(state.markers, timelineY, ctx, state.currentScale, state.scales);

        // Center indicator
        ctx.strokeStyle = '#FF6B6B';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(width / 2, timelineY - 20);
        ctx.lineTo(width / 2, timelineY + 20);
        ctx.stroke();

        // Center date label
        ctx.fillStyle = '#FF6B6B';
        ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(state.formattedCenterDate, width / 2, timelineY + 40);

        // Zoom info
        ctx.fillStyle = '#aaaaaa';
        ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`Zoom: ${state.zoom.toFixed(3)}x`, 10, 20);
        ctx.fillText(`Scale: ${state.currentScale.unit}`, 10, 35);

        // Big Bang indicator
        if (state.offset <= -state.bigBangLimitDays * 0.9) {
            ctx.fillStyle = '#FF6B6B';
            ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('◄── Big Bang (13.8B years ago)', width / 2, timelineY - 30);
        }
    }

    _drawMarkers(markers, timelineY, ctx, currentScale, scales) {
        // Build scale→index map for alternating label placement
        const scaleIndexMap = new Map();
        if (scales) {
            scales.forEach((s, i) => scaleIndexMap.set(s.unit, i));
        }

        // Track rightmost label edge per scale (above) and per scale (below)
        // to prevent overlapping labels
        const labelRightEdge = new Map(); // scale.unit → rightmost x edge
        const LABEL_PAD = 8; // minimum gap between labels in px

        // Pass 1: draw all tick lines
        markers.forEach(marker => {
            const animState = marker.animationState;
            const blend = animState ? animState.opacity : 1;
            if (blend <= 0.01) return;

            ctx.save();
            ctx.globalAlpha = blend;

            const halfH = 4 + 10 * blend;
            const lineWidth = 0.5 + 0.5 * blend;
            const gray = Math.round(170 - 50 * blend);
            const tickColor = `rgb(${gray},${gray},${gray})`;

            ctx.strokeStyle = tickColor;
            ctx.lineWidth = lineWidth;
            ctx.beginPath();
            ctx.moveTo(marker.x, timelineY - halfH);
            ctx.lineTo(marker.x, timelineY + halfH);
            ctx.stroke();

            ctx.restore();
        });

        // Pass 2: draw labels with priority-based overlap culling
        // Important markers (12AM, Jan, round years) get placed first,
        // then less important ones fill remaining space.
        const markersByScale = new Map();
        markers.forEach(marker => {
            const blend = marker.animationState ? marker.animationState.opacity : 1;
            if (blend <= 0.25) return;
            const unit = marker.scale.unit;
            if (!markersByScale.has(unit)) markersByScale.set(unit, []);
            markersByScale.get(unit).push(marker);
        });

        for (const [unit, scaleMarkers] of markersByScale) {
            const scaleIdx = scaleIndexMap.get(unit) || 0;
            const isAbove = scaleIdx % 2 === 0;

            // Compute label info for each marker
            const labelInfos = scaleMarkers.map(marker => {
                const blend = marker.animationState ? marker.animationState.opacity : 1;
                const halfH = 4 + 10 * blend;
                const label = marker.scale.formatLabel(marker.date, marker.actualYear !== undefined ? marker.actualYear : null);
                const fontSize = 10 + Math.round(blend);
                ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
                const textWidth = ctx.measureText(label).width;
                const priority = this._getMarkerPriority(marker);

                return { marker, blend, halfH, label, fontSize, textWidth,
                         left: marker.x - textWidth / 2,
                         right: marker.x + textWidth / 2,
                         priority };
            });

            // Sort by priority (lowest = most important), then by x for tiebreak
            labelInfos.sort((a, b) => a.priority - b.priority || a.marker.x - b.marker.x);

            // Place labels greedily by priority: most important first
            const placed = []; // array of { left, right } of placed labels

            const overlapsAny = (left, right) => {
                for (const p of placed) {
                    if (left < p.right + LABEL_PAD && right > p.left - LABEL_PAD) return true;
                }
                return false;
            };

            for (const info of labelInfos) {
                if (overlapsAny(info.left, info.right)) continue;
                placed.push({ left: info.left, right: info.right });
                info.show = true;
            }

            // Draw placed labels (in x order for consistent rendering)
            const toRender = labelInfos.filter(i => i.show).sort((a, b) => a.marker.x - b.marker.x);
            for (const info of toRender) {
                ctx.save();
                const labelOpacity = Math.min((info.blend - 0.25) / 0.35, 1);
                ctx.globalAlpha = info.blend * labelOpacity;
                ctx.fillStyle = '#888888';
                ctx.font = `${info.fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
                ctx.textAlign = 'center';

                if (isAbove) {
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(info.label, info.marker.x, timelineY - info.halfH - 4);
                } else {
                    ctx.textBaseline = 'top';
                    ctx.fillText(info.label, info.marker.x, timelineY + info.halfH + 4);
                }
                ctx.restore();
            }
        }
    }

    // Priority for label placement: lower = more important = placed first
    // Ensures meaningful anchors (12AM, Jan, round years) always show
    _getMarkerPriority(marker) {
        const unit = marker.scale.unit;
        const date = marker.date;
        const year = marker.actualYear !== undefined ? marker.actualYear : (date ? date.getFullYear() : 0);

        if (unit === 'hour') {
            const h = date ? date.getHours() : 0;
            if (h === 0) return 0;        // 12 AM (midnight)
            if (h === 12) return 1;       // 12 PM (noon)
            if (h % 6 === 0) return 2;    // 6 AM, 6 PM
            if (h % 3 === 0) return 3;    // 3, 9 AM/PM
            if (h % 2 === 0) return 4;    // even hours
            return 5;                      // odd hours
        }

        if (unit === 'day') {
            const d = date ? date.getDate() : 1;
            if (d === 1) return 0;         // 1st of month
            if (d === 15) return 1;        // mid-month
            if (d % 7 === 1) return 2;     // ~weekly (8th, 22nd)
            return 3;
        }

        if (unit === 'week') {
            const d = date ? date.getDate() : 1;
            if (d <= 7) return 0;          // first week of month
            return 1;
        }

        if (unit === 'month') {
            const m = date ? date.getMonth() : 0;
            if (m === 0) return 0;         // January
            if (m === 6) return 1;         // July (half year)
            if (m % 3 === 0) return 2;     // Apr, Oct (quarter starts)
            if (m % 2 === 0) return 3;     // Mar, May, Sep, Nov (every other)
            return 4;                       // Feb, Jun, Aug, Dec
        }

        if (unit === 'quarter') {
            const m = date ? date.getMonth() : 0;
            const q = Math.floor(m / 3);
            if (q === 0) return 0;         // Q1
            if (q === 2) return 1;         // Q3 (half year)
            return 2;                       // Q2, Q4
        }

        // Year-based scales: prefer round numbers
        if (unit === 'year') {
            if (year % 10 === 0) return 0;
            if (year % 5 === 0) return 1;
            if (year % 2 === 0) return 2;
            return 3;
        }

        if (unit === 'decade') {
            const decade = Math.floor(year / 10) * 10;
            if (decade % 100 === 0) return 0;
            if (decade % 50 === 0) return 1;
            if (decade % 20 === 0) return 2;
            return 3;
        }

        if (unit === 'century') {
            const century = Math.floor(year / 100) * 100;
            if (century % 1000 === 0) return 0;
            if (century % 500 === 0) return 1;
            if (century % 200 === 0) return 2;
            return 3;
        }

        // Large scales: prefer rounder multiples
        const stepYears = marker.scale.stepYears || 1;
        const normalizedYear = Math.abs(year / stepYears);
        if (normalizedYear % 10 === 0) return 0;
        if (normalizedYear % 5 === 0) return 1;
        if (normalizedYear % 2 === 0) return 2;
        return 3;
    }

    // Draw pencil icon from Lucide SVG at (cx, cy) centered
    _drawPencilIcon(ctx, cx, cy, size) {
        if (!this.pencilImg) return;
        ctx.drawImage(this.pencilImg, cx - size / 2, cy - size / 2, size, size);
    }

    _drawDurationBars(state) {
        const ctx = this.ctx;
        const durationBarRadius = 20;
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
        const canvasWidth = window.innerWidth;

        for (const [itemId, layout] of state.itemLayout) {
            const item = state.itemsById.get(itemId);
            if (!item || item.type !== 'duration') continue;
            if (layout.x + layout.width < 0 || layout.x > canvasWidth) continue;

            const color = colors[item.level % colors.length];

            // Edit pencil icon (left of the bar)
            const pencilX = layout.x - PENCIL_TOTAL;
            const pencilY = layout.y + layout.height / 2;
            this._drawPencilIcon(ctx, pencilX, pencilY, PENCIL_SIZE);

            ctx.fillStyle = color;
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(layout.x, layout.y, layout.width, layout.height, durationBarRadius);
            } else {
                ctx.rect(layout.x, layout.y, layout.width, layout.height);
            }
            ctx.fill();

            // Chevron + Item name
            ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.textBaseline = 'middle';
            const barCenterY = layout.y + layout.height / 2;
            let textStartX = layout.x + 5;

            // Draw chevron on the left side of the title if item has children
            if (item.children.length > 0) {
                const chevronX = layout.x + 10;
                const chevronY = barCenterY;
                const isExpanded = state.expandedItems.has(item.id);
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 1.5;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                if (isExpanded) {
                    // Down chevron ▾
                    ctx.moveTo(chevronX - 4, chevronY - 2);
                    ctx.lineTo(chevronX, chevronY + 2);
                    ctx.lineTo(chevronX + 4, chevronY - 2);
                } else {
                    // Right chevron ▸
                    ctx.moveTo(chevronX - 2, chevronY - 4);
                    ctx.lineTo(chevronX + 2, chevronY);
                    ctx.lineTo(chevronX - 2, chevronY + 4);
                }
                ctx.stroke();
                textStartX = chevronX + 8; // push text right of chevron
            }

            const textWidth = ctx.measureText(item.name).width;
            if (layout.width > textStartX - layout.x + textWidth + 5) {
                ctx.fillStyle = '#333';
                ctx.textAlign = 'left';
                ctx.fillText(item.name, textStartX, barCenterY);
            }
        }
    }

    _drawEvents(state) {
        const ctx = this.ctx;
        const colors = ['#D63031', '#00B894', '#0984E3', '#6C5CE7', '#FDCB6E', '#E84393'];
        const canvasWidth = window.innerWidth;

        for (const [itemId, layout] of state.itemLayout) {
            const item = state.itemsById.get(itemId);
            if (!item || item.type !== 'event') continue;
            if (layout.x < -50 || layout.x > canvasWidth + 50) continue;

            const color = colors[item.level % colors.length];

            // Edit pencil icon (left of the dot)
            const pencilX = layout.x - PENCIL_TOTAL;
            const pencilY = layout.y;
            this._drawPencilIcon(ctx, pencilX, pencilY, PENCIL_SIZE);

            // Dot
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(layout.x, layout.y, 4, 0, 2 * Math.PI);
            ctx.fill();

            // Label
            ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            const labelX = layout.x + 8;
            const labelY = layout.y;

            const textMetrics = ctx.measureText(item.name);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fillRect(labelX - 2, labelY - 6, textMetrics.width + 4, 12);

            ctx.fillStyle = '#333';
            ctx.fillText(item.name, labelX, labelY);
        }
    }
}
