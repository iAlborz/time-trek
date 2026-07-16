// TimelineData.js — Data model, CSV parsing, item hierarchy, layout, hit testing

import { parseDate, MS_PER_DAY } from './DateParser.js';

export class TimelineData {
    constructor() {
        this.items = [];
        this.itemsById = new Map();
        this.expandedItems = new Set();
        this.itemLayout = new Map();

        // Duration bar styling
        this.durationBarHeight = 28;
        this.durationBarSpacing = 5;

        // Horizontal footprint used when packing items into rows
        this.barGapX = 8;            // minimum gap so neighbours read as separate items
        this.eventGutterLeft = 30;   // an event's pencil hangs off the left of its dot
        this.eventLabelOffset = 12;  // gap between an event dot and its label
        this.eventLabelFont = '10px -apple-system, BlinkMacSystemFont, sans-serif';
        this._labelWidths = new Map();
    }

    // ── CSV Parsing ────────────────────────────────────────────────────────────

    parseCSVData(csvText, referenceDate) {
        const lines = csvText.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

        const requiredHeaders = ['item name', 'type', 'start date'];
        const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
        if (missingHeaders.length > 0) {
            throw new Error(`Missing required CSV headers: ${missingHeaders.join(', ')}`);
        }

        const items = [];
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            if (values.length === 0) continue;

            const item = {};
            headers.forEach((header, index) => {
                item[header] = values[index] || '';
            });

            const processedItem = this.processCSVItem(item, referenceDate);
            if (processedItem) items.push(processedItem);
        }

