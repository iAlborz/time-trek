class Timeline {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Set canvas size to full viewport with retina support
        this.setupCanvas();
        
        // Timeline properties
        this.zoom = 1; // pixels per day initially
        this.offset = 0; // offset in days from center
        this.centerDate = new Date(); // current date as center point
        
        // Animation properties
        this.targetZoom = 1;
        this.animationStartTime = null;
        this.animationDuration = 300; // 0.3 seconds in milliseconds
        this.isAnimating = false;
        
        // Pan animation properties
        this.targetOffset = 0;
        this.panAnimationStartTime = null;
        this.panAnimationDuration = 500; // 0.5 seconds for pan animation
        this.isPanAnimating = false;
        
        // Marker animation properties
        this.markerAnimations = new Map(); // Track marker animations by key
        this.markerAnimationDuration = 200; // 0.2 seconds for marker transitions
        
        // Wheel event throttling for touchpad
        this.lastWheelTime = 0;
        this.wheelThrottleDelay = 16; // ~60fps throttling
        this.accumulatedDelta = 0;
        
        // Interaction properties
        this.isDragging = false;
        this.lastMouseX = 0;
        
        // Timeline items data
        this.timelineItems = []; // Flat array of all items
        this.itemsById = new Map(); // Quick lookup by ID
        this.expandedItems = new Set(); // Track which items are expanded
        this.itemLayout = new Map(); // Store calculated layout positions (id -> {x, y, width, height})
        
        // Duration bar styling
        this.durationBarHeight = 20;
        this.durationBarSpacing = 5;
        this.durationBarRadius = 3;
        
        // Big Bang limit (13.8 billion years ago in days)
        this.bigBangLimitDays = 13.8e9 * 365.25; // 13.8 billion years in days
        
        // Time scale definitions (in days) - ordered from smallest to largest
        this.timeScales = [
            { unit: 'hour', days: 1/24, label: 'H' },
            { unit: 'day', days: 1, label: 'D' },
            { unit: 'month', days: 30, label: 'M' },
            { unit: 'year', days: 365, label: 'Y' },
            { unit: 'decade', days: 3650, label: '10Y' },
            { unit: 'century', days: 36500, label: '100Y' },
            { unit: 'millennium', days: 365000, label: '1000Y' },
            { unit: 'ten-thousand', days: 3650000, label: '10KY' },
            { unit: 'hundred-thousand', days: 36500000, label: '100KY' },
            { unit: 'million', days: 365000000, label: '1MY' },
            { unit: 'ten-million', days: 3650000000, label: '10MY' },
            { unit: 'hundred-million', days: 36500000000, label: '100MY' },
            { unit: 'billion', days: 365000000000, label: '1BY' }
        ];
        
        this.setupEventListeners();
        
        // Set flag for initial load
        this.isInitialLoad = true;
        this.draw();
        this.isInitialLoad = false;
        
        // Start animation loop to handle any ongoing animations
        this.checkMarkerAnimations();
    }
    
    // Setup canvas with proper retina/high DPI support
    setupCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        
        // Set the canvas size in CSS pixels
        this.canvas.style.width = window.innerWidth + 'px';
        this.canvas.style.height = window.innerHeight + 'px';
        
        // Set the canvas size in actual pixels (scaled for retina)
        this.canvas.width = window.innerWidth * dpr;
        this.canvas.height = window.innerHeight * dpr;
        
        // Scale the drawing context so everything draws at the correct size
        this.ctx.scale(dpr, dpr);
        
        // Store the device pixel ratio for reference
        this.devicePixelRatio = dpr;
    }
    
    // Start smooth zoom animation
    startZoomAnimation() {
        if (!this.isAnimating) {
            this.isAnimating = true;
            this.animationStartTime = Date.now();
            this.animationStartZoom = this.zoom;
            this.animateZoom();
        } else {
            // If already animating, restart with current zoom as new starting point
            this.animationStartTime = Date.now();
            this.animationStartZoom = this.zoom;
        }
    }
    
    // Start smooth pan animation
    startPanAnimation() {
        if (!this.isPanAnimating) {
            this.isPanAnimating = true;
            this.panAnimationStartTime = Date.now();
            this.panAnimationStartOffset = this.offset;
            this.animatePan();
        } else {
            // If already animating, restart with current offset as new starting point
            this.panAnimationStartTime = Date.now();
            this.panAnimationStartOffset = this.offset;
        }
    }
    
    // Animate zoom using requestAnimationFrame
    animateZoom() {
        const currentTime = Date.now();
        const elapsed = currentTime - this.animationStartTime;
        const progress = Math.min(elapsed / this.animationDuration, 1);
        
        // Use easing function for smooth animation (ease-out)
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        
        // Interpolate between start and target zoom
        this.zoom = this.animationStartZoom + (this.targetZoom - this.animationStartZoom) * easedProgress;
        
        // Recalculate layout when zoom changes
        this.calculateItemLayout();
        this.draw();
        
        // Continue animation if not complete
        if (progress < 1) {
            requestAnimationFrame(() => this.animateZoom());
        } else {
            this.isAnimating = false;
            this.zoom = this.targetZoom; // Ensure we end exactly at target
        }
        
        // Check if we need to continue animating for markers
        this.checkMarkerAnimations();
    }
    
    // Animate pan using requestAnimationFrame
    animatePan() {
        const currentTime = Date.now();
        const elapsed = currentTime - this.panAnimationStartTime;
        const progress = Math.min(elapsed / this.panAnimationDuration, 1);
        
        // Use easing function for smooth animation (ease-out)
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        
        // Interpolate between start and target offset
        const interpolatedOffset = this.panAnimationStartOffset + (this.targetOffset - this.panAnimationStartOffset) * easedProgress;
        this.offset = this.constrainOffset(interpolatedOffset);
        
        // Recalculate layout when offset changes
        this.calculateItemLayout();
        this.draw();
        
        // Continue animation if not complete
        if (progress < 1) {
            requestAnimationFrame(() => this.animatePan());
        } else {
            this.isPanAnimating = false;
            this.offset = this.constrainOffset(this.targetOffset); // Ensure we end exactly at target
        }
        
        // Check if we need to continue animating for markers
        this.checkMarkerAnimations();
    }
    
    // Check if marker animations are running and continue if needed
    checkMarkerAnimations() {
        const hasActiveAnimations = this.markerAnimations.size > 0;
        
        if (hasActiveAnimations && !this.isAnimating && !this.isPanAnimating) {
            // Continue animation loop for markers
            requestAnimationFrame(() => {
                this.draw();
                this.checkMarkerAnimations();
            });
        }
    }
    
    // Normalize wheel delta for different input devices
    normalizeDelta(deltaY, deltaMode) {
        // Different devices report different delta values
        // deltaMode: 0 = pixels, 1 = lines, 2 = pages
        
        let normalizedDelta = deltaY;
        
        switch (deltaMode) {
            case 1: // Lines (most mouse wheels)
                normalizedDelta = deltaY * 16; // ~16 pixels per line
                break;
            case 2: // Pages
                normalizedDelta = deltaY * 400; // ~400 pixels per page
                break;
            default: // Pixels (touchpads usually)
                normalizedDelta = deltaY;
                break;
        }
        
        // Clamp to prevent extremely large values
        normalizedDelta = Math.max(-100, Math.min(normalizedDelta, 100));
        
        return normalizedDelta;
    }
    
    setupEventListeners() {
        // Mouse wheel for zooming with touchpad optimization
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            
            const currentTime = Date.now();
            
            // Throttle wheel events to prevent excessive touchpad scrolling
            if (currentTime - this.lastWheelTime < this.wheelThrottleDelay) {
                // Accumulate delta during throttle period
                this.accumulatedDelta += e.deltaY;
                return;
            }
            
            // Use accumulated delta if available, otherwise use current delta
            const deltaY = this.accumulatedDelta !== 0 ? this.accumulatedDelta : e.deltaY;
            this.accumulatedDelta = 0;
            this.lastWheelTime = currentTime;
            
            // Normalize delta for different input devices
            const normalizedDelta = this.normalizeDelta(deltaY, e.deltaMode);
            
            // Calculate zoom factor based on normalized delta
            const sensitivity = 0.002; // Reduced sensitivity for touchpads
            const zoomChange = normalizedDelta * sensitivity;
            const zoomFactor = Math.exp(-zoomChange); // Exponential zoom for smooth scaling
            
            // Calculate new target zoom
            const newTargetZoom = this.targetZoom * zoomFactor;
            
            // Limit zoom levels to prevent irrational behavior
            // Min: ~1 pixel per 100 billion years, Max: ~100 pixels per hour
            this.targetZoom = Math.max(0.0000000001, Math.min(newTargetZoom, 2400));
            
            // Start zoom animation
            this.startZoomAnimation();
        });
        
        // Mouse events for panning and duration bar interaction
        this.canvas.addEventListener('mousedown', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Check if click is on a timeline item first
            if (this.handleTimelineItemClick(x, y)) {
                return; // Timeline item click handled, don't start dragging
            }
            
            // Start panning
            this.isDragging = true;
            this.lastMouseX = e.clientX;
        });
        
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                const deltaX = e.clientX - this.lastMouseX;
                const newOffset = this.offset - deltaX / this.zoom; // Convert pixels to days
                this.offset = this.constrainOffset(newOffset);
                this.lastMouseX = e.clientX;
                this.calculateItemLayout(); // Recalculate layout when panning
                this.draw();
            }
        });
        
        this.canvas.addEventListener('mouseup', () => {
            this.isDragging = false;
        });
        
        this.canvas.addEventListener('mouseleave', () => {
            this.isDragging = false;
        });
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.setupCanvas();
            this.draw();
        });
    }
    
    // Determine the appropriate time scale based on zoom level
    getTimeScale() {
        const pixelsPerDay = this.zoom;
        const canvasWidth = window.innerWidth;
        const visibleDays = canvasWidth / pixelsPerDay;
        
        // Find the scale that gives us 8-30 markers across the screen (denser information)
        let bestScale = this.timeScales[0];
        let bestDiff = Infinity;
        
        for (let scale of this.timeScales) {
            const markersCount = visibleDays / scale.days;
            
            // If we found a scale in the ideal range, return it
            if (markersCount >= 8 && markersCount <= 30) {
                return scale;
            }
            
            // Track the scale that gets us closest to the ideal range
            const targetMarkers = 15; // Aim for 15 markers (denser)
            const diff = Math.abs(markersCount - targetMarkers);
            if (diff < bestDiff) {
                bestDiff = diff;
                bestScale = scale;
            }
        }
        
        // Return the best scale if no perfect match was found
        return bestScale;
    }
    
    // Get marker positions for the current view
    getMarkers() {
        const scale = this.getTimeScale();
        const markers = [];
        const canvasWidth = window.innerWidth;
        const pixelsPerDay = this.zoom;
        
        // Calculate visible date range
        const centerTime = this.centerDate.getTime() + (this.offset * 24 * 60 * 60 * 1000);
        const visibleDays = canvasWidth / (2 * pixelsPerDay);
        let startTime = centerTime - visibleDays * 24 * 60 * 60 * 1000;
        let endTime = centerTime + visibleDays * 24 * 60 * 60 * 1000;
        
        // Constrain to Big Bang limit (don't show dates before 13.8 billion years ago)
        const bigBangTime = this.centerDate.getTime() - (this.bigBangLimitDays * 24 * 60 * 60 * 1000);
        startTime = Math.max(bigBangTime, startTime);
        endTime = Math.max(bigBangTime, endTime);
        
        const startDate = new Date(startTime);
        const endDate = new Date(endTime);
        
        // Track which markers should be visible
        const currentMarkerKeys = new Set();
        
        // Generate primary markers based on main scale
        this.generateMarkersForScale(scale, startDate, endDate, markers, currentMarkerKeys, false);
        
        // Generate secondary markers from smaller time scale
        const secondaryScale = this.getSmallerTimeScale(scale);
        if (secondaryScale) {
            // Check if we're in extreme date range where Date objects fail
            const baseCenterYear = this.centerDate.getFullYear();
            const offsetYears = this.offset / 365.25;
            const currentYear = baseCenterYear + offsetYears;
            const isExtremeRange = Math.abs(currentYear) > 250000;
            
            if (isExtremeRange) {
                // Use large scale marker generation even for smaller scales in extreme ranges
                this.generateLargeScaleMarkers(secondaryScale, startDate, endDate, markers, currentMarkerKeys, 'secondary');
            } else {
                this.generateMarkersForScale(secondaryScale, startDate, endDate, markers, currentMarkerKeys, 'secondary');
            }
        }
        
        // Generate tertiary markers (hints) from larger time scale
        const tertiaryScale = this.getLargerTimeScale(scale);
        if (tertiaryScale) {
            // Check if we're in extreme date range where Date objects fail
            const baseCenterYear = this.centerDate.getFullYear();
            const offsetYears = this.offset / 365.25;
            const currentYear = baseCenterYear + offsetYears;
            const isExtremeRange = Math.abs(currentYear) > 250000;
            
            if (isExtremeRange) {
                // Use large scale marker generation even for smaller scales in extreme ranges
                this.generateLargeScaleMarkers(tertiaryScale, startDate, endDate, markers, currentMarkerKeys, 'tertiary');
            } else {
                this.generateMarkersForScale(tertiaryScale, startDate, endDate, markers, currentMarkerKeys, 'tertiary');
            }
        }
        
        // Mark markers that should disappear for fade-out animation
        this.updateMarkerAnimations(currentMarkerKeys);
        
        // Add markers that are fading out
        for (let [key, animationState] of this.markerAnimations) {
            if (!currentMarkerKeys.has(key) && animationState.scale > 0) {
                // Reconstruct marker from key for fade-out
                const [unit, timestamp] = key.split('-');
                const date = new Date(parseInt(timestamp));
                const dayOffset = (date.getTime() - this.centerDate.getTime()) / (24 * 60 * 60 * 1000);
                const x = canvasWidth / 2 + (dayOffset - this.offset) * pixelsPerDay;
                
                // Use the stored original marker type to avoid glitches
                const markerType = animationState.originalMarkerType || 'primary';
                
                markers.push({
                    x: x,
                    date: date,
                    scale: { unit: unit },
                    key: key,
                    animationState: animationState,
                    markerType: markerType
                });
            }
        }
        
        return markers;
    }
    
    // Generate markers for a specific time scale
    generateMarkersForScale(scale, startDate, endDate, markers, currentMarkerKeys, markerType) {
        const canvasWidth = window.innerWidth;
        const pixelsPerDay = this.zoom;
        
        // Check if we're in extreme date range where Date objects fail
        const baseCenterYear = this.centerDate.getFullYear();
        const offsetYears = this.offset / 365.25;
        const currentYear = baseCenterYear + offsetYears;
        const isExtremeRange = Math.abs(currentYear) > 250000;
        
        // For very large scales OR extreme date ranges, use a different approach to avoid Date object limitations
        if (isExtremeRange || scale.unit === 'billion' || scale.unit === 'hundred-million' || scale.unit === 'ten-million' || 
            scale.unit === 'million' || scale.unit === 'hundred-thousand' || scale.unit === 'ten-thousand') {
            this.generateLargeScaleMarkers(scale, startDate, endDate, markers, currentMarkerKeys, markerType);
            return;
        }
        
        let currentDate = new Date(startDate);
        this.alignDateToScale(currentDate, scale);
        
        while (currentDate <= endDate) {
            const dayOffset = (currentDate.getTime() - this.centerDate.getTime()) / (24 * 60 * 60 * 1000);
            const x = canvasWidth / 2 + (dayOffset - this.offset) * pixelsPerDay;
            
            if (x >= -100 && x <= canvasWidth + 100) {
                // Create unique key for this marker
                const markerKey = `${scale.unit}-${currentDate.getTime()}`;
                currentMarkerKeys.add(markerKey);
                
                // Get or create animation state for this marker
                const finalMarkerType = markerType || 'primary';
                const animationState = this.getMarkerAnimationState(markerKey, true, finalMarkerType);
                
                markers.push({
                    x: x,
                    date: new Date(currentDate),
                    scale: scale,
                    key: markerKey,
                    animationState: animationState,
                    markerType: finalMarkerType
                });
            }
            
            this.incrementDate(currentDate, scale);
        }
    }
    
    // Generate markers for very large time scales (avoiding Date object limitations)
    generateLargeScaleMarkers(scale, startDate, endDate, markers, currentMarkerKeys, markerType) {
        const canvasWidth = window.innerWidth;
        const pixelsPerDay = this.zoom;
        
        // Calculate center year without using Date objects (to avoid JS Date limitations)
        const baseCenterYear = this.centerDate.getFullYear();
        const offsetYears = this.offset / 365.25; // Convert days to years
        const centerYear = baseCenterYear + offsetYears;
        
        // Calculate visible range in years for this scale
        const visibleDays = canvasWidth / pixelsPerDay;
        const visibleYears = visibleDays / 365.25; // Use more accurate year length
        
        // For hour/day/month scales, we need to be more precise
        if (scale.unit === 'hour' || scale.unit === 'day' || scale.unit === 'month') {
            // Calculate start and end in days instead of years for precision
            const centerDays = this.offset;
            const startDays = centerDays - visibleDays / 2;
            const endDays = centerDays + visibleDays / 2;
            
            // Determine step size in days
            let stepDays;
            let alignmentFunction;
            
            switch (scale.unit) {
                case 'hour':
                    stepDays = 1/24; // 1 hour in days
                    alignmentFunction = (days) => Math.floor(days * 24) / 24; // Align to hour
                    break;
                case 'day':
                    stepDays = 1;
                    alignmentFunction = (days) => Math.floor(days); // Align to day
                    break;
                case 'month':
                    // For months, we'll handle it differently since months have variable lengths
                    // We'll generate based on actual month boundaries
                    const startYear = Math.floor(baseCenterYear + startDays / 365.25);
                    const endYear = Math.ceil(baseCenterYear + endDays / 365.25);
                    
                    for (let year = startYear; year <= endYear; year++) {
                        for (let month = 0; month < 12; month++) {
                            // Calculate the offset in days for this month
                            const yearOffset = year - baseCenterYear;
                            const monthOffset = month / 12; // Fraction of year
                            const totalYearOffset = yearOffset + monthOffset;
                            const dayOffset = totalYearOffset * 365.25;
                            
                            const x = canvasWidth / 2 + (dayOffset - this.offset) * pixelsPerDay;
                            
                            if (x >= -100 && x <= canvasWidth + 100) {
                                // Create synthetic date for display
                                const markerDate = new Date(2000, month, 1);
                                
                                const markerKey = `${scale.unit}-${year}-${month}`;
                                currentMarkerKeys.add(markerKey);
                                
                                const finalMarkerType = markerType || 'primary';
                                const animationState = this.getMarkerAnimationState(markerKey, true, finalMarkerType);
                                
                                markers.push({
                                    x: x,
                                    date: markerDate,
                                    scale: scale,
                                    key: markerKey,
                                    animationState: animationState,
                                    markerType: finalMarkerType,
                                    actualYear: year
                                });
                            }
                        }
                    }
                    return; // Exit early for months
            }
            
            // Generate markers for hours and days
            const alignedStartDays = alignmentFunction(startDays);
            const alignedEndDays = alignmentFunction(endDays) + stepDays;
            
            for (let days = alignedStartDays; days <= alignedEndDays; days += stepDays) {
                const x = canvasWidth / 2 + (days - this.offset) * pixelsPerDay;
                
                if (x >= -100 && x <= canvasWidth + 100) {
                    // Calculate the actual year and time
                    const totalDays = days + (this.centerDate.getTime() / (24 * 60 * 60 * 1000));
                    const yearFromDays = baseCenterYear + days / 365.25;
                    const actualYear = Math.floor(yearFromDays);
                    
                    // Create synthetic date for display
                    let markerDate = new Date(2000, 0, 1);
                    
                    if (scale.unit === 'hour') {
                        // Calculate hour of day
                        const dayFraction = days - Math.floor(days);
                        const hour = Math.floor(dayFraction * 24);
                        markerDate.setHours(hour);
                    } else if (scale.unit === 'day') {
                        // Calculate day of year
                        const yearFraction = yearFromDays - actualYear;
                        const dayOfYear = Math.floor(yearFraction * 365);
                        
                        // Convert day of year to month/day
                        const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
                        let remainingDays = dayOfYear;
                        
                        for (let i = 0; i < 12; i++) {
                            if (remainingDays < monthDays[i]) {
                                markerDate.setMonth(i);
                                markerDate.setDate(remainingDays + 1);
                                break;
                            }
                            remainingDays -= monthDays[i];
                        }
                    }
                    
                    const markerKey = `${scale.unit}-${days}`;
                    currentMarkerKeys.add(markerKey);
                    
                    const finalMarkerType = markerType || 'primary';
                    const animationState = this.getMarkerAnimationState(markerKey, true, finalMarkerType);
                    
                    markers.push({
                        x: x,
                        date: markerDate,
                        scale: scale,
                        key: markerKey,
                        animationState: animationState,
                        markerType: finalMarkerType,
                        actualYear: actualYear
                    });
                }
            }
            return; // Exit early for hour/day scales
        }
        
        // For larger scales (year and above), use the existing year-based approach
        // Determine step size based on scale
        let stepYears;
        switch (scale.unit) {
            case 'year':
                stepYears = 1;
                break;
            case 'decade':
                stepYears = 10;
                break;
            case 'century':
                stepYears = 100;
                break;
            case 'millennium':
                stepYears = 1000;
                break;
            case 'ten-thousand':
                stepYears = 10000;
                break;
            case 'hundred-thousand':
                stepYears = 100000;
                break;
            case 'million':
                stepYears = 1000000;
                break;
            case 'ten-million':
                stepYears = 10000000;
                break;
            case 'hundred-million':
                stepYears = 100000000;
                break;
            case 'billion':
                stepYears = 1000000000;
                break;
            default:
                stepYears = 1; // Default to 1 year
                break;
        }
        
        // Find the starting year aligned to the scale
        const startYear = Math.floor((centerYear - visibleYears/2) / stepYears) * stepYears;
        const endYear = Math.ceil((centerYear + visibleYears/2) / stepYears) * stepYears;
        
        // Constrain to Big Bang limit (don't show markers before 13.8 billion years ago)
        const bigBangYear = -13.8e9;
        const constrainedStartYear = Math.max(bigBangYear, startYear);
        const constrainedEndYear = Math.max(bigBangYear, endYear);
        
        // Generate markers
        for (let year = constrainedStartYear; year <= constrainedEndYear; year += stepYears) {
            // Calculate position relative to base center date (without offset)
            const baseCenterYear = this.centerDate.getFullYear();
            const yearOffsetFromBase = year - baseCenterYear;
            const dayOffsetFromBase = yearOffsetFromBase * 365.25; // Convert to days
            const x = canvasWidth / 2 + (dayOffsetFromBase - this.offset) * pixelsPerDay;
            
            if (x >= -100 && x <= canvasWidth + 100) {
                // Create a representative date (use year 0 as base if year is too extreme)
                let markerDate;
                try {
                    markerDate = new Date(year, 0, 1);
                    // Check if date is valid
                    if (isNaN(markerDate.getTime())) {
                        markerDate = new Date(0, 0, 1);
                        markerDate.year = year; // Store the actual year as a property
                    }
                } catch (e) {
                    markerDate = new Date(0, 0, 1);
                    markerDate.year = year; // Store the actual year as a property
                }
                
                // Create unique key for this marker
                const markerKey = `${scale.unit}-${year}`;
                currentMarkerKeys.add(markerKey);
                
                // Get or create animation state for this marker
                const finalMarkerType = markerType || 'primary';
                const animationState = this.getMarkerAnimationState(markerKey, true, finalMarkerType);
                
                markers.push({
                    x: x,
                    date: markerDate,
                    scale: scale,
                    key: markerKey,
                    animationState: animationState,
                    markerType: finalMarkerType,
                    actualYear: year // Store the actual year for formatting
                });
            }
        }
    }
    
    // Get the smaller time scale for secondary markers
    getSmallerTimeScale(currentScale) {
        const currentIndex = this.timeScales.findIndex(scale => scale.unit === currentScale.unit);
        
        // Return the previous (smaller) scale if it exists
        if (currentIndex > 0) {
            return this.timeScales[currentIndex - 1];
        }
        
        return null; // No smaller scale available
    }
    
    // Get the larger time scale for tertiary markers (hints)
    getLargerTimeScale(currentScale) {
        const currentIndex = this.timeScales.findIndex(scale => scale.unit === currentScale.unit);
        
        // Return the next (larger) scale if it exists
        if (currentIndex < this.timeScales.length - 1) {
            return this.timeScales[currentIndex + 1];
        }
        
        return null; // No larger scale available
    }
    
    // Get or create animation state for a marker
    getMarkerAnimationState(markerKey, appearing, markerType) {
        if (!this.markerAnimations.has(markerKey)) {
            // For initial load, make markers immediately visible to avoid blank timeline
            const shouldAppear = appearing && !this.isInitialLoad;
            
            // New marker - start animation (or appear immediately on initial load)
            this.markerAnimations.set(markerKey, {
                scale: shouldAppear ? 0 : 1,
                opacity: shouldAppear ? 0 : 1,
                startTime: Date.now(),
                appearing: shouldAppear,
                disappearing: false,
                originalMarkerType: markerType || 'primary' // Store original type
            });
        }
        return this.markerAnimations.get(markerKey);
    }
    
    // Update marker animations based on current visible markers
    updateMarkerAnimations(currentMarkerKeys) {
        const now = Date.now();
        
        // Mark markers for disappearing if they're no longer in current set
        for (let [key, animationState] of this.markerAnimations) {
            if (!currentMarkerKeys.has(key) && !animationState.disappearing) {
                animationState.disappearing = true;
                animationState.startTime = now;
            }
        }
        
        // Update all animations
        for (let [key, animationState] of this.markerAnimations) {
            const elapsed = now - animationState.startTime;
            const progress = Math.min(elapsed / this.markerAnimationDuration, 1);
            const easedProgress = 1 - Math.pow(1 - progress, 2); // Ease-out
            
            if (animationState.appearing && !animationState.disappearing) {
                // Appearing animation
                animationState.scale = easedProgress;
                animationState.opacity = easedProgress;
                
                if (progress >= 1) {
                    animationState.appearing = false;
                }
            } else if (animationState.disappearing) {
                // Disappearing animation
                animationState.scale = 1 - easedProgress;
                animationState.opacity = 1 - easedProgress;
                
                if (progress >= 1) {
                    // Remove completed animations
                    this.markerAnimations.delete(key);
                }
            }
        }
    }
    
    // Align date to the beginning of the time scale unit
    alignDateToScale(date, scale) {
        switch (scale.unit) {
            case 'hour':
                date.setMinutes(0, 0, 0);
                break;
            case 'day':
                date.setHours(0, 0, 0, 0);
                break;
            case 'month':
                date.setDate(1);
                date.setHours(0, 0, 0, 0);
                break;
            case 'year':
                date.setMonth(0, 1);
                date.setHours(0, 0, 0, 0);
                break;
            case 'decade':
                const decade = Math.floor(date.getFullYear() / 10) * 10;
                date.setFullYear(decade, 0, 1);
                date.setHours(0, 0, 0, 0);
                break;
            case 'century':
                const century = Math.floor(date.getFullYear() / 100) * 100;
                date.setFullYear(century, 0, 1);
                date.setHours(0, 0, 0, 0);
                break;
            case 'millennium':
                const millennium = Math.floor(date.getFullYear() / 1000) * 1000;
                date.setFullYear(millennium, 0, 1);
                date.setHours(0, 0, 0, 0);
                break;
            case 'ten-thousand':
                const tenThousand = Math.floor(date.getFullYear() / 10000) * 10000;
                date.setFullYear(tenThousand, 0, 1);
                date.setHours(0, 0, 0, 0);
                break;
            case 'hundred-thousand':
                const hundredThousand = Math.floor(date.getFullYear() / 100000) * 100000;
                date.setFullYear(hundredThousand, 0, 1);
                date.setHours(0, 0, 0, 0);
                break;
            case 'million':
                const million = Math.floor(date.getFullYear() / 1000000) * 1000000;
                date.setFullYear(million, 0, 1);
                date.setHours(0, 0, 0, 0);
                break;
            case 'ten-million':
                const tenMillion = Math.floor(date.getFullYear() / 10000000) * 10000000;
                date.setFullYear(tenMillion, 0, 1);
                date.setHours(0, 0, 0, 0);
                break;
            case 'hundred-million':
                const hundredMillion = Math.floor(date.getFullYear() / 100000000) * 100000000;
                date.setFullYear(hundredMillion, 0, 1);
                date.setHours(0, 0, 0, 0);
                break;
            case 'billion':
                const billion = Math.floor(date.getFullYear() / 1000000000) * 1000000000;
                date.setFullYear(billion, 0, 1);
                date.setHours(0, 0, 0, 0);
                break;
        }
    }
    
    // Increment date by one unit of the time scale
    incrementDate(date, scale) {
        switch (scale.unit) {
            case 'hour':
                date.setHours(date.getHours() + 1);
                break;
            case 'day':
                date.setDate(date.getDate() + 1);
                break;
            case 'month':
                date.setMonth(date.getMonth() + 1);
                break;
            case 'year':
                date.setFullYear(date.getFullYear() + 1);
                break;
            case 'decade':
                date.setFullYear(date.getFullYear() + 10);
                break;
            case 'century':
                date.setFullYear(date.getFullYear() + 100);
                break;
            case 'millennium':
                date.setFullYear(date.getFullYear() + 1000);
                break;
            case 'ten-thousand':
                date.setFullYear(date.getFullYear() + 10000);
                break;
            case 'hundred-thousand':
                date.setFullYear(date.getFullYear() + 100000);
                break;
            case 'million':
                date.setFullYear(date.getFullYear() + 1000000);
                break;
            case 'ten-million':
                date.setFullYear(date.getFullYear() + 10000000);
                break;
            case 'hundred-million':
                date.setFullYear(date.getFullYear() + 100000000);
                break;
            case 'billion':
                date.setFullYear(date.getFullYear() + 1000000000);
                break;
        }
    }
    
    // Format date label based on scale
    formatDateLabel(date, scale, actualYear = null) {
        // For extreme years, we need to handle all scales differently
        const year = actualYear !== null ? actualYear : (date ? date.getFullYear() : 0);
        
        switch (scale.unit) {
            case 'hour':
                // Always try to format as hour first
                try {
                    return date.toLocaleTimeString([], { hour: 'numeric', minute: undefined });
                } catch (e) {
                    // Fallback for extreme years
                    if (actualYear !== null) {
                        const hour = Math.abs(Math.floor(actualYear)) % 24;
                        const hour12 = hour === 0 ? 12 : (hour > 12 ? hour - 12 : hour);
                        const ampm = hour < 12 ? 'AM' : 'PM';
                        return `${hour12} ${ampm}`;
                    }
                    return '12 AM';
                }
            case 'day':
                // Always try to format as day first
                try {
                    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                } catch (e) {
                    // Fallback for extreme years
                    if (actualYear !== null) {
                        const dayInYear = Math.abs(Math.floor(actualYear)) % 365;
                        const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
                        let month = 0;
                        let day = dayInYear + 1;
                        for (let i = 0; i < 12; i++) {
                            if (day <= monthDays[i]) {
                                month = i;
                                break;
                            }
                            day -= monthDays[i];
                        }
                        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        return `${monthNames[month]} ${day}`;
                    }
                    return 'Jan 1';
                }
            case 'month':
                // Always try to format as month first
                try {
                    return date.toLocaleDateString([], { month: 'short' });
                } catch (e) {
                    // Fallback for extreme years
                    if (actualYear !== null) {
                        const monthIndex = Math.abs(Math.floor(actualYear)) % 12;
                        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        return monthNames[monthIndex];
                    }
                    return 'Jan';
                }
            case 'year':
                return year <= 0 ? `${Math.abs(year)} BC` : year.toString();
            case 'decade':
                const decadeYear = Math.floor(year / 10) * 10;
                return decadeYear <= 0 ? `${Math.abs(decadeYear)} BC` : decadeYear.toString();
            case 'century':
                const centuryStartYear = Math.floor(year / 100) * 100;
                if (centuryStartYear <= 0) {
                    return centuryStartYear === 0 ? '0' : `${Math.abs(centuryStartYear)} BC`;
                }
                return centuryStartYear.toString();
            case 'millennium':
                const millenniumStartYear = Math.floor(year / 1000) * 1000;
                if (millenniumStartYear <= 0) {
                    return millenniumStartYear === 0 ? '0' : `${Math.abs(millenniumStartYear)} BC`;
                }
                return millenniumStartYear.toString();
            case 'ten-thousand':
                if (year <= 0) {
                    return year === 0 ? '0' : `${Math.abs(year/1000)}K BC`;
                }
                return `${year/1000}K`;
            case 'hundred-thousand':
                if (year <= 0) {
                    return year === 0 ? '0' : `${Math.abs(year/1000)}K BC`;
                }
                return `${year/1000}K`;
            case 'million':
                if (year <= 0) {
                    return year === 0 ? '0' : `${Math.abs(year/1000000)}M BC`;
                }
                return `${year/1000000}M`;
            case 'ten-million':
                if (year <= 0) {
                    return year === 0 ? '0' : `${Math.abs(year/1000000)}M BC`;
                }
                return `${year/1000000}M`;
            case 'hundred-million':
                if (year <= 0) {
                    return year === 0 ? '0' : `${Math.abs(year/1000000)}M BC`;
                }
                return `${year/1000000}M`;
            case 'billion':
                if (year <= 0) {
                    return year === 0 ? '0' : `${Math.abs(year/1000000000)}B BC`;
                }
                return `${year/1000000000}B`;
            default:
                // Fallback for any scale we missed
                if (actualYear !== null) {
                    return year <= 0 ? `${Math.abs(year)} BC` : year.toString();
                }
                try {
                    return date.toLocaleDateString();
                } catch (e) {
                    return year <= 0 ? `${Math.abs(year)} BC` : year.toString();
                }
        }
    }
    
    getOrdinalSuffix(num) {
        const j = num % 10;
        const k = num % 100;
        if (j == 1 && k != 11) return "st";
        if (j == 2 && k != 12) return "nd";
        if (j == 3 && k != 13) return "rd";
        return "th";
    }
    
    // Format center date based on current scale
    formatCenterDate(date, scale, actualYear = null, actualMonth = null, actualDay = null) {
        const year = actualYear !== null ? Math.floor(actualYear) : date.getFullYear();
        
        switch (scale.unit) {
            case 'decade':
            case 'century':
            case 'millennium':
            case 'ten-thousand':
            case 'hundred-thousand':
            case 'million':
            case 'ten-million':
            case 'hundred-million':
            case 'billion':
                // Show just the year for large scales
                if (year <= 0) {
                    return year === 0 ? '0' : `${Math.abs(year)} BC`;
                }
                return year.toString();
                
            case 'year':
                // Show month and year: "June, 2025" or "March 31,763 BC"
                let monthName = 'January'; // Default for extreme years
                if (date && actualYear === null) {
                    try {
                        monthName = date.toLocaleDateString([], { month: 'long' });
                    } catch (e) {
                        monthName = 'January';
                    }
                } else if (actualMonth !== null) {
                    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                                       'July', 'August', 'September', 'October', 'November', 'December'];
                    monthName = monthNames[actualMonth];
                }
                if (year <= 0) {
                    return year === 0 ? `${monthName}, 0` : `${monthName} ${Math.abs(year)} BC`;
                }
                return `${monthName}, ${year}`;
                
            case 'month':
                // Show month, day with ordinal, and year: "June 3rd, 2025"
                let monthNameFull = 'January'; // Default for extreme years
                let day = 1; // Default for extreme years
                if (date && actualYear === null) {
                    try {
                        monthNameFull = date.toLocaleDateString([], { month: 'long' });
                        day = date.getDate();
                    } catch (e) {
                        monthNameFull = 'January';
                        day = 1;
                    }
                } else if (actualMonth !== null && actualDay !== null) {
                    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                                       'July', 'August', 'September', 'October', 'November', 'December'];
                    monthNameFull = monthNames[actualMonth];
                    day = actualDay;
                }
                const dayWithOrdinal = `${day}${this.getOrdinalSuffix(day)}`;
                if (year <= 0) {
                    return year === 0 ? `${monthNameFull} ${dayWithOrdinal}, 0` : `${monthNameFull} ${dayWithOrdinal}, ${Math.abs(year)} BC`;
                }
                return `${monthNameFull} ${dayWithOrdinal}, ${year}`;
                
            case 'day':
            case 'hour':
            default:
                // Show month, day with ordinal, and year: "June 5th, 2025"
                // For hour scale, also show the time
                let monthNameSmall = 'January'; // Default for extreme years
                let dayNum = 1; // Default for extreme years
                let hourDisplay = '';
                
                if (date && actualYear === null) {
                    try {
                        monthNameSmall = date.toLocaleDateString([], { month: 'long' });
                        dayNum = date.getDate();
                        if (scale.unit === 'hour') {
                            hourDisplay = ', ' + date.toLocaleTimeString([], { hour: 'numeric', minute: undefined });
                        }
                    } catch (e) {
                        monthNameSmall = 'January';
                        dayNum = 1;
                    }
                } else if (actualMonth !== null && actualDay !== null) {
                    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                                       'July', 'August', 'September', 'October', 'November', 'December'];
                    monthNameSmall = monthNames[actualMonth];
                    dayNum = actualDay;
                    
                    // For hour scale with synthetic date, extract hour
                    if (scale.unit === 'hour' && date && date.getHours !== undefined) {
                        try {
                            hourDisplay = ', ' + date.toLocaleTimeString([], { hour: 'numeric', minute: undefined });
                        } catch (e) {
                            // Fallback if toLocaleTimeString fails
                            const hour = date.getHours();
                            const hour12 = hour === 0 ? 12 : (hour > 12 ? hour - 12 : hour);
                            const ampm = hour < 12 ? 'AM' : 'PM';
                            hourDisplay = `, ${hour12} ${ampm}`;
                        }
                    }
                }
                const dayWithOrdinalSmall = `${dayNum}${this.getOrdinalSuffix(dayNum)}`;
                if (year <= 0) {
                    return year === 0 ? `${monthNameSmall} ${dayWithOrdinalSmall}, 0${hourDisplay}` : `${monthNameSmall} ${dayWithOrdinalSmall}, ${Math.abs(year)} BC${hourDisplay}`;
                }
                return `${monthNameSmall} ${dayWithOrdinalSmall}, ${year}${hourDisplay}`;
        }
    }
    
    draw() {
        const ctx = this.ctx;
        // Use logical canvas dimensions (CSS pixels) instead of scaled canvas dimensions
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        // Clear canvas (use scaled dimensions for clearRect)
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw duration bars below the timeline
        this.drawDurationBars();
        
        // Draw timeline base line
        const timelineY = 100; // 100px from top of screen
        ctx.strokeStyle = '#666666';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, timelineY);
        ctx.lineTo(width, timelineY);
        ctx.stroke();
        
        // Draw events on the timeline
        this.drawEvents();
        
        // Get and draw markers
        const markers = this.getMarkers();
        
        markers.forEach(marker => {
            const animState = marker.animationState;
            
            // Skip markers that are completely invisible
            if (animState && (animState.scale <= 0 || animState.opacity <= 0)) {
                return;
            }
            
            // Apply animation transformations
            if (animState) {
                ctx.save();
                ctx.globalAlpha = animState.opacity;
                
                // Apply scaling transformation around marker center
                ctx.translate(marker.x, timelineY);
                ctx.scale(animState.scale, animState.scale);
                ctx.translate(-marker.x, -timelineY);
            }
            
            // Determine marker styling based on marker type
            const markerType = marker.markerType || 'primary';
            
            if (markerType === 'secondary') {
                // Draw smaller secondary marker line
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 0.5;
                ctx.beginPath();
                ctx.moveTo(marker.x, timelineY - 10);
                ctx.lineTo(marker.x, timelineY + 10);
                ctx.stroke();
                // No label for secondary markers
            } else if (markerType === 'tertiary') {
                // Draw thick tertiary marker line (hint for larger scale)
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(marker.x, timelineY - 20);
                ctx.lineTo(marker.x, timelineY + 20);
                ctx.stroke();
                // No label for tertiary markers
            } else {
                // Draw primary marker line
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(marker.x, timelineY - 20);
                ctx.lineTo(marker.x, timelineY + 20);
                ctx.stroke();
                
                // Draw marker label for primary markers only
                const label = this.formatDateLabel(marker.date, marker.scale, marker.actualYear);
                ctx.fillStyle = '#333333';
                ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(label, marker.x, timelineY - 25);
            }
            
            // Restore canvas state if we applied transformations
            if (animState) {
                ctx.restore();
            }
        });
        
        // Draw center indicator
        ctx.strokeStyle = '#FF6B6B';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(width / 2, timelineY - 20);
        ctx.lineTo(width / 2, timelineY + 20);
        ctx.stroke();
        
        // Draw current date/time based on scale
        const currentScale = this.getTimeScale();
        const baseCenterYear = this.centerDate.getFullYear();
        const baseCenterTime = this.centerDate.getTime();
        
        // Calculate the exact position we're looking at
        const offsetMilliseconds = this.offset * 24 * 60 * 60 * 1000;
        const currentTimeMillis = baseCenterTime + offsetMilliseconds;
        
        // Calculate year from offset (same as marker generation)
        const offsetYears = this.offset / 365.25;
        const currentYear = baseCenterYear + offsetYears;
        
        // Try to create a valid Date object, fall back to manual calculation for extreme dates
        let centerDate = null;
        let actualYear = null;
        let actualMonth = null;
        let actualDay = null;
        
        try {
            // Try to create a Date object if the year is within reasonable range
            if (Math.abs(currentYear) < 250000) { // Within JavaScript Date object limits
                centerDate = new Date(currentTimeMillis);
                // Check if the Date is valid
                if (isNaN(centerDate.getTime())) {
                    centerDate = null;
                    actualYear = Math.floor(currentYear);
                }
            } else {
                // For extreme years, we need to match the marker generation logic
                actualYear = Math.floor(currentYear);
                
                // For hour/day/month scales, calculate based on total days
                if (currentScale.unit === 'hour' || currentScale.unit === 'day' || currentScale.unit === 'month') {
                    // Total days from epoch (matching marker generation)
                    const totalDays = this.offset;
                    
                    // For hours, we need to know the hour of the day
                    if (currentScale.unit === 'hour') {
                        const dayFraction = totalDays - Math.floor(totalDays);
                        const hourOfDay = Math.floor(dayFraction * 24);
                        
                        // Calculate which day we're on
                        const yearFraction = currentYear - actualYear;
                        const dayOfYear = Math.floor(yearFraction * 365);
                        
                        // Convert day of year to month/day
                        const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
                        let remainingDays = dayOfYear;
                        actualMonth = 0;
                        actualDay = 1;
                        
                        for (let i = 0; i < 12; i++) {
                            if (remainingDays < monthDays[i]) {
                                actualMonth = i;
                                actualDay = remainingDays + 1;
                                break;
                            }
                            remainingDays -= monthDays[i];
                        }
                        
                        // Create a synthetic date to show the hour
                        centerDate = new Date(2000, actualMonth, actualDay, hourOfDay);
                    } else {
                        // For day and month scales
                        const yearFraction = currentYear - actualYear;
                        const dayOfYear = Math.floor(yearFraction * 365);
                        
                        // Convert day of year to month/day
                        const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
                        let remainingDays = dayOfYear;
                        actualMonth = 0;
                        actualDay = 1;
                        
                        for (let i = 0; i < 12; i++) {
                            if (remainingDays < monthDays[i]) {
                                actualMonth = i;
                                actualDay = remainingDays + 1;
                                break;
                            }
                            remainingDays -= monthDays[i];
                        }
                    }
                } else {
                    // For larger scales (year and above), use simple year fraction
                    const yearFraction = currentYear - actualYear;
                    const dayOfYear = Math.floor(yearFraction * 365);
                    
                    // Convert day of year to month/day
                    const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
                    let remainingDays = dayOfYear;
                    actualMonth = 0;
                    actualDay = 1;
                    
                    for (let i = 0; i < 12; i++) {
                        if (remainingDays < monthDays[i]) {
                            actualMonth = i;
                            actualDay = remainingDays + 1;
                            break;
                        }
                        remainingDays -= monthDays[i];
                    }
                }
            }
        } catch (e) {
            // Fall back to manual calculation if Date creation fails
            actualYear = Math.floor(currentYear);
            
            // Match the calculation based on scale
            const yearFraction = currentYear - actualYear;
            const dayOfYear = Math.floor(yearFraction * 365);
            
            // Calculate month and day
            const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
            let remainingDays = dayOfYear;
            actualMonth = 0;
            actualDay = 1;
            
            for (let i = 0; i < 12; i++) {
                if (remainingDays < monthDays[i]) {
                    actualMonth = i;
                    actualDay = remainingDays + 1;
                    break;
                }
                remainingDays -= monthDays[i];
            }
        }
        
        const formattedDate = this.formatCenterDate(centerDate, currentScale, actualYear, actualMonth, actualDay);
        ctx.fillStyle = '#FF6B6B';
        ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(formattedDate, width / 2, timelineY + 40);
        
        // Draw zoom level indicator
        ctx.fillStyle = '#666666';
        ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`Zoom: ${this.zoom.toFixed(3)}x`, 10, 20);
        
        // Draw current scale indicator
        ctx.fillText(`Scale: ${currentScale.unit}`, 10, 35);
        
        // Show Big Bang limit indicator if we're close to it
        if (this.offset <= -this.bigBangLimitDays * 0.9) { // Within 90% of the limit
            ctx.fillStyle = '#FF6B6B';
            ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('◄── Big Bang (13.8B years ago)', width / 2, timelineY - 30);
        }
        
        // Update active scale button highlighting
        this.updateActiveScaleButton();
    }
    
    // Constrain offset to not go past the Big Bang
    constrainOffset(offset) {
        // Don't allow scrolling past 13.8 billion years ago
        return Math.max(-this.bigBangLimitDays, offset);
    }
    
    // Go to today (reset offset to 0)
    goToToday() {
        this.targetOffset = this.constrainOffset(0);
        this.startPanAnimation();
    }
    
    // Set zoom to make a specific scale active
    setScaleZoom(scaleUnit) {
        // Find the scale object
        const scale = this.timeScales.find(s => s.unit === scaleUnit);
        if (!scale) return;
        
        // Calculate zoom level to make this scale active
        // We want approximately 15 markers across the screen
        const canvasWidth = window.innerWidth;
        const targetMarkers = 15;
        const targetZoom = canvasWidth / (targetMarkers * scale.days);
        
        
        // Apply zoom limits
        this.targetZoom = Math.max(0.0000000001, Math.min(targetZoom, 2400));
        this.startZoomAnimation();
    }
    
    // Update active scale button highlighting
    updateActiveScaleButton() {
        const currentScale = this.getTimeScale();
        const scaleButtons = document.querySelectorAll('.scale-btn');
        
        scaleButtons.forEach(btn => {
            if (btn.dataset.scale === currentScale.unit) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
    
    // Parse CSV data into timeline items
    parseCSVData(csvText) {
        const lines = csvText.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        
        // Expected headers: Item Name, Type, Start Date, End Date, Parent Item, Notes
        const requiredHeaders = ['item name', 'type', 'start date'];
        const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
        
        if (missingHeaders.length > 0) {
            throw new Error(`Missing required CSV headers: ${missingHeaders.join(', ')}`);
        }
        
        const items = [];
        
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            if (values.length === 0) continue; // Skip empty lines
            
            const item = {};
            headers.forEach((header, index) => {
                item[header] = values[index] || '';
            });
            
            // Process the item
            const processedItem = this.processCSVItem(item);
            if (processedItem) {
                items.push(processedItem);
            }
        }
        
        this.setTimelineItems(items);
        return items;
    }
    
    // Parse a single CSV line handling quotes and commas
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
    
    // Process a single CSV item into our internal format
    processCSVItem(csvItem) {
        const name = csvItem['item name'];
        const type = csvItem['type'].toLowerCase();
        
        if (!name || !type) return null;
        
        // Generate ID from name
        const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
        
        const item = {
            id: id,
            name: name,
            type: type,
            parentId: csvItem['parent item'] ? 
                csvItem['parent item'].toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') : null,
            notes: csvItem['notes'] || '',
            level: 0, // Will be calculated later
            children: []
        };
        
        // Parse dates based on type
        if (type === 'duration') {
            item.startDate = this.parseDate(csvItem['start date']);
            item.endDate = csvItem['end date'] ? this.parseDate(csvItem['end date']) : null;
            
            if (!item.startDate) {
                console.warn(`Invalid start date for duration item: ${name}`);
                return null;
            }
        } else if (type === 'event') {
            item.date = this.parseDate(csvItem['start date']);
            
            if (!item.date) {
                console.warn(`Invalid date for event item: ${name}`);
                return null;
            }
        }
        
        return item;
    }
    
    // Parse various date formats
    parseDate(dateString) {
        if (!dateString) return null;
        
        // Try parsing as-is first
        let date = new Date(dateString);
        if (!isNaN(date.getTime())) return date;
        
        // Try MM/DD/YYYY format
        const mmddyyyy = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (mmddyyyy) {
            return new Date(parseInt(mmddyyyy[3]), parseInt(mmddyyyy[1]) - 1, parseInt(mmddyyyy[2]));
        }
        
        // Try DD/MM/YYYY format
        const ddmmyyyy = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (ddmmyyyy) {
            return new Date(parseInt(ddmmyyyy[3]), parseInt(ddmmyyyy[2]) - 1, parseInt(ddmmyyyy[1]));
        }
        
        // Try YYYY-MM-DD format
        const yyyymmdd = dateString.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (yyyymmdd) {
            return new Date(parseInt(yyyymmdd[1]), parseInt(yyyymmdd[2]) - 1, parseInt(yyyymmdd[3]));
        }
        
        console.warn(`Could not parse date: ${dateString}`);
        return null;
    }
    
    // Set timeline items and build hierarchy
    setTimelineItems(items) {
        this.timelineItems = items;
        this.itemsById.clear();
        
        // Build ID lookup
        items.forEach(item => {
            this.itemsById.set(item.id, item);
        });
        
        // Build parent-child relationships and calculate levels
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
        

        
        // Calculate end dates for duration items without explicit end dates
        this.calculateImplicitEndDates();
        
        // Recalculate layout
        this.calculateItemLayout();
        
        // Redraw
        this.draw();
    }
    
    // Calculate end dates for duration items based on their children
    calculateImplicitEndDates() {
        const calculateEndDate = (item) => {
            if (item.type === 'duration' && !item.endDate && item.children.length > 0) {
                // Calculate end date from children
                let latestDate = null;
                
                item.children.forEach(child => {
                    calculateEndDate(child); // Recursive call
                    
                    const childEndDate = child.type === 'duration' ? child.endDate : child.date;
                    if (childEndDate && (!latestDate || childEndDate > latestDate)) {
                        latestDate = childEndDate;
                    }
                });
                
                if (latestDate) {
                    item.endDate = latestDate;
                }
            }
        };
        
        // Start from root items
        this.timelineItems.filter(item => item.level === 0).forEach(calculateEndDate);
    }
    
    // Calculate layout positions for all items
    calculateItemLayout() {
        this.itemLayout.clear();
        
        const canvasWidth = window.innerWidth;
        const canvasHeight = window.innerHeight;
        const pixelsPerDay = this.zoom;
        const centerX = canvasWidth / 2;
        const timelineY = 100; // 100px from top of screen
        
        // Calculate visible items and their positions
        const visibleItems = this.getVisibleItems();
        
        let currentY = timelineY + 50; // Start below the timeline
        
        // First pass: calculate duration bar positions
        visibleItems.forEach(item => {
            if (item.type === 'duration') {
                const layout = this.calculateItemPosition(item, centerX, pixelsPerDay);
                if (layout) {
                    layout.y = currentY;
                    layout.height = this.durationBarHeight;
                    this.itemLayout.set(item.id, layout);
                    
                    currentY += this.durationBarHeight + this.durationBarSpacing;
                }
            }
        });
        
        // Second pass: calculate event positions (now that parent positions are known)
        const eventCountByParent = new Map(); // Track how many events per parent
        
        visibleItems.forEach(item => {
            if (item.type === 'event') {
                // Count events under each parent for spacing
                const parentId = item.parentId || 'root';
                const currentCount = eventCountByParent.get(parentId) || 0;
                eventCountByParent.set(parentId, currentCount + 1);
                
                const layout = this.calculateEventPosition(item, centerX, pixelsPerDay, timelineY, currentCount);
                if (layout) {
                    this.itemLayout.set(item.id, layout);
                }
            }
        });
    }
    
    // Calculate position for a single item
    calculateItemPosition(item, centerX, pixelsPerDay) {
        if (item.type !== 'duration' || !item.startDate) return null;
        
        const startDayOffset = (item.startDate.getTime() - this.centerDate.getTime()) / (24 * 60 * 60 * 1000);
        const startX = centerX + (startDayOffset - this.offset) * pixelsPerDay;
        
        let endX = startX + 100; // Default width if no end date
        if (item.endDate) {
            const endDayOffset = (item.endDate.getTime() - this.centerDate.getTime()) / (24 * 60 * 60 * 1000);
            endX = centerX + (endDayOffset - this.offset) * pixelsPerDay;
        }
        
        const width = Math.max(endX - startX, 20); // Minimum width
        
        return {
            x: startX,
            width: width
        };
    }
    
    // Calculate position for an event item
    calculateEventPosition(item, centerX, pixelsPerDay, timelineY, eventIndex = 0) {
        if (item.type !== 'event' || !item.date) return null;
        
        const dayOffset = (item.date.getTime() - this.centerDate.getTime()) / (24 * 60 * 60 * 1000);
        const x = centerX + (dayOffset - this.offset) * pixelsPerDay;
        
        // Find parent's layout to position event under it
        let parentY = timelineY;
        if (item.parentId) {
            const parentLayout = this.itemLayout.get(item.parentId);
            if (parentLayout) {
                // Position event under parent with vertical spacing for multiple events
                parentY = parentLayout.y + parentLayout.height + 10 + (eventIndex * 15);
            }
        }
        
        return {
            x: x,
            y: parentY,
            width: 8, // Dot size
            height: 8, // Dot size
            type: 'event'
        };
    }
    
    // Get items that should be visible (respecting expand/collapse state)
    getVisibleItems() {
        const visible = [];
        
        const addItemsRecursively = (item) => {
            visible.push(item);
            
            // Add children only if this item is expanded
            if (this.expandedItems.has(item.id)) {
                item.children.forEach(addItemsRecursively);
            }
        };
        
        // Start with root items
        this.timelineItems.filter(item => item.level === 0).forEach(addItemsRecursively);
        
        return visible;
    }
    
    // Toggle expand/collapse state of an item
    toggleItemExpansion(itemId) {
        if (this.expandedItems.has(itemId)) {
            this.expandedItems.delete(itemId);
        } else {
            this.expandedItems.add(itemId);
        }
        
        this.calculateItemLayout();
        this.draw();
    }
    
    // Check if a point is inside a duration bar
    isPointInDurationBar(x, y, itemId) {
        const layout = this.itemLayout.get(itemId);
        if (!layout) return false;
        
        return x >= layout.x && 
               x <= layout.x + layout.width && 
               y >= layout.y && 
               y <= layout.y + layout.height;
    }
    
    // Handle clicks on timeline items (duration bars and events)
    handleTimelineItemClick(x, y) {
        for (let [itemId, layout] of this.itemLayout) {
            const item = this.itemsById.get(itemId);
            if (!item) continue;
            
            let clicked = false;
            
            if (item.type === 'duration') {
                clicked = this.isPointInDurationBar(x, y, itemId);
            } else if (item.type === 'event') {
                // Check if click is near the event dot
                const distance = Math.sqrt(Math.pow(x - layout.x, 2) + Math.pow(y - layout.y, 2));
                clicked = distance <= 8; // Click radius around the dot
            }
            
            if (clicked) {
                if (item.children.length > 0) {
                    this.toggleItemExpansion(itemId);
                    return true; // Click handled
                }
                // For items without children, just handle the click silently
                return true; // Click handled but no action
            }
        }
        return false; // Click not handled
    }
    
    // Draw all duration bars
    drawDurationBars() {
        const ctx = this.ctx;
        
        for (let [itemId, layout] of this.itemLayout) {
            const item = this.itemsById.get(itemId);
            if (!item || item.type !== 'duration') continue;
            
            // Skip if completely outside visible area
            if (layout.x + layout.width < 0 || layout.x > window.innerWidth) continue;
            
            this.drawSingleDurationBar(item, layout);
        }
    }
    
    // Draw all events
    drawEvents() {
        const ctx = this.ctx;
        
        for (let [itemId, layout] of this.itemLayout) {
            const item = this.itemsById.get(itemId);
            if (!item || item.type !== 'event') continue;
            
            // Skip if completely outside visible area
            if (layout.x < -50 || layout.x > window.innerWidth + 50) continue;
            
            this.drawSingleEvent(item, layout);
        }
    }
    
    // Draw a single duration bar
    drawSingleDurationBar(item, layout) {
        const ctx = this.ctx;
        
        // Choose color based on level
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
        const color = colors[item.level % colors.length];
        
        // Draw rounded rectangle (with fallback for older browsers)
        ctx.fillStyle = color;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(layout.x, layout.y, layout.width, layout.height, this.durationBarRadius);
        } else {
            // Fallback to regular rectangle
            ctx.rect(layout.x, layout.y, layout.width, layout.height);
        }
        ctx.fill();
        
        // Add border
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Draw item name if there's enough space
        const textWidth = ctx.measureText(item.name).width;
        if (layout.width > textWidth + 10) {
            ctx.fillStyle = '#333';
            ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(item.name, layout.x + 5, layout.y + layout.height / 2);
        }
        
        // Draw expand/collapse indicator if item has children
        if (item.children.length > 0) {
            const indicatorX = layout.x + layout.width - 15;
            const indicatorY = layout.y + layout.height / 2;
            
            ctx.fillStyle = '#333';
            ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const isExpanded = this.expandedItems.has(item.id);
            ctx.fillText(isExpanded ? '−' : '+', indicatorX, indicatorY);
        }
    }
    
    // Draw a single event
    drawSingleEvent(item, layout) {
        const ctx = this.ctx;
        
        // Choose color based on level (darker versions for events)
        const colors = ['#D63031', '#00B894', '#0984E3', '#6C5CE7', '#FDCB6E', '#E84393'];
        const color = colors[item.level % colors.length];
        
        // Draw dot
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(layout.x, layout.y, 4, 0, 2 * Math.PI);
        ctx.fill();
        
        // Add border to dot
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Draw label to the right of the dot
        ctx.fillStyle = '#333';
        ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        // Calculate label position - just to the right of the dot
        const labelX = layout.x + 8;
        const labelY = layout.y;
        
        // Draw background for better readability
        const textMetrics = ctx.measureText(item.name);
        const textWidth = textMetrics.width;
        const textHeight = 10;
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(labelX - 2, labelY - textHeight/2 - 1, textWidth + 4, textHeight + 2);
        
        // Draw the text
        ctx.fillStyle = '#333';
        ctx.fillText(item.name, labelX, labelY);
    }
}

