// TimelineAnimator.js — Zoom, pan, and marker animation state management

function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

function easeOutQuad(t) {
    return 1 - Math.pow(1 - t, 2);
}

export class TimelineAnimator {
    constructor(onFrame) {
        this.onFrame = onFrame;

        // Zoom animation
        this.isZoomAnimating = false;
        this.zoomStart = 0;
        this.zoomTarget = 0;
        this.zoomAnimStartTime = 0;
        this.zoomAnimDuration = 300;

        // Pan animation
        this.isPanAnimating = false;
        this.panStart = 0;
        this.panTarget = 0;
        this.panAnimStartTime = 0;
        this.panAnimDuration = 500;
        this.panConstrainFn = null;

        // Marker animations
        this.markerAnimations = new Map();
        this.markerAnimationDuration = 200;
    }

    // ── Zoom ───────────────────────────────────────────────────────────────────

    startZoom(currentZoom, targetZoom) {
        this.zoomStart = currentZoom;
        this.zoomTarget = targetZoom;
        this.zoomAnimStartTime = Date.now();
        if (!this.isZoomAnimating) {
            this.isZoomAnimating = true;
            this._tickZoom();
        }
    }

    _tickZoom() {
        const elapsed = Date.now() - this.zoomAnimStartTime;
        const progress = Math.min(elapsed / this.zoomAnimDuration, 1);
        const easedProgress = easeOutCubic(progress);

        const zoom = this.zoomStart + (this.zoomTarget - this.zoomStart) * easedProgress;

        if (progress < 1) {
            this.onFrame({ zoom, zoomDone: false });
            requestAnimationFrame(() => this._tickZoom());
        } else {
            this.isZoomAnimating = false;
            this.onFrame({ zoom: this.zoomTarget, zoomDone: true });
        }

        this._checkMarkerLoop();
    }

    // ── Pan ────────────────────────────────────────────────────────────────────

    startPan(currentOffset, targetOffset, constrainFn) {
        this.panStart = currentOffset;
        this.panTarget = targetOffset;
        this.panConstrainFn = constrainFn || ((o) => o);
        this.panAnimStartTime = Date.now();
        if (!this.isPanAnimating) {
            this.isPanAnimating = true;
            this._tickPan();
        }
    }

    _tickPan() {
        const elapsed = Date.now() - this.panAnimStartTime;
        const progress = Math.min(elapsed / this.panAnimDuration, 1);
        const easedProgress = easeOutCubic(progress);

        let offset = this.panStart + (this.panTarget - this.panStart) * easedProgress;
        offset = this.panConstrainFn(offset);

        if (progress < 1) {
            this.onFrame({ offset, panDone: false });
            requestAnimationFrame(() => this._tickPan());
        } else {
            this.isPanAnimating = false;
            this.onFrame({ offset: this.panConstrainFn(this.panTarget), panDone: true });
        }

        this._checkMarkerLoop();
    }

    // ── Marker Animations ──────────────────────────────────────────────────────

    getMarkerAnimationState(markerKey, appearing, markerType, isInitialLoad) {
        if (!this.markerAnimations.has(markerKey)) {
            const shouldAnimate = appearing && !isInitialLoad;
            this.markerAnimations.set(markerKey, {
                scale: shouldAnimate ? 0 : 1,
                opacity: shouldAnimate ? 0 : 1,
                startTime: Date.now(),
                appearing: shouldAnimate,
                disappearing: false,
                originalMarkerType: markerType || 'primary'
            });
        }
        return this.markerAnimations.get(markerKey);
    }

    updateMarkerAnimations(currentMarkerKeys) {
        const now = Date.now();

        // Mark markers for disappearing
        for (const [key, state] of this.markerAnimations) {
            if (!currentMarkerKeys.has(key) && !state.disappearing) {
                state.disappearing = true;
                state.startTime = now;
            }
        }

        // Update all animations
        for (const [key, state] of this.markerAnimations) {
            const elapsed = now - state.startTime;
            const progress = Math.min(elapsed / this.markerAnimationDuration, 1);
            const easedProgress = easeOutQuad(progress);

            if (state.appearing && !state.disappearing) {
                state.scale = easedProgress;
                state.opacity = easedProgress;
                if (progress >= 1) state.appearing = false;
            } else if (state.disappearing) {
                state.scale = 1 - easedProgress;
                state.opacity = 1 - easedProgress;
                if (progress >= 1) {
                    this.markerAnimations.delete(key);
                }
            }
        }
    }

    hasActiveMarkerAnimations() {
        return this.markerAnimations.size > 0;
    }

    _checkMarkerLoop() {
        if (this.hasActiveMarkerAnimations() && !this.isZoomAnimating && !this.isPanAnimating) {
            requestAnimationFrame(() => {
                this.onFrame({});
                this._checkMarkerLoop();
            });
        }
    }

    startMarkerLoop() {
        this._checkMarkerLoop();
    }
}
