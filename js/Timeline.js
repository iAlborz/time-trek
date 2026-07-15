// Timeline.js — Orchestrator: state, events, marker generation, module wiring

import { TimeScale, MONTH_NAMES_SHORT, MONTH_DAYS, dayOfYearToMonthDay } from './TimeScale.js';
import { parseDate, MS_PER_DAY } from './DateParser.js';
import { TimelineData } from './TimelineData.js';
import { TimelineRenderer } from './TimelineRenderer.js';
import { TimelineAnimator } from './TimelineAnimator.js';

// How precisely a date is expressed. Not stored as its own field — the date string
// already encodes it ("2025" / "2025-03" / "2025-03-01" / "2025-03-01T14:30") and
// round-trips through CSV and JSON unchanged, so precision is detected on read.
// Each input type emits exactly the string format DateParser expects.
const PRECISIONS = {
    year:     { inputType: 'text',           hint: 'Year, or BC/BCE, AD/CE, and deep time: 3000 BC · 65 MYA · 4.5 BYA' },
    month:    { inputType: 'month',          hint: '' },
    day:      { inputType: 'date',           hint: '' },
    datetime: { inputType: 'datetime-local', hint: '' },
};

export class Timeline {
    constructor(canvas) {
        // Core state
        this.zoom = 1;
        this.offset = 0;
        this.centerDate = new Date();
        this.targetZoom = 1;
        this.targetOffset = 0;
        this.bigBangLimitDays = 13.8e9 * 365.25;

        // Scales (sorted by days ascending)
        this.scales = [];

        // Wheel throttling
        this.lastWheelTime = 0;
        this.wheelThrottleDelay = 16;
        this.accumulatedDelta = 0;

        // Dragging
        this.isDragging = false;
        this.lastMouseX = 0;

        // Modules
        this.data = new TimelineData();
        this.renderer = new TimelineRenderer(canvas);
        this.animator = new TimelineAnimator((update) => this._onAnimationFrame(update));

        this.canvas = canvas;
        this.isInitialLoad = true;

        this.setupEventListeners();
    }

    // ── Scale Management ───────────────────────────────────────────────────────

    registerScale(scale) {
        // Insert sorted by days
        const insertIndex = this.scales.findIndex(s => s.days > scale.days);
        if (insertIndex === -1) {
            this.scales.push(scale);
        } else {
            this.scales.splice(insertIndex, 0, scale);
        }
    }

    getTimeScale() {
        const pixelsPerDay = this.zoom;
        const canvasWidth = window.innerWidth;
        const visibleDays = canvasWidth / pixelsPerDay;

        let bestScale = this.scales[0];
        let bestDiff = Infinity;

        for (const scale of this.scales) {
            const markersCount = visibleDays / scale.days;
            if (markersCount >= 8 && markersCount <= 30) return scale;

            const diff = Math.abs(markersCount - 15);
            if (diff < bestDiff) {
                bestDiff = diff;
                bestScale = scale;
            }
        }
        return bestScale;
    }

    /**
     * Calculate a continuous blend factor (0–1) for a scale based on current zoom.
     * Instead of a hard cutoff, markers fade in/out over a zoom range.
     *   - markerCount 8–30: fully visible (1.0)
     *   - markerCount 4–8:  fading in as we zoom in (0→1)
     *   - markerCount 30–60: fading out as we zoom out (1→0)
     *   - outside those ranges: invisible (0)
     */
    getScaleBlend(scale) {
        const pixelsPerDay = this.zoom;
        const canvasWidth = window.innerWidth;
        const visibleDays = canvasWidth / pixelsPerDay;
        const count = visibleDays / scale.days;

        if (count >= 8 && count <= 30) return 1;
        if (count > 4 && count < 8) return (count - 4) / 4;      // fade in zone
        if (count > 30 && count < 60) return 1 - (count - 30) / 30; // fade out zone
        return 0;
    }

    getSmallerTimeScale(currentScale) {
        const idx = this.scales.findIndex(s => s.unit === currentScale.unit);
        return idx > 0 ? this.scales[idx - 1] : null;
    }

    getLargerTimeScale(currentScale) {
        const idx = this.scales.findIndex(s => s.unit === currentScale.unit);
        return idx < this.scales.length - 1 ? this.scales[idx + 1] : null;
    }