        this.setItems(items);
        return items;
    }

    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    }

    _generateId() {
        return crypto.randomUUID ? crypto.randomUUID()
            : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }

    processCSVItem(csvItem, referenceDate) {
        const name = csvItem['item name'];
        const type = csvItem['type'].toLowerCase();
        if (!name || !type) return null;

        const item = {
            id: this._generateId(),
            name,
            type,
            _parentName: csvItem['parent item'] || null,  // resolved in setItems
            parentId: null,
            notes: csvItem['notes'] || '',
            level: 0,
            children: []
        };

        if (type === 'duration') {
            item.startDate = parseDate(csvItem['start date'], referenceDate);
            item._startDateStr = csvItem['start date'] || '';
            item.endDate = csvItem['end date'] ? parseDate(csvItem['end date'], referenceDate) : null;
            item._endDateStr = csvItem['end date'] || '';
            if (!item.startDate) {
                console.warn(`Invalid start date for duration item: ${name}`);
                return null;
            }
        } else if (type === 'event') {
            item.date = parseDate(csvItem['start date'], referenceDate);
            item._startDateStr = csvItem['start date'] || '';
            if (!item.date) {
                console.warn(`Invalid date for event item: ${name}`);
                return null;
            }
        }

        return item;
    }

    // ── Serialization ────────────────────────────────────────────────────────────

    loadFromSerializedItems(storedItems, referenceDate) {
        const items = [];
        for (const stored of storedItems) {
            const csvItem = {
                'item name': stored.name,
                'type': stored.type,
                'start date': stored.startDate || '',
                'end date': stored.endDate || '',
                'parent item': stored.parentName || '',
                'notes': stored.notes || ''
            };

            // Handle __offset: deep-time format
            const processedItem = this._processSerializedItem(csvItem, referenceDate);
            if (processedItem) items.push(processedItem);
        }
        this.setItems(items);
        return items;
    }

    _processSerializedItem(csvItem, referenceDate) {
        const name = csvItem['item name'];
        const type = csvItem['type'].toLowerCase();
        if (!name || !type) return null;

        const item = {
            id: this._generateId(),
            name,
            type,
            _parentName: csvItem['parent item'] || null,  // resolved in setItems
            parentId: null,
            notes: csvItem['notes'] || '',
            level: 0,
            children: []
        };

        const parseStoredDate = (dateStr) => {
            if (!dateStr) return null;
            // Handle __offset: deep-time format
            if (dateStr.startsWith('__offset:')) {
                const offset = parseFloat(dateStr.slice(9));
                return { date: null, dayOffset: offset };
            }
            return parseDate(dateStr, referenceDate);
        };

        if (type === 'duration') {
            item.startDate = parseStoredDate(csvItem['start date']);
            item._startDateStr = csvItem['start date'] || '';
            item.endDate = parseStoredDate(csvItem['end date']);
            item._endDateStr = csvItem['end date'] || '';
            if (!item.startDate) return null;
        } else if (type === 'event') {
            item.date = parseStoredDate(csvItem['start date']);
            item._startDateStr = csvItem['start date'] || '';
            if (!item.date) return null;
        }

        return item;
    }

    // ── Hierarchy ──────────────────────────────────────────────────────────────

    setItems(items) {
        this.items = items;
        this.itemsById.clear();

        // Build ID map
        items.forEach(item => this.itemsById.set(item.id, item));

        // Build name→item map for parent resolution
        const byName = new Map();
        items.forEach(item => byName.set(item.name, item));

        // Resolve parent relationships
        items.forEach(item => {
            item.children = [];

            // If _parentName is set (from CSV/serialized), resolve to parentId
            if (item._parentName && !item.parentId) {
                const parent = byName.get(item._parentName);
                if (parent) {
                    item.parentId = parent.id;
                } else {
                    console.warn(`Parent not found for item: ${item.name}, looking for: "${item._parentName}"`);
                    item._parentName = null;
                }
            }
            delete item._parentName;  // clean up transient field

            if (item.parentId) {
                const parent = this.itemsById.get(item.parentId);
                if (parent) {
                    parent.children.push(item);
                    item.level = parent.level + 1;
                } else {
                    console.warn(`Parent ID not found for item: ${item.name}`);
                    item.parentId = null;
                    item.level = 0;
                }
            } else {
                item.level = 0;
            }
        });

        this.calculateImplicitEndDates();
    }

    calculateImplicitEndDates() {
        const calc = (item) => {
            if (item.type === 'duration' && !item.endDate && item.children.length > 0) {
                let latestOffset = -Infinity;
                let latestDate = null;

                item.children.forEach(child => {
                    calc(child);
                    const childEnd = child.type === 'duration' ? child.endDate : child.date;
                    if (childEnd) {
                        if (childEnd.dayOffset > latestOffset) {
                            latestOffset = childEnd.dayOffset;
                            latestDate = childEnd;
                        }
                    }
                });

                if (latestDate) {
                    item.endDate = latestDate;
                }
            }
        };

        this.items.filter(item => item.level === 0).forEach(calc);
    }

    // Zoom and offset that bring every item in the project on screen. Spans all
    // items, not just expanded ones, so collapsed branches still count. Returns null
    // when there's nothing to frame.
    getFitViewState(viewportWidth) {
        let min = Infinity;
        let max = -Infinity;

        this.items.forEach(item => {
            const start = item.type === 'duration' ? item.startDate : item.date;
            const end = item.type === 'duration' ? (item.endDate || item.startDate) : item.date;
            if (start) min = Math.min(min, start.dayOffset);
            if (end) max = Math.max(max, end.dayOffset);
        });

        if (!isFinite(min) || !isFinite(max)) return null;

        const span = Math.max(max - min, 1) * 1.15;   // 15% breathing room
        return {
            zoom: viewportWidth / span,   // zoom is pixels per day
            offset: (min + max) / 2       // offset is the day at screen centre
        };
    }

    getVisibleItems() {
        const visible = [];
        const addRecursive = (item) => {
            visible.push(item);
            if (this.expandedItems.has(item.id)) {
                item.children.forEach(addRecursive);
            }
        };
        this.items.filter(item => item.level === 0).forEach(addRecursive);
        return visible;
    }

    toggleItemExpansion(itemId) {
        if (this.expandedItems.has(itemId)) {
            this.expandedItems.delete(itemId);
        } else {
            this.expandedItems.add(itemId);
        }
    }

    // ── Layout ─────────────────────────────────────────────────────────────────

    calculateLayout(zoom, offset, centerDate, canvasWidth, canvasHeight) {
        this.itemLayout.clear();

        const pixelsPerDay = zoom;
        const centerX = canvasWidth / 2;
        const timelineY = 100;
        const centerTime = centerDate.getTime();

        const visibleItems = this.getVisibleItems();
        const firstRowY = timelineY + 50;
        const rowPitch = this.durationBarHeight + this.durationBarSpacing;

        // Pack items into rows: each takes the topmost row where its horizontal
        // footprint is free, rather than every item claiming a row of its own and
        // marching off the bottom of the screen. Siblings that don't overlap in time
        // share a row.
        //
        // Two invariants:
        //  - an item never sits above its parent, even when a free gap exists up
        //    there, or the nesting would read backwards
        //  - one pass in hierarchy order, so a parent always has a row before its
        //    children ask for one — whatever their types
        const rows = [];   // rows[i] = occupied [left, right] spans, in screen px

        const claimRow = (left, right, startRow) => {
            for (let i = Math.max(startRow, 0); i < rows.length; i++) {
                const collides = rows[i].some(span => left < span.right && right > span.left);
                if (!collides) {
                    rows[i].push({ left, right });
                    return i;
                }
            }
            // Nothing free at or below startRow — open a new row beneath everything
            while (rows.length < startRow) rows.push([]);
            rows.push([{ left, right }]);
            return rows.length - 1;
        };

        visibleItems.forEach(item => {
            let layout;
            let left;
            let right;

            if (item.type === 'duration') {
                layout = this._calcDurationPosition(item, centerX, pixelsPerDay, offset, centerTime);
                if (!layout) return;
                // The pencil sits inside the bar, so only a gap is reserved — bars
                // need one or they read as a single continuous run.
                left = layout.x - this.barGapX;
                right = layout.x + layout.width + this.barGapX;
            } else if (item.type === 'event') {
                layout = this._calcEventPosition(item, centerX, pixelsPerDay, offset, centerTime);
                if (!layout) return;
                // Dot plus its label to the right, and the pencil hanging off the left
                left = layout.x - this.eventGutterLeft;
                right = layout.x + this.eventLabelOffset + this._measureLabel(item.name) + this.barGapX;
            } else {
                return;
            }

            // The row is stored rather than derived back out of y: events sit centred
            // in their row, so y alone doesn't round-trip cleanly.
            const parentLayout = item.parentId ? this.itemLayout.get(item.parentId) : null;
            const row = claimRow(left, right, parentLayout ? parentLayout.row + 1 : 0);

            layout.row = row;
            layout.y = firstRowY + row * rowPitch;
            if (item.type === 'duration') {
                layout.height = this.durationBarHeight;
            } else {
                layout.y += this.durationBarHeight / 2;   // centre the dot in its row
            }
            this.itemLayout.set(item.id, layout);
        });
    }

    _calcDurationPosition(item, centerX, pixelsPerDay, offset, centerTime) {
        if (item.type !== 'duration' || !item.startDate) return null;

        let startDayOffset;
        if (item.startDate.date) {
            startDayOffset = (item.startDate.date.getTime() - centerTime) / MS_PER_DAY;
        } else {
            startDayOffset = item.startDate.dayOffset;
        }
        const startX = centerX + (startDayOffset - offset) * pixelsPerDay;

        let endX = startX + 100;
        if (item.endDate) {
            let endDayOffset;
            if (item.endDate.date) {
                endDayOffset = (item.endDate.date.getTime() - centerTime) / MS_PER_DAY;
            } else {
                endDayOffset = item.endDate.dayOffset;
            }
            endX = centerX + (endDayOffset - offset) * pixelsPerDay;
        }

        const width = Math.max(endX - startX, 20);
        return { x: startX, width };
    }

    _calcEventPosition(item, centerX, pixelsPerDay, offset, centerTime) {
        if (item.type !== 'event' || !item.date) return null;

        let dayOffset;
        if (item.date.date) {
            dayOffset = (item.date.date.getTime() - centerTime) / MS_PER_DAY;
        } else {
            dayOffset = item.date.dayOffset;
        }

        // y is assigned by the row packer in calculateLayout
        return { x: centerX + (dayOffset - offset) * pixelsPerDay, y: 0, width: 8, height: 8, type: 'event' };
    }

    // Packing needs an event's label width, and the label is the wide part of its
    // footprint. Measured rather than estimated, and cached — names rarely change.
    _measureLabel(text) {
        if (this._labelWidths.has(text)) return this._labelWidths.get(text);
        if (!this._measureCtx) {
            this._measureCtx = document.createElement('canvas').getContext('2d');
            this._measureCtx.font = this.eventLabelFont;
        }
        const width = this._measureCtx.measureText(text).width;
        this._labelWidths.set(text, width);
        return width;
    }
}
