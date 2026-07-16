// main.js — Bootstrap: DOMContentLoaded, button wiring, sample data, project integration

import { Timeline } from './Timeline.js';
import { TimeScale, DEFAULT_SCALES } from './TimeScale.js';
import { ProjectManager } from './ProjectManager.js';
import { SAMPLE_CSV } from './sampleData.js';

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('timeline-canvas');
    const timeline = new Timeline(canvas);

    // Register all built-in scales
    DEFAULT_SCALES.forEach(scale => timeline.registerScale(scale));

    // Expose for extensibility
    window.timeline = timeline;
    window.TimeScale = TimeScale;

    // ── Project Loading ─────────────────────────────────────────────────────────

    const params = new URLSearchParams(window.location.search);
    const projectId = params.get('project');
    let currentProjectId = projectId;

    if (projectId) {
        const project = ProjectManager.loadProject(projectId);
        if (project) {
            document.title = `TimeTrek - ${project.name}`;

            // Start rendering first
            timeline.start();

            // Then load items and view state
            if (project.items && project.items.length > 0) {
                timeline.loadSerializedItems(project.items);
            }
            if (project.viewState) {
                timeline.setViewState(project.viewState);
            }
        } else {
            timeline.start();
        }
    } else {
        // No project context — start fresh (direct access to timeline.html)
        timeline.start();
    }

    // ── Auto-Save (debounced) ───────────────────────────────────────────────────

    let saveTimeout = null;

    function saveCurrentProject() {
        if (!currentProjectId) return;
        const project = ProjectManager.loadProject(currentProjectId);
        if (!project) return;

        project.items = ProjectManager.serializeItems(
            timeline.data.items,
            timeline.data.itemsById
        );
        project.viewState = timeline.getViewState();
        ProjectManager.saveProject(project);
    }

    function debouncedSave() {
        if (!currentProjectId) return;
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveCurrentProject, 500);
    }

    // Hook into zoom/pan end via the existing animation callback
    const originalOnFrame = timeline._onAnimationFrame.bind(timeline);
    timeline._onAnimationFrame = (update) => {
        originalOnFrame(update);
        debouncedSave();
    };

    // ── Back Button (save before navigating) ────────────────────────────────────

    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', (e) => {
            e.preventDefault();
            saveCurrentProject();
            window.location.href = 'index.html';
        });
    }

    // ── Today Button ────────────────────────────────────────────────────────────
    document.getElementById('today-btn').addEventListener('click', () => {
        timeline.goToToday();
    });

    // ── Scale Buttons ───────────────────────────────────────────────────────────
    // [data-scale] so the Fit button in the same bar isn't treated as a scale
    document.querySelectorAll('[data-scale]').forEach(btn => {
        btn.addEventListener('click', () => {
            timeline.setScaleZoom(btn.dataset.scale);
        });
    });

    // ── Fit All ─────────────────────────────────────────────────────────────────
    document.getElementById('fit-btn').addEventListener('click', () => {
        timeline.zoomToFit();
        debouncedSave();
    });

    // ── Readout ─────────────────────────────────────────────────────────────────
    // It sits just above the scale bar without being part of it. The bar's height
    // isn't fixed — it wraps to two rows on a narrow screen, and its width shifts as
    // the scale window slides — so follow its real height instead of guessing an
    // offset. ResizeObserver rather than a per-frame read, which would force layout.
    const scaleBar = document.querySelector('.scale-controls');
    const readout = document.getElementById('timeline-readout');
    if (scaleBar && readout && window.ResizeObserver) {
        const BAR_BOTTOM = 12;   // matches .scale-controls
        const GAP = 8;
        new ResizeObserver(() => {
            readout.style.bottom = `${BAR_BOTTOM + scaleBar.offsetHeight + GAP}px`;
        }).observe(scaleBar);
    }

    // ── Add Item ────────────────────────────────────────────────────────────────
    document.getElementById('add-item-btn').addEventListener('click', () => {
        // Prefill with whatever date is currently centred on screen
        timeline.openItemModal({ prefillDate: timeline.dateAtX(window.innerWidth / 2) });
    });

    // ── Edit Modal Buttons ──────────────────────────────────────────────────────
    document.getElementById('edit-save-btn').addEventListener('click', () => {
        // Only save if validation passed — the modal stays open otherwise
        if (timeline.applyEdit()) debouncedSave();
    });
    document.getElementById('edit-cancel-btn').addEventListener('click', () => {
        timeline.closeEditModal();
    });
    document.getElementById('edit-modal').addEventListener('click', (e) => {
        if (e.target.id === 'edit-modal') timeline.closeEditModal();
    });

    // ── Delete Item ─────────────────────────────────────────────────────────────
    const deleteConfirm = document.getElementById('edit-delete-confirm');
    const mainButtons = document.getElementById('edit-main-buttons');
    const childrenRow = document.getElementById('edit-delete-children-row');
    const childrenBox = document.getElementById('edit-delete-children');

    document.getElementById('edit-delete-btn').addEventListener('click', () => {
        const item = timeline.getCurrentModalItem();
        if (!item) return;

        const descendantCount = timeline.countDescendants(item);
        document.getElementById('edit-delete-warning').textContent = `Delete "${item.name}"?`;

        if (descendantCount > 0) {
            childrenRow.hidden = false;
            childrenBox.checked = false;
            document.getElementById('edit-delete-children-text').textContent =
                descendantCount === 1
                    ? 'Also delete its 1 nested item (otherwise it moves up a level)'
                    : `Also delete its ${descendantCount} nested items (otherwise they move up a level)`;
        } else {
            childrenRow.hidden = true;
        }

        mainButtons.hidden = true;
        deleteConfirm.hidden = false;
    });

    document.getElementById('edit-delete-cancel').addEventListener('click', () => {
        deleteConfirm.hidden = true;
        mainButtons.hidden = false;
    });

    document.getElementById('edit-delete-confirm-btn').addEventListener('click', () => {
        if (timeline.deleteCurrentItem(!childrenRow.hidden && childrenBox.checked)) {
            deleteConfirm.hidden = true;
            mainButtons.hidden = false;
            debouncedSave();
        }
    });

    // ── Data Menu ───────────────────────────────────────────────────────────────

    const dataMenu = document.getElementById('data-menu');
    const dataMenuBtn = document.getElementById('data-menu-btn');

    function setDataMenuOpen(open) {
        dataMenu.classList.toggle('open', open);
        dataMenuBtn.setAttribute('aria-expanded', String(open));
    }

    dataMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setDataMenuOpen(!dataMenu.classList.contains('open'));
    });

    dataMenu.querySelectorAll('.data-menu-item').forEach(item => {
        item.addEventListener('click', () => setDataMenuOpen(false));
    });

    document.addEventListener('click', (e) => {
        if (!dataMenu.contains(e.target)) setDataMenuOpen(false);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || !dataMenu.classList.contains('open')) return;
        setDataMenuOpen(false);
        dataMenuBtn.focus();
    });

    // ── Data Controls ───────────────────────────────────────────────────────────
    const csvUpload = document.getElementById('csv-upload');
    const jsonUpload = document.getElementById('json-upload');

    document.getElementById('upload-btn').addEventListener('click', () => {
        csvUpload.click();
    });

    csvUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && (file.type === 'text/csv' || file.name.endsWith('.csv'))) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    timeline.parseCSVData(ev.target.result);
                    debouncedSave();
                    console.log('CSV data loaded successfully');
                } catch (error) {
                    alert('Error parsing CSV: ' + error.message);
                }
            };
            reader.readAsText(file);
        } else {
            alert('Please select a valid CSV file');
        }
        csvUpload.value = '';
    });

    // ── Import JSON (into current project) ──────────────────────────────────────

    document.getElementById('import-json-btn').addEventListener('click', () => {
        jsonUpload.click();
    });

    jsonUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                if (data._format !== 'timetrek-v1') {
                    throw new Error('Not a valid TimeTrek JSON file');
                }
                if (data.items && data.items.length > 0) {
                    timeline.loadSerializedItems(data.items);
                }
                if (data.viewState) {
                    timeline.setViewState(data.viewState);
                }
                debouncedSave();
                console.log('JSON data imported successfully');
            } catch (error) {
                alert('Error importing JSON: ' + error.message);
            }
        };
        reader.readAsText(file);
        jsonUpload.value = '';
    });

    // ── Export JSON ──────────────────────────────────────────────────────────────

    document.getElementById('export-btn').addEventListener('click', () => {
        // Build a project object for export
        const items = ProjectManager.serializeItems(
            timeline.data.items,
            timeline.data.itemsById
        );
        const viewState = timeline.getViewState();

        let project;
        if (currentProjectId) {
            project = ProjectManager.loadProject(currentProjectId);
            if (project) {
                project.items = items;
                project.viewState = viewState;
            }
        }

        if (!project) {
            project = {
                id: 'export',
                name: 'TimeTrek Export',
                description: '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                items,
                viewState
            };
        }

        ProjectManager.downloadJSON(project);
    });

    // ── Sample Data ─────────────────────────────────────────────────────────────
    document.getElementById('sample-data-btn').addEventListener('click', () => {
        try {
            timeline.parseCSVData(SAMPLE_CSV);
            debouncedSave();
            console.log('Sample data loaded successfully');
        } catch (error) {
            alert('Error loading sample data: ' + error.message);
        }
    });

    // ── Clear Data ──────────────────────────────────────────────────────────────
    document.getElementById('clear-data-btn').addEventListener('click', () => {
        timeline.setTimelineItems([]);
        debouncedSave();
        console.log('Timeline data cleared');
    });
});