// Initialize timeline when page loads
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('timeline-canvas');
    const timeline = new Timeline(canvas);
    
    // Setup Today button
    const todayBtn = document.getElementById('today-btn');
    todayBtn.addEventListener('click', () => {
        timeline.goToToday();
    });
    
    // Setup scale control buttons
    const scaleButtons = document.querySelectorAll('.scale-btn');
    scaleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const scaleUnit = btn.dataset.scale;
            timeline.setScaleZoom(scaleUnit);
        });
    });
    
    // Setup data control buttons
    const uploadBtn = document.getElementById('upload-btn');
    const csvUpload = document.getElementById('csv-upload');
    const sampleDataBtn = document.getElementById('sample-data-btn');
    const clearDataBtn = document.getElementById('clear-data-btn');
    
    // CSV upload functionality
    uploadBtn.addEventListener('click', () => {
        csvUpload.click();
    });
    
    csvUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type === 'text/csv') {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    timeline.parseCSVData(e.target.result);
                    console.log('CSV data loaded successfully');
                } catch (error) {
                    alert('Error parsing CSV: ' + error.message);
                }
            };
            reader.readAsText(file);
        } else {
            alert('Please select a valid CSV file');
        }
    });
    
    // Sample data button
    sampleDataBtn.addEventListener('click', () => {
        const sampleCSV = `Item Name,Type,Start Date,End Date,Parent Item,Notes
Life of Jack,duration,1980-01-01,2022-06-02,,Full biography of Jack Thompson
Childhood,duration,1980-01-01,1998-06-15,Life of Jack,Growing up in California
Born,event,1980-01-01,,Childhood,Born in San Francisco
Started School,event,1985-09-01,,Childhood,Kindergarten at Lincoln Elementary
Moved to Seattle,event,1992-08-15,,Childhood,Family relocated for dad's job
High School,duration,1994-09-01,1998-06-15,Childhood,Roosevelt High School
Joined Robotics Club,event,1996-09-01,,High School,Discovered passion for technology
Won State Championship,event,1998-03-15,,High School,Robotics team victory
College Years,duration,1998-09-01,2004-12-15,Life of Jack,MIT Computer Science and Physics
Freshman Year,duration,1998-09-01,1999-06-15,College Years,Adjustment period
Met Sarah,event,1999-02-14,,Freshman Year,Future wife at Valentine's dance
Failed Calculus,event,1999-05-20,,Freshman Year,First major academic setback
Sophomore Year,duration,1999-09-01,2000-06-15,College Years,Found academic rhythm
Declared CS Major,event,2000-02-01,,Sophomore Year,Official major declaration
Summer Internship,duration,2000-06-01,2000-08-31,College Years,Google internship program
Junior Year,duration,2000-09-01,2001-06-15,College Years,Advanced coursework
Research Project,duration,2001-01-15,2001-05-30,Junior Year,AI neural networks research
Senior Year,duration,2001-09-01,2002-06-15,College Years,Thesis and job hunting
Thesis Defense,event,2002-05-15,,Senior Year,Successfully defended AI thesis
Graduation,event,2002-06-15,,College Years,MIT Computer Science BS
Career Phase 1,duration,2002-07-01,2010-12-31,Life of Jack,Early career development
First Job: Software Engineer,duration,2002-07-01,2006-03-31,Career Phase 1,Startup called TechFlow
Learning Period,duration,2002-07-01,2003-12-31,First Job: Software Engineer,Steep learning curve
First Bug Fix,event,2002-08-15,,Learning Period,Fixed critical payment system bug
Mentor Assignment,event,2003-01-10,,Learning Period,Paired with senior engineer Lisa
Productive Period,duration,2004-01-01,2006-03-31,First Job: Software Engineer,Major contributions
Led Team Project,duration,2004-06-01,2004-12-15,Productive Period,Payment system overhaul
Promotion to Senior,event,2005-03-01,,Productive Period,Recognition for excellent work
Company Acquisition,event,2006-03-31,,First Job: Software Engineer,TechFlow bought by Microsoft
Second Job: Tech Lead,duration,2006-04-01,2010-12-31,Career Phase 1,Microsoft senior position
Team Building,duration,2006-04-01,2007-06-30,Second Job: Tech Lead,Built 8-person team
Hired Best Friend,event,2006-08-15,,Team Building,Recruited college roommate Mike
Big Project Launch,duration,2007-01-01,2008-12-31,Second Job: Tech Lead,Cloud storage platform
Alpha Release,event,2007-09-01,,Big Project Launch,First working prototype
Beta Launch,event,2008-03-15,,Big Project Launch,Public beta with 1000 users
Product Launch,event,2008-12-01,,Big Project Launch,Full commercial release
Personal Life,duration,2008-01-01,2022-06-02,Life of Jack,Family and relationships
Engagement,event,2008-01-01,,Personal Life,Proposed to Sarah on New Year's
Wedding Planning,duration,2008-01-01,2008-06-15,Personal Life,Six months of preparation
Bachelor Party,event,2008-05-20,,Wedding Planning,Weekend in Las Vegas
Wedding,event,2008-06-15,,Personal Life,Married Sarah in Napa Valley
Honeymoon,duration,2008-06-16,2008-06-30,Personal Life,Two weeks in Italy
First Home,event,2009-03-01,,Personal Life,Bought house in Bellevue
Career Phase 2,duration,2011-01-01,2020-12-31,Life of Jack,Leadership and expertise
Third Job: Engineering Manager,duration,2011-01-01,2016-08-31,Career Phase 2,Amazon Web Services
Management Training,duration,2011-01-01,2011-06-30,Third Job: Engineering Manager,Learning to lead people
First Direct Report,event,2011-02-15,,Management Training,Hired junior engineer Amy
Performance Review,event,2011-06-30,,Management Training,Excellent first review as manager
Team Growth,duration,2011-07-01,2014-12-31,Third Job: Engineering Manager,Scaled from 3 to 15 people
Major Outage,event,2013-04-15,,Team Growth,Led incident response for 6-hour outage
Promotion to Director,event,2014-06-01,,Team Growth,Recognized for team excellence
Strategic Period,duration,2015-01-01,2016-08-31,Third Job: Engineering Manager,Architecture and planning
Started MBA,duration,2015-09-01,2017-06-15,Career Phase 2,Part-time at UW Foster School
Weekend Classes,duration,2015-09-01,2017-06-15,Started MBA,Saturdays and some evenings
Capstone Project,duration,2016-09-01,2017-04-30,Started MBA,AI in supply chain management
MBA Graduation,event,2017-06-15,,Started MBA,Master of Business Administration
Fourth Job: VP Engineering,duration,2016-09-01,2020-12-31,Career Phase 2,Series B startup Cloudify
Equity Negotiations,event,2016-08-15,,Fourth Job: VP Engineering,Negotiated significant equity package
Team Scaling,duration,2017-01-01,2019-12-31,Fourth Job: VP Engineering,Grew engineering from 12 to 80 people
IPO Preparation,duration,2019-01-01,2020-06-30,Fourth Job: VP Engineering,Preparing for public offering
IPO Success,event,2020-06-30,,IPO Preparation,Company went public at $2.1B valuation
Family Life,duration,2012-01-01,2022-06-02,Personal Life,Children and family growth
First Child,event,2012-03-15,,Family Life,Emma born
Second Child,event,2015-08-20,,Family Life,Lucas born
Family Vacation,event,2018-07-04,,Family Life,Two weeks in Europe with kids
Kids School,duration,2017-09-01,2022-06-02,Family Life,Private school education
Emma Started School,event,2017-09-01,,Kids School,Kindergarten at Lakeside School
Lucas Started School,event,2020-09-01,,Kids School,Kindergarten at Lakeside School
Entrepreneurial Phase,duration,2021-01-01,2022-06-02,Life of Jack,Building his own company
Founded Startup,duration,2021-01-01,2022-06-02,Entrepreneurial Phase,AI-powered education platform
Co-founder Search,duration,2021-01-01,2021-03-31,Founded Startup,Finding the right technical co-founder
Met Alex,event,2021-02-14,,Co-founder Search,Connected through mutual friend
Partnership Agreement,event,2021-03-31,,Co-founder Search,Signed co-founder agreement with Alex
Seed Funding,duration,2021-04-01,2021-08-31,Founded Startup,Raising initial capital
Pitch Deck,event,2021-04-15,,Seed Funding,Completed 20-slide investor presentation
First Investor Meeting,event,2021-05-01,,Seed Funding,Pitched to Andreessen Horowitz
Funding Closed,event,2021-08-31,,Seed Funding,Raised $2.5M seed round
Product Development,duration,2021-09-01,2022-06-02,Founded Startup,Building MVP
Beta Launch,event,2022-03-01,,Product Development,Limited beta with 50 teachers
Product Launch,event,2022-05-15,,Product Development,Public launch of EduAI platform
Final Chapter,event,2022-06-02,,Life of Jack,Passed away peacefully at age 42`;
        
        try {
            timeline.parseCSVData(sampleCSV);
            console.log('Sample data loaded successfully');
        } catch (error) {
            alert('Error loading sample data: ' + error.message);
        }
    });
    
    // Clear data button
    clearDataBtn.addEventListener('click', () => {
        timeline.setTimelineItems([]);
        console.log('Timeline data cleared');
    });
}); 