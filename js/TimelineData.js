// TimelineData.js — Data model, CSV parsing, item hierarchy, layout, hit testing

import { parseDate, MS_PER_DAY } from './DateParser.js';
import { PENCIL_TOTAL, PENCIL_SIZE } from './TimelineRenderer.js';

export class TimelineData {
    constructor() {
        this.items = [];
        this.itemsById = new Map();
        this.expandedItems = new Set();
        this.itemLayout = new Map();

        // Duration bar styling
        this.durationBarHeight = 20;
        this.durationBarSpacing = 5;
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

    processCSVItem(csvItem, referenceDate) {
        const name = csvItem['item name'];
        const type = csvItem['type'].toLowerCase();
        if (!name || !type) return null;

        const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');

        const item = {
            id,
            name,
            type,
            parentId: csvItem['parent item']
                ? csvItem['parent item'].toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')
                : null,
            notes: csvItem['notes'] || '',
            level: 0,
            children: []
        };

        if (type === 'duration') {
            item.startDate = parseDate(csvItem['start date'], referenceDate);
            item.endDate = csvItem['end date'] ? parseDate(csvItem['end date'], referenceDate) : null;
            if (!item.startDate) {
                console.warn(`Invalid start date for duration item: ${name}`);
                return null;
            }
        } else if (type === 'event') {
            item.date = parseDate(csvItem['start date'], referenceDate);
            if (!item.date) {
                console.warn(`Invalid date for event item: ${name}`);
                return null;
            }
        }

        return item;
    }

    // ── Hierarchy ──────────────────────────────────────────────────────────────

    setItems(items) {
        this.items = items;
        this.itemsById.clear();

        items.forEach(item => this.itemsById.set(item.id, item));

        items.forEach(item => {
            item.children = [];
            if (item.parentId) {
                const parent = this.itemsById.get(item.parentId);
                if (parent) {
                    parent.children.push(item);
                    item.level = parent.level + 1;
                } else {
                    console.warn(`Parent not found for item: ${item.name}, looking for parent ID: ${item.parentId}`);
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
        let currentY = timelineY + 50;

        // Duration bars
        visibleItems.forEach(item => {
            if (item.type === 'duration') {
                const layout = this._calcDurationPosition(item, centerX, pixelsPerDay, offset, centerTime);
                if (layout) {
                    layout.y = currentY;
                    layout.height = this.durationBarHeight;
                    this.itemLayout.set(item.id, layout);
                    currentY += this.durationBarHeight + this.durationBarSpacing;
                }
            }
        });

        // Events
        const eventCountByParent = new Map();
        visibleItems.forEach(item => {
            if (item.type === 'event') {
                const parentId = item.parentId || 'root';
                const count = eventCountByParent.get(parentId) || 0;
                eventCountByParent.set(parentId, count + 1);

                const layout = this._calcEventPosition(item, centerX, pixelsPerDay, offset, centerTime, timelineY, count);
                if (layout) {
                    this.itemLayout.set(item.id, layout);
                }
            }
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

    _calcEventPosition(item, centerX, pixelsPerDay, offset, centerTime, timelineY, eventIndex) {
        if (item.type !== 'event' || !item.date) return null;

        let dayOffset;
        if (item.date.date) {
            dayOffset = (item.date.date.getTime() - centerTime) / MS_PER_DAY;
        } else {
            dayOffset = item.date.dayOffset;
        }
        const x = centerX + (dayOffset - offset) * pixelsPerDay;

        let parentY = timelineY;
        if (item.parentId) {
            const parentLayout = this.itemLayout.get(item.parentId);
            if (parentLayout) {
                parentY = parentLayout.y + parentLayout.height + 10 + (eventIndex * 15);
            }
        }

        return { x, y: parentY, width: 8, height: 8, type: 'event' };
    }

    // ── Hit Testing ────────────────────────────────────────────────────────────

    hitTest(x, y) {
        for (const [itemId, layout] of this.itemLayout) {
            const item = this.itemsById.get(itemId);
            if (!item) continue;

            // Check pencil icon hit first
            let pencilCX, pencilCY;
            if (item.type === 'duration') {
                pencilCX = layout.x - PENCIL_TOTAL;
                pencilCY = layout.y + layout.height / 2;
            } else if (item.type === 'event') {
                pencilCX = layout.x - PENCIL_TOTAL;
                pencilCY = layout.y;
            }

            if (pencilCX !== undefined) {
                const dist = Math.sqrt(Math.pow(x - pencilCX, 2) + Math.pow(y - pencilCY, 2));
                if (dist <= PENCIL_SIZE / 2 + 4) {
                    return { item, action: 'edit' };
                }
            }

            // Check chevron area (left side of bar, around x+10) for expand/collapse
            if (item.type === 'duration' && item.children.length > 0) {
                const chevronX = layout.x + 10;
                const chevronY = layout.y + layout.height / 2;
                if (Math.abs(x - chevronX) <= 10 && Math.abs(y - chevronY) <= layout.height / 2) {
                    return { item, action: 'toggle', hasChildren: true };
                }
            }

            // Check item body hit
            let clicked = false;
            if (item.type === 'duration') {
                clicked = x >= layout.x && x <= layout.x + layout.width &&
                          y >= layout.y && y <= layout.y + layout.height;
            } else if (item.type === 'event') {
                const dist = Math.sqrt(Math.pow(x - layout.x, 2) + Math.pow(y - layout.y, 2));
                clicked = dist <= 8;
            }

            if (clicked) {
                return { item, action: 'toggle', hasChildren: item.children.length > 0 };
            }
        }
        return null;
    }
}
