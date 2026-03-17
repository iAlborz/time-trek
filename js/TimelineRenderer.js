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
        this._drawDurationBars(state);

        // Timeline base line
        ctx.strokeStyle = '#666666';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, timelineY);
        ctx.lineTo(width, timelineY);
        ctx.stroke();

        // Events
        this._drawEvents(state);

        // Markers
        this._drawMarkers(state.markers, timelineY, ctx, state.currentScale);

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
        ctx.fillStyle = '#666666';
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

    _drawMarkers(markers, timelineY, ctx, currentScale) {
        markers.forEach(marker => {
            const animState = marker.animationState;
            if (animState && (animState.scale <= 0 || animState.opacity <= 0)) return;

            if (animState) {
                ctx.save();
                ctx.globalAlpha = animState.opacity;
                ctx.translate(marker.x, timelineY);
                ctx.scale(animState.scale, animState.scale);
                ctx.translate(-marker.x, -timelineY);
            }

            const markerType = marker.markerType || 'primary';

            if (markerType === 'secondary') {
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 0.5;
                ctx.beginPath();
                ctx.moveTo(marker.x, timelineY - 10);
                ctx.lineTo(marker.x, timelineY + 10);
                ctx.stroke();
            } else if (markerType === 'tertiary') {
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(marker.x, timelineY - 20);
                ctx.lineTo(marker.x, timelineY + 20);
                ctx.stroke();
            } else {
                // Primary
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(marker.x, timelineY - 20);
                ctx.lineTo(marker.x, timelineY + 20);
                ctx.stroke();

                const label = marker.scale.formatLabel(marker.date, marker.actualYear !== undefined ? marker.actualYear : null);
                ctx.fillStyle = '#333333';
                ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(label, marker.x, timelineY - 25);
            }

            if (animState) {
                ctx.restore();
            }
        });
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