    setScaleZoom(scaleUnit) {
        const scale = this.scales.find(s => s.unit === scaleUnit);
        if (!scale) return;
        const canvasWidth = window.innerWidth;
        const targetZoom = canvasWidth / (15 * scale.days);
        this.targetZoom = Math.max(0.0000000001, Math.min(targetZoom, 2400));
        this.animator.startZoom(this.zoom, this.targetZoom);
    }

    // ── Navigation ─────────────────────────────────────────────────────────────

    goToToday() {
        this.targetOffset = this.constrainOffset(0);
        this.animator.startPan(this.offset, this.targetOffset, (o) => this.constrainOffset(o));
    }

    constrainOffset(offset) {
        return Math.max(-this.bigBangLimitDays, offset);
    }

    // ── Event Listeners ────────────────────────────────────────────────────────

    setupEventListeners() {
        // Wheel zoom (zoom towards cursor)
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const now = Date.now();
            if (now - this.lastWheelTime < this.wheelThrottleDelay) {
                this.accumulatedDelta += e.deltaY;
                return;
            }

            const deltaY = this.accumulatedDelta !== 0 ? this.accumulatedDelta : e.deltaY;
            this.accumulatedDelta = 0;
            this.lastWheelTime = now;

            const normalizedDelta = this._normalizeDelta(deltaY, e.deltaMode);
            const zoomFactor = Math.exp(-normalizedDelta * 0.002);
            const newTarget = this.targetZoom * zoomFactor;
            this.targetZoom = Math.max(0.0000000001, Math.min(newTarget, 2400));

            // Store cursor position for zoom-towards-cursor
            const rect = this.canvas.getBoundingClientRect();
            const cursorX = e.clientX - rect.left;
            this.zoomCursorX = cursorX;
            this.zoomStartOffset = this.offset;
            this.zoomStartZoom = this.zoom;

            this.animator.startZoom(this.zoom, this.targetZoom);
        });

        // Mouse drag
        this.canvas.addEventListener('mousedown', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const hit = this.data.hitTest(x, y);
            if (hit) {
                if (hit.action === 'edit') {
                    this.showEditModal(hit.item);
                } else if (hit.action === 'toggle' && hit.hasChildren) {
                    this.data.toggleItemExpansion(hit.item.id);
                    this.data.calculateLayout(this.zoom, this.offset, this.centerDate, window.innerWidth, window.innerHeight);
                    this.draw();
                }
                return;
            }

            this.isDragging = true;
            this.lastMouseX = e.clientX;
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                const deltaX = e.clientX - this.lastMouseX;
                this.offset = this.constrainOffset(this.offset - deltaX / this.zoom);
                this.lastMouseX = e.clientX;
                this.data.calculateLayout(this.zoom, this.offset, this.centerDate, window.innerWidth, window.innerHeight);
                this.draw();
            }
        });

        this.canvas.addEventListener('mouseup', () => { this.isDragging = false; });
        this.canvas.addEventListener('mouseleave', () => { this.isDragging = false; });

        // Double-click empty space to create an item at that point in time
        this.canvas.addEventListener('dblclick', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            if (this.data.hitTest(x, y)) return;

            this.isDragging = false;
            this.openItemModal({ prefillDate: this.dateAtX(x) });
        });

        window.addEventListener('resize', () => {
            this.renderer.setupCanvas();
            this.draw();
        });
    }

    _normalizeDelta(deltaY, deltaMode) {
        let d = deltaY;
        if (deltaMode === 1) d = deltaY * 16;
        else if (deltaMode === 2) d = deltaY * 400;
        return Math.max(-100, Math.min(d, 100));
    }

    // ── Animation Callback ─────────────────────────────────────────────────────

    _onAnimationFrame(update) {
        if (update.zoom !== undefined) {
            const oldZoom = this.zoom;
            this.zoom = update.zoom;

            // Adjust offset so the point under the cursor stays fixed
            if (this.zoomCursorX !== undefined && oldZoom !== update.zoom) {
                const canvasWidth = window.innerWidth;
                // The cursor's position relative to center, in days (at the old zoom)
                const cursorDayOffset = (this.zoomCursorX - canvasWidth / 2) / oldZoom;
                // The same point at the new zoom
                const newCursorDayOffset = (this.zoomCursorX - canvasWidth / 2) / update.zoom;
                // Shift offset so that point stays under the cursor
                this.offset = this.constrainOffset(this.offset + cursorDayOffset - newCursorDayOffset);
            }
        }
        if (update.offset !== undefined) this.offset = update.offset;
        this.data.calculateLayout(this.zoom, this.offset, this.centerDate, window.innerWidth, window.innerHeight);
        this.draw();
    }

    // ── Marker Generation ──────────────────────────────────────────────────────

    getMarkers() {
        const primaryScale = this.getTimeScale();
        const markers = [];
        const canvasWidth = window.innerWidth;
        const pixelsPerDay = this.zoom;
        const centerTime = this.centerDate.getTime() + (this.offset * 24 * 60 * 60 * 1000);
        const visibleDays = canvasWidth / (2 * pixelsPerDay);
        let startTime = centerTime - visibleDays * 24 * 60 * 60 * 1000;
        let endTime = centerTime + visibleDays * 24 * 60 * 60 * 1000;

        const bigBangTime = this.centerDate.getTime() - (this.bigBangLimitDays * 24 * 60 * 60 * 1000);
        startTime = Math.max(bigBangTime, startTime);
        endTime = Math.max(bigBangTime, endTime);

        const startDate = new Date(startTime);
        const endDate = new Date(endTime);
        const currentMarkerKeys = new Set();

        // Gather all scales that have any visibility at the current zoom
        const primaryIdx = this.scales.findIndex(s => s.unit === primaryScale.unit);
        const visibleScales = [];

        for (let i = 0; i < this.scales.length; i++) {
            const scale = this.scales[i];
            const blend = this.getScaleBlend(scale);
            if (blend <= 0) continue;

            // Determine marker type based on relationship to primary scale
            let markerType;
            if (i < primaryIdx) markerType = 'secondary';
            else if (i > primaryIdx) markerType = 'tertiary';
            else markerType = 'primary';

            visibleScales.push({ scale, blend, markerType });
        }

        // Generate markers for all visible scales with their blend factors
        for (const { scale, blend, markerType } of visibleScales) {
            this._generateMarkersForScale(scale, startDate, endDate, markers, currentMarkerKeys, markerType, blend);
        }

        return markers;
    }

    _generateMarkersForScale(scale, startDate, endDate, markers, currentMarkerKeys, markerType, blend = 1) {
        const baseCenterYear = this.centerDate.getFullYear();
        const offsetYears = this.offset / 365.25;
        const currentYear = baseCenterYear + offsetYears;
        const isExtremeRange = Math.abs(currentYear) > 250000;

        if (isExtremeRange || scale.isLargeScale) {
            this._generateLargeScaleMarkers(scale, startDate, endDate, markers, currentMarkerKeys, markerType, blend);
            return;
        }

        const canvasWidth = window.innerWidth;
        const pixelsPerDay = this.zoom;
        let currentDate = new Date(startDate);
        scale.alignDate(currentDate);

        while (currentDate <= endDate) {
            const dayOffset = (currentDate.getTime() - this.centerDate.getTime()) / (24 * 60 * 60 * 1000);
            const x = canvasWidth / 2 + (dayOffset - this.offset) * pixelsPerDay;

            if (x >= -100 && x <= canvasWidth + 100) {
                const markerKey = `${scale.unit}-${currentDate.getTime()}`;
                currentMarkerKeys.add(markerKey);

                markers.push({
                    x,
                    date: new Date(currentDate),
                    scale,
                    key: markerKey,
                    animationState: { opacity: blend, scale: blend },
                    markerType
                });
            }
            scale.incrementDate(currentDate);
        }
    }

    _generateLargeScaleMarkers(scale, startDate, endDate, markers, currentMarkerKeys, markerType, blend = 1) {
        const canvasWidth = window.innerWidth;
        const pixelsPerDay = this.zoom;
        const baseCenterYear = this.centerDate.getFullYear();
        const offsetYears = this.offset / 365.25;
        const centerYear = baseCenterYear + offsetYears;
        const visibleDays = canvasWidth / pixelsPerDay;
        const visibleYears = visibleDays / 365.25;

        // For sub-year scales in extreme ranges
        if (scale.unit === 'hour' || scale.unit === 'day' || scale.unit === 'week') {
            const centerDays = this.offset;
            const startDays = centerDays - visibleDays / 2;
            const endDays = centerDays + visibleDays / 2;
            const stepDays = scale.stepDays;

            const alignedStart = scale.alignDays(startDays);
            const alignedEnd = scale.alignDays(endDays) + stepDays;

            for (let days = alignedStart; days <= alignedEnd; days += stepDays) {
                const x = canvasWidth / 2 + (days - this.offset) * pixelsPerDay;
                if (x >= -100 && x <= canvasWidth + 100) {
                    const yearFromDays = baseCenterYear + days / 365.25;
                    const actualYear = Math.floor(yearFromDays);
                    let markerDate = new Date(2000, 0, 1);

                    if (scale.unit === 'hour') {
                        const dayFraction = days - Math.floor(days);
                        markerDate.setHours(Math.floor(dayFraction * 24));
                    } else if (scale.unit === 'day' || scale.unit === 'week') {
                        const yearFraction = yearFromDays - actualYear;
                        const { month, day } = dayOfYearToMonthDay(Math.floor(yearFraction * 365));
                        markerDate.setMonth(month);
                        markerDate.setDate(day);
                    }

                    const markerKey = `${scale.unit}-${days}`;
                    currentMarkerKeys.add(markerKey);

                    markers.push({
                        x, date: markerDate, scale, key: markerKey,
                        animationState: { opacity: blend, scale: blend }, markerType, actualYear
                    });
                }
            }
            return;
        }

        // Month scale in extreme range
        if (scale.unit === 'month') {
            const startDays = this.offset - visibleDays / 2;
            const endDays = this.offset + visibleDays / 2;
            const startYear = Math.floor(baseCenterYear + startDays / 365.25);
            const endYear = Math.ceil(baseCenterYear + endDays / 365.25);

            for (let year = startYear; year <= endYear; year++) {
                for (let month = 0; month < 12; month++) {
                    const yearOffset = year - baseCenterYear;
                    const monthOffset = month / 12;
                    const dayOffset = (yearOffset + monthOffset) * 365.25;
                    const x = canvasWidth / 2 + (dayOffset - this.offset) * pixelsPerDay;

                    if (x >= -100 && x <= canvasWidth + 100) {
                        const markerDate = new Date(2000, month, 1);
                        const markerKey = `${scale.unit}-${year}-${month}`;
                        currentMarkerKeys.add(markerKey);

                        markers.push({
                            x, date: markerDate, scale, key: markerKey,
                            animationState: { opacity: blend, scale: blend }, markerType, actualYear: year
                        });
                    }
                }
            }
            return;
        }

        // Quarter scale in extreme range
        if (scale.unit === 'quarter') {
            const startDays = this.offset - visibleDays / 2;
            const endDays = this.offset + visibleDays / 2;
            const startYear = Math.floor(baseCenterYear + startDays / 365.25);
            const endYear = Math.ceil(baseCenterYear + endDays / 365.25);

            for (let year = startYear; year <= endYear; year++) {
                for (let q = 0; q < 4; q++) {
                    const month = q * 3;
                    const yearOffset = year - baseCenterYear;
                    const monthOffset = month / 12;
                    const dayOffset = (yearOffset + monthOffset) * 365.25;
                    const x = canvasWidth / 2 + (dayOffset - this.offset) * pixelsPerDay;

                    if (x >= -100 && x <= canvasWidth + 100) {
                        const markerDate = new Date(2000, month, 1);
                        const markerKey = `${scale.unit}-${year}-Q${q + 1}`;
                        currentMarkerKeys.add(markerKey);

                        markers.push({
                            x, date: markerDate, scale, key: markerKey,
                            animationState: { opacity: blend, scale: blend }, markerType, actualYear: year
                        });
                    }
                }
            }
            return;
        }

        // Year-and-above scales — use stepYears
        const stepYears = scale.stepYears || 1;
        const startYear = Math.floor((centerYear - visibleYears / 2) / stepYears) * stepYears;
        const endYear = Math.ceil((centerYear + visibleYears / 2) / stepYears) * stepYears;
        const bigBangYear = -13.8e9;
        const constrainedStart = Math.max(bigBangYear, startYear);
        const constrainedEnd = Math.max(bigBangYear, endYear);

        for (let year = constrainedStart; year <= constrainedEnd; year += stepYears) {
            const yearOffsetFromBase = year - baseCenterYear;
            const dayOffsetFromBase = yearOffsetFromBase * 365.25;
            const x = canvasWidth / 2 + (dayOffsetFromBase - this.offset) * pixelsPerDay;

            if (x >= -100 && x <= canvasWidth + 100) {
                let markerDate;
                try {
                    markerDate = new Date(year, 0, 1);
                    if (isNaN(markerDate.getTime())) {
                        markerDate = new Date(0, 0, 1);
                    }
                } catch (_) {
                    markerDate = new Date(0, 0, 1);
                }

                const markerKey = `${scale.unit}-${year}`;
                currentMarkerKeys.add(markerKey);

                markers.push({
                    x, date: markerDate, scale, key: markerKey,
                    animationState: { opacity: blend, scale: blend }, markerType, actualYear: year
                });
            }
        }
    }

    // ── Drawing ────────────────────────────────────────────────────────────────

    draw() {
        const currentScale = this.getTimeScale();
        const markers = this.getMarkers();
        const formattedCenterDate = this._formatCurrentCenterDate(currentScale);

        this.renderer.draw({
            zoom: this.zoom,
            offset: this.offset,
            centerDate: this.centerDate,
            markers,
            currentScale,
            scales: this.scales,
            formattedCenterDate,
            bigBangLimitDays: this.bigBangLimitDays,
            itemLayout: this.data.itemLayout,
            itemsById: this.data.itemsById,
            expandedItems: this.data.expandedItems
        });

        this.updateActiveScaleButton();
    }

    _formatCurrentCenterDate(currentScale) {
        const baseCenterYear = this.centerDate.getFullYear();
        const baseCenterTime = this.centerDate.getTime();
        const offsetMilliseconds = this.offset * 24 * 60 * 60 * 1000;
        const currentTimeMillis = baseCenterTime + offsetMilliseconds;
        const offsetYears = this.offset / 365.25;
        const currentYear = baseCenterYear + offsetYears;

        let centerDate = null;
        let actualYear = null;
        let actualMonth = null;
        let actualDay = null;

        try {
            if (Math.abs(currentYear) < 250000) {
                centerDate = new Date(currentTimeMillis);
                if (isNaN(centerDate.getTime())) {
                    centerDate = null;
                    actualYear = Math.floor(currentYear);
                }
            } else {
                actualYear = Math.floor(currentYear);
                const yearFraction = currentYear - actualYear;
                const { month, day } = dayOfYearToMonthDay(Math.floor(Math.abs(yearFraction) * 365));
                actualMonth = month;
                actualDay = day;

                if (currentScale.unit === 'hour') {
                    const dayFraction = this.offset - Math.floor(this.offset);
                    const hourOfDay = Math.floor(dayFraction * 24);
                    centerDate = new Date(2000, actualMonth, actualDay, hourOfDay);
                }
            }
        } catch (_) {
            actualYear = Math.floor(currentYear);
            const yearFraction = currentYear - actualYear;
            const { month, day } = dayOfYearToMonthDay(Math.floor(Math.abs(yearFraction) * 365));
            actualMonth = month;
            actualDay = day;
        }

        return currentScale.formatCenter(centerDate, actualYear, actualMonth, actualDay);
    }

    updateActiveScaleButton() {
        const currentScale = this.getTimeScale();
        const buttons = document.querySelectorAll('.scale-btn');
        buttons.forEach(btn => {
            if (btn.dataset.scale === currentScale.unit) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    // ── Edit Modal ──────────────────────────────────────────────────────────────

    showEditModal(item) {
        this.openItemModal({ item });
    }

    // Open the modal in edit mode (item given) or create mode (prefillDate optional).
    openItemModal({ item = null, prefillDate = null } = {}) {
        const modal = document.getElementById('edit-modal');
        const isEdit = !!item;

        const nameInput = document.getElementById('edit-name');
        const typeSelect = document.getElementById('edit-type');
        const startInput = document.getElementById('edit-start');
        const endGroup = document.getElementById('edit-end-group');
        const endInput = document.getElementById('edit-end');
        const notesInput = document.getElementById('edit-notes');

        document.getElementById('edit-modal-title').textContent = isEdit ? 'Edit Item' : 'Add Item';
        document.getElementById('edit-delete-btn').hidden = !isEdit;

        const precisionSelect = document.getElementById('edit-precision');
        const precision = isEdit ? this._detectPrecision(item._startDateStr) : 'day';
        precisionSelect.value = precision;
        this._applyPrecision(precision);
        precisionSelect.onchange = () => this._changePrecision(precisionSelect.value);

        if (isEdit) {
            nameInput.value = item.name;
            typeSelect.value = item.type;
            notesInput.value = item.notes || '';
            const startDate = item.type === 'duration' ? item.startDate : item.date;
            startInput.value = this._valueForInput(item._startDateStr, startDate, precision);
            endInput.value = item.type === 'duration'
                ? this._valueForInput(item._endDateStr, item.endDate, precision)
                : '';
        } else {
            nameInput.value = '';
            typeSelect.value = 'event';
            notesInput.value = '';
            startInput.value = prefillDate ? this._fromDate({ date: prefillDate }, precision) : '';
            endInput.value = '';
        }

        endGroup.style.display = typeSelect.value === 'duration' ? 'block' : 'none';
        typeSelect.onchange = () => {
            endGroup.style.display = typeSelect.value === 'duration' ? 'block' : 'none';
        };

        this._populateParentSelect(item);
        this._setModalError('');
        this._hideDeleteConfirm();

        modal.dataset.itemId = isEdit ? item.id : '';
        modal.classList.add('visible');
        nameInput.focus();
    }

    // Inverse of the layout transform: x = width/2 + (dayOffset - offset) * pixelsPerDay.
    // Returns null in deep time, where the offset exceeds what a Date can represent.
    dateAtX(x) {
        const dayOffset = (x - window.innerWidth / 2) / this.zoom + this.offset;
        const time = this.centerDate.getTime() + dayOffset * MS_PER_DAY;
        if (!isFinite(time)) return null;
        const date = new Date(time);
        return isNaN(date.getTime()) ? null : date;
    }

    // ── Date precision ─────────────────────────────────────────────────────────

    // Split a canonical date string into parts. Returns null for deep time
    // ("4.5 BYA") and any other format we can't re-emit.
    _dateParts(str) {
        if (!str) return null;
        const s = String(str).trim();
        const full = s.match(/^(-?\d{1,6})-(\d{2})(?:-(\d{2}))?(?:[T ](\d{2}):(\d{2}))?$/);
        if (full) {
            return { year: full[1], month: full[2], day: full[3] || null, hour: full[4] || null, minute: full[5] || null };
        }
        const yearOnly = s.match(/^(-?\d{1,6})$/);
        if (yearOnly) return { year: yearOnly[1], month: null, day: null, hour: null, minute: null };
        return null;
    }

    _detectPrecision(str) {
        const p = this._dateParts(str);
        if (!p) return 'year';               // deep time and unknown formats are free text
        if (p.hour !== null) return 'datetime';
        if (p.day !== null) return 'day';
        if (p.month !== null) return 'month';
        return 'year';
    }

    _emitAtPrecision(parts, precision) {
        if (!parts) return '';
        if (precision === 'year') return String(parts.year);

        // month/date/datetime inputs can't represent years outside 1-9999
        const yearNum = parseInt(parts.year, 10);
        if (!(yearNum >= 1 && yearNum <= 9999)) return '';

        const y = String(yearNum).padStart(4, '0');
        const mo = parts.month || '01';
        const d = parts.day || '01';
        if (precision === 'month') return `${y}-${mo}`;
        if (precision === 'day') return `${y}-${mo}-${d}`;
        return `${y}-${mo}-${d}T${parts.hour || '00'}:${parts.minute || '00'}`;
    }

    // Prefer the stored string — it's exactly what was typed or imported, so using it
    // avoids a Date round-trip and the timezone skew that comes with one.
    _valueForInput(rawStr, timelineDate, precision) {
        const parts = this._dateParts(rawStr);
        if (parts) return this._emitAtPrecision(parts, precision);
        if (precision === 'year' && rawStr) return String(rawStr).trim();
        return this._fromDate(timelineDate, precision);
    }

    _fromDate(timelineDate, precision) {
        if (!timelineDate || !timelineDate.date) return '';
        const d = timelineDate.date;
        if (isNaN(d.getTime())) return '';

        // parseDate reads "YYYY-MM-DD" as UTC but "...THH:mm" as local, so read back
        // through whichever clock the string will be parsed with.
        const local = precision === 'datetime';
        const year = local ? d.getFullYear() : d.getUTCFullYear();
        if (year < 1 || year > 9999) return '';
        if (precision === 'year') return String(year);

        const p2 = n => String(n).padStart(2, '0');
        const ys = String(year).padStart(4, '0');
        const mo = p2((local ? d.getMonth() : d.getUTCMonth()) + 1);
        if (precision === 'month') return `${ys}-${mo}`;
        const day = p2(local ? d.getDate() : d.getUTCDate());
        if (precision === 'day') return `${ys}-${mo}-${day}`;
        return `${ys}-${mo}-${day}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
    }

    _applyPrecision(precision) {
        const cfg = PRECISIONS[precision] || PRECISIONS.day;
        ['edit-start', 'edit-end'].forEach(id => {
            const input = document.getElementById(id);
            if (input.type !== cfg.inputType) input.type = cfg.inputType;
            input.placeholder = precision === 'year' ? 'e.g. 1980, 3000 BC, 4.5 BYA' : '';
        });
        const hint = document.getElementById('edit-date-hint');
        hint.textContent = cfg.hint;
        hint.hidden = !cfg.hint;
    }

    // Switching precision keeps what's already entered: truncating to the coarser
    // part, or filling the finer parts with defaults.
    _changePrecision(precision) {
        const ids = ['edit-start', 'edit-end'];
        // read every value before touching .type — changing type discards the value
        const converted = ids.map(id => {
            const input = document.getElementById(id);
            const parts = this._dateParts(input.value);
            if (parts) return this._emitAtPrecision(parts, precision);
            return precision === 'year' ? input.value.trim() : '';
        });

        this._applyPrecision(precision);
        ids.forEach((id, i) => { document.getElementById(id).value = converted[i]; });
    }

    // Descendants of `item` (plus itself) can't become its own parent
    _collectDescendantIds(item, acc = new Set()) {
        acc.add(item.id);
        (item.children || []).forEach(child => this._collectDescendantIds(child, acc));
        return acc;
    }

    _populateParentSelect(item) {
        const select = document.getElementById('edit-parent');
        const excluded = item ? this._collectDescendantIds(item) : new Set();

        select.innerHTML = '';
        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = '— None (top level) —';
        select.appendChild(noneOpt);

        // Walk the tree so options read in hierarchy order, indented by depth
        const addOptions = (nodes, depth) => {
            nodes.forEach(node => {
                if (!excluded.has(node.id)) {
                    const opt = document.createElement('option');
                    opt.value = node.id;
                    opt.textContent = `${'  '.repeat(depth)}${node.name}`;
                    select.appendChild(opt);
                    addOptions(node.children || [], depth + 1);
                }
            });
        };
        addOptions(this.data.items.filter(i => !i.parentId), 0);

        select.value = item && item.parentId ? item.parentId : '';
    }

    _setModalError(message) {
        const el = document.getElementById('edit-error');
        el.textContent = message;
        el.hidden = !message;
    }

    // Returns true on success, false if validation failed
    applyEdit() {
        const modal = document.getElementById('edit-modal');
        const itemId = modal.dataset.itemId;
        const isEdit = !!itemId;

        const name = document.getElementById('edit-name').value.trim();
        const type = document.getElementById('edit-type').value;
        const parentId = document.getElementById('edit-parent').value;
        const startStr = document.getElementById('edit-start').value;
        const endStr = document.getElementById('edit-end').value;
        const notes = document.getElementById('edit-notes').value;

        const item = isEdit ? this.data.itemsById.get(itemId) : null;
        if (isEdit && !item) return false;

        if (!name) {
            this._setModalError('Name is required.');
            return false;
        }

        // Deep-time items have no representable date, so an empty field on edit means
        // "unchanged" rather than "cleared". On create there's nothing to fall back to.
        const hadDate = isEdit && (item.startDate || item.date);
        if (!startStr && !hadDate) {
            this._setModalError('Start date is required.');
            return false;
        }

        // Year precision is free text, so it can hold anything the user typed
        if (startStr && !parseDate(startStr, this.centerDate)) {
            this._setModalError(`Could not read "${startStr}" as a start date.`);
            return false;
        }
        if (type === 'duration' && endStr && !parseDate(endStr, this.centerDate)) {
            this._setModalError(`Could not read "${endStr}" as an end date.`);
            return false;
        }

        if (type === 'duration' && startStr && endStr) {
            const s = parseDate(startStr, this.centerDate);
            const e = parseDate(endStr, this.centerDate);
            if (s && e && e.dayOffset < s.dayOffset) {
                this._setModalError('End date must be on or after the start date.');
                return false;
            }
        }

        const target = isEdit ? item : this.data.processCSVItem({
            'item name': name,
            'type': type,
            'start date': startStr,
            'end date': type === 'duration' ? endStr : '',
            'parent item': '',
            'notes': notes
        }, this.centerDate);

        if (!target) {
            this._setModalError('Could not read that date.');
            return false;
        }

        if (isEdit) {
            target.name = name;
            target.notes = notes;
            if (type === 'duration') {
                target.type = 'duration';
                if (startStr) {
                    target.startDate = parseDate(startStr, this.centerDate);
                    target._startDateStr = startStr;
                }
                if (endStr) {
                    target.endDate = parseDate(endStr, this.centerDate);
                    target._endDateStr = endStr;
                } else {
                    target.endDate = null;
                    target._endDateStr = '';
                }
                target.date = undefined;
            } else {
                target.type = 'event';
                if (startStr) {
                    target.date = parseDate(startStr, this.centerDate);
                    target._startDateStr = startStr;
                }
                target.startDate = undefined;
                target.endDate = undefined;
            }
        } else {
            this.data.items.push(target);
        }

        // parentId wins over _parentName in setItems; null means top level
        target.parentId = parentId || null;
        delete target._parentName;

        this._rebuild();
        modal.classList.remove('visible');
        return true;
    }

    deleteCurrentItem(deleteChildren) {
        const modal = document.getElementById('edit-modal');
        const item = this.data.itemsById.get(modal.dataset.itemId);
        if (!item) return false;

        if (deleteChildren) {
            const doomed = this._collectDescendantIds(item);
            this.data.items = this.data.items.filter(i => !doomed.has(i.id));
        } else {
            // Promote children to the deleted item's parent so nothing is lost
            const newParentId = item.parentId || null;
            this.data.items.forEach(i => {
                if (i.parentId === item.id) i.parentId = newParentId;
            });
            this.data.items = this.data.items.filter(i => i.id !== item.id);
        }

        this._rebuild();
        modal.classList.remove('visible');
        return true;
    }

    getCurrentModalItem() {
        return this.data.itemsById.get(document.getElementById('edit-modal').dataset.itemId) || null;
    }

    // _collectDescendantIds includes the item itself
    countDescendants(item) {
        return this._collectDescendantIds(item).size - 1;
    }

    _hideDeleteConfirm() {
        document.getElementById('edit-delete-confirm').hidden = true;
        document.getElementById('edit-main-buttons').hidden = false;
        document.getElementById('edit-delete-children').checked = false;
    }

    _rebuild() {
        this.data.setItems(this.data.items);
        this.data.calculateLayout(this.zoom, this.offset, this.centerDate, window.innerWidth, window.innerHeight);
        this.draw();
    }

    closeEditModal() {
        document.getElementById('edit-modal').classList.remove('visible');
    }

    // ── Public API for Data ────────────────────────────────────────────────────

    parseCSVData(csvText) {
        this.data.parseCSVData(csvText, this.centerDate);
        this.data.calculateLayout(this.zoom, this.offset, this.centerDate, window.innerWidth, window.innerHeight);
        this.draw();
    }

    setTimelineItems(items) {
        this.data.setItems(items);
        this.data.calculateLayout(this.zoom, this.offset, this.centerDate, window.innerWidth, window.innerHeight);
        this.draw();
    }

    // ── View State (for project save/restore) ─────────────────────────────────

    getViewState() {
        return {
            zoom: this.zoom,
            offset: this.offset,
            expandedItems: Array.from(this.data.expandedItems)
        };
    }

    setViewState(state) {
        if (!state) return;
        if (state.zoom !== undefined) {
            this.zoom = state.zoom;
            this.targetZoom = state.zoom;
        }
        if (state.offset !== undefined) {
            this.offset = state.offset;
            this.targetOffset = state.offset;
        }
        if (state.expandedItems) {
            this.data.expandedItems = new Set(state.expandedItems);
        }
        this.data.calculateLayout(this.zoom, this.offset, this.centerDate, window.innerWidth, window.innerHeight);
        this.draw();
    }

    loadSerializedItems(storedItems) {
        this.data.loadFromSerializedItems(storedItems, this.centerDate);
        this.data.calculateLayout(this.zoom, this.offset, this.centerDate, window.innerWidth, window.innerHeight);
        this.draw();
    }

    // ── Bootstrap ──────────────────────────────────────────────────────────────

    start() {
        this.isInitialLoad = true;
        this.draw();
        this.isInitialLoad = false;
        this.animator.startMarkerLoop();
    }
}
