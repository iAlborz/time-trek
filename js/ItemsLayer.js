// ItemsLayer.js — Renders timeline items as DOM elements over the canvas.
//
// The canvas still draws the axis (dense tick marks, redrawn every frame, nothing
// to inspect or read aloud). Items are elements so they can be styled with the
// design tokens, reached by screen readers, and hit-tested by the browser.
//
// Positions come from the same TimelineData.itemLayout the canvas renderer used,
// so this is a change of output medium, not of layout maths.

const PENCIL_TOTAL = 22;     // matches the canvas renderer's pencil offset
const BAR_RADIUS = 20;

// Browsers cap element size around 33.5M px, and this app zooms to 2400 px/day —
// a 42-year bar computes to ~36.8M px wide, past the cap. Canvas didn't care since
// it just drew off into nowhere. So clamp to the viewport (plus a margin, so the
// clamp is never visible) and remember which ends were cut.
const CLAMP_PAD = 200;

export class ItemsLayer {
    constructor(host) {
        this.host = host;
        this.nodes = new Map();   // item id -> { bar, pencil } | { dot, pencil }
        this._seen = new Set();
    }

    render(state) {
        const vw = window.innerWidth;
        this._seen.clear();
        const order = [];
        let structureChanged = false;

        for (const [itemId, layout] of state.itemLayout) {
            const item = state.itemsById.get(itemId);
            if (!item) continue;

            const existed = this.nodes.has(itemId);
            if (item.type === 'duration') {
                if (layout.x + layout.width < -CLAMP_PAD || layout.x > vw + CLAMP_PAD) continue;
                this._renderBar(item, layout, state, vw);
            } else if (item.type === 'event') {
                if (layout.x < -50 || layout.x > vw + 50) continue;
                this._renderEvent(item, layout, vw);
            } else {
                continue;
            }
            if (!existed) structureChanged = true;
            order.push(itemId);
            this._seen.add(itemId);
        }

        // Drop anything that scrolled out of range or was deleted
        for (const [id, node] of this.nodes) {
            if (this._seen.has(id)) continue;
            Object.values(node).forEach(el => el && el.remove());
            this.nodes.delete(id);
            structureChanged = true;
        }

        // Nodes are created as items scroll into view, so DOM order drifts from the
        // hierarchy. Tab order follows DOM order, so re-sort — but only when the set
        // actually changed, not on every pan frame.
        if (structureChanged) this._reorder(order);
    }

    // Pencil before bar, matching how they read left-to-right on screen
    _reorder(order) {
        const seq = [];
        for (const id of order) {
            const node = this.nodes.get(id);
            if (!node) continue;
            if (node.pencil) seq.push(node.pencil);
            if (node.bar) seq.push(node.bar);
            if (node.dot) seq.push(node.dot);
        }
        if (seq.length) this.host.append(...seq);
    }

    _renderBar(item, layout, state, vw) {
        let node = this.nodes.get(item.id);
        if (!node || !node.bar) {
            const bar = document.createElement('div');
            bar.className = 'tl-bar';
            bar.innerHTML =
                '<button type="button" class="tl-chevron">' +
                '<svg viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.5" ' +
                'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                '<path d="M2.5 1 5.5 4 2.5 7"/></svg>' +
                '</button><span class="tl-name" aria-hidden="true"></span>';
            const pencil = this._makePencil();
            bar.dataset.itemId = item.id;
            pencil.dataset.itemId = item.id;
            this.host.append(bar, pencil);
            node = { bar, pencil };
            this.nodes.set(item.id, node);
        }
        const { bar, pencil } = node;

        const left = Math.max(layout.x, -CLAMP_PAD);
        const right = Math.min(layout.x + layout.width, vw + CLAMP_PAD);
        const width = Math.max(right - left, 0);

        // Only round the ends that are genuinely the bar's ends — a clamped end
        // would otherwise look like the bar stops at the edge of the screen.
        const roundL = layout.x >= -CLAMP_PAD ? BAR_RADIUS : 0;
        const roundR = layout.x + layout.width <= vw + CLAMP_PAD ? BAR_RADIUS : 0;

        this._setStyle(bar, 'transform', `translate(${left}px, ${layout.y}px)`);
        this._setStyle(bar, 'width', `${width}px`);
        this._setStyle(bar, 'height', `${layout.height}px`);
        this._setStyle(bar, 'borderRadius', `${roundL}px ${roundR}px ${roundR}px ${roundL}px`);
        this._setAttr(bar, 'data-level', String(item.level % 6));

        const hasKids = item.children.length > 0;
        const expanded = state.expandedItems.has(item.id);
        const chevron = bar.firstChild;
        this._setAttr(chevron, 'data-state', hasKids ? (expanded ? 'expanded' : 'collapsed') : 'none');
        // The button is 14px wide for a usable hit target; offset so the glyph still
        // centres on x+10, where the canvas drew it.
        this._setStyle(chevron, 'left', `${layout.x - left + 3}px`);
        if (hasKids) {
            this._setAttr(chevron, 'aria-expanded', String(expanded));
            this._setAttr(chevron, 'aria-label', this._describe(item));
        }

        const label = bar.lastChild;
        // Text sits at the bar's true left, so a clamped bar's label stays off-screen
        // exactly as the canvas drew it.
        this._setStyle(label, 'left', `${layout.x - left + (hasKids ? 18 : 5)}px`);
        if (label.textContent !== item.name) label.textContent = item.name;

        this._setAttr(pencil, 'aria-label', `Edit ${this._describe(item)}`);
        this._placePencil(pencil, layout.x, layout.y + layout.height / 2, vw);
    }

    _renderEvent(item, layout, vw) {
        let node = this.nodes.get(item.id);
        if (!node || !node.dot) {
            const dot = document.createElement('div');
            dot.className = 'tl-event';
            dot.innerHTML = '<span class="tl-event-name"></span>';
            const pencil = this._makePencil();
            dot.dataset.itemId = item.id;
            pencil.dataset.itemId = item.id;
            this.host.append(dot, pencil);
            node = { dot, pencil };
            this.nodes.set(item.id, node);
        }
        const { dot, pencil } = node;

        this._setStyle(dot, 'transform', `translate(${layout.x}px, ${layout.y}px)`);
        this._setAttr(dot, 'data-level', String(item.level % 6));

        const label = dot.firstChild;
        if (label.textContent !== item.name) label.textContent = item.name;

        this._setAttr(pencil, 'aria-label', `Edit ${this._describe(item)}`);
        this._placePencil(pencil, layout.x, layout.y, vw);
    }

    // Screen-reader description. The visible name is aria-hidden and may be clipped
    // by a narrow bar, so the dates go here where they're always available.
    _describe(item) {
        const start = item._startDateStr || '';
        if (item.type === 'duration') {
            const end = item._endDateStr;
            const when = end ? `${start} to ${end}` : `from ${start}`;
            return `${item.name}, duration, ${when}`;
        }
        return `${item.name}, event, ${start}`;
    }

    _makePencil() {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'tl-pencil';
        el.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352' +
            'a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>';
        return el;
    }

    _placePencil(pencil, itemX, centerY, vw) {
        const x = itemX - PENCIL_TOTAL;
        const offscreen = x < -PENCIL_TOTAL || x > vw;
        this._setStyle(pencil, 'display', offscreen ? 'none' : '');
        if (offscreen) return;
        this._setStyle(pencil, 'transform', `translate(${x}px, ${centerY}px)`);
    }

    // Writing an identical value still dirties style; skip it to keep frames cheap
    _setStyle(el, prop, value) {
        if (el.style[prop] !== value) el.style[prop] = value;
    }

    _setAttr(el, name, value) {
        if (el.getAttribute(name) !== value) el.setAttribute(name, value);
    }

    clear() {
        this.nodes.forEach(node => Object.values(node).forEach(el => el && el.remove()));
        this.nodes.clear();
    }
}
