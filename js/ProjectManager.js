// ProjectManager.js — Project CRUD, localStorage persistence, JSON export/import
// Data persists across browser sessions and tab closures

export class ProjectManager {

    static STORAGE_INDEX_KEY = 'timetrek-projects-index';
    static STORAGE_PREFIX = 'timetrek-project-';
    static ACTIVE_KEY = 'timetrek-active-project';
    static FORMAT_VERSION = 'timetrek-v1';

    // ── List / Index ────────────────────────────────────────────────────────────

    static listProjects() {
        const raw = localStorage.getItem(this.STORAGE_INDEX_KEY);
        return raw ? JSON.parse(raw) : [];
    }

    static _saveIndex(index) {
        localStorage.setItem(this.STORAGE_INDEX_KEY, JSON.stringify(index));
    }

    // ── CRUD ─────────────────────────────────────────────────────────────────────

    static createProject(name, description = '') {
        const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
        const now = new Date().toISOString();

        const project = {
            id,
            name,
            description,
            createdAt: now,
            updatedAt: now,
            items: [],
            viewState: {
                zoom: 1,
                offset: 0,
                expandedItems: []
            }
        };

        this.saveProject(project);
        return project;
    }

    static loadProject(id) {
        const raw = localStorage.getItem(this.STORAGE_PREFIX + id);
        return raw ? JSON.parse(raw) : null;
    }

    static saveProject(project) {
        project.updatedAt = new Date().toISOString();
        localStorage.setItem(this.STORAGE_PREFIX + project.id, JSON.stringify(project));

        // Update index
        const index = this.listProjects();
        const existing = index.findIndex(p => p.id === project.id);
        const entry = {
            id: project.id,
            name: project.name,
            description: project.description,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
            itemCount: project.items.length
        };

        if (existing >= 0) {
            index[existing] = entry;
        } else {
            index.push(entry);
        }
        this._saveIndex(index);
    }

    static deleteProject(id) {
        localStorage.removeItem(this.STORAGE_PREFIX + id);
        const index = this.listProjects().filter(p => p.id !== id);
        this._saveIndex(index);
    }

    static updateProjectName(id, name) {
        const project = this.loadProject(id);
        if (!project) return;
        project.name = name;
        this.saveProject(project);
    }

    // ── Active Project ───────────────────────────────────────────────────────────

    static setActiveProjectId(id) {
        localStorage.setItem(this.ACTIVE_KEY, id);
    }

    static getActiveProjectId() {
        return localStorage.getItem(this.ACTIVE_KEY);
    }

    // ── Serialization (items ↔ storable format) ─────────────────────────────────

    static serializeDate(timelineDate) {
        if (!timelineDate) return '';
        if (timelineDate.date && !isNaN(timelineDate.date.getTime())) {
            return timelineDate.date.toISOString().split('T')[0];
        }
        // Deep-time: store dayOffset directly
        return `__offset:${timelineDate.dayOffset}`;
    }

    static serializeItems(items, itemsById) {
        return items.map(item => {
            const entry = {
                name: item.name,
                type: item.type,
                parentName: '',
                startDate: '',
                endDate: '',
                notes: item.notes || ''
            };

            // Resolve parent name
            if (item.parentId && itemsById) {
                const parent = itemsById.get(item.parentId);
                if (parent) entry.parentName = parent.name;
            }

            // Prefer original date strings for lossless round-trips
            if (item.type === 'duration') {
                entry.startDate = item._startDateStr || this.serializeDate(item.startDate);
                entry.endDate = item._endDateStr || this.serializeDate(item.endDate);
            } else if (item.type === 'event') {
                entry.startDate = item._startDateStr || this.serializeDate(item.date);
            }

            return entry;
        });
    }

    static deserializeToCSVItems(storedItems) {
        // Convert stored items back to the CSV-item format that processCSVItem expects
        return storedItems.map(item => ({
            'item name': item.name,
            'type': item.type,
            'start date': item.startDate,
            'end date': item.endDate || '',
            'parent item': item.parentName || '',
            'notes': item.notes || ''
        }));
    }

    // ── JSON Export / Import ─────────────────────────────────────────────────────

    static exportProjectToJSON(project) {
        const exportData = {
            _format: this.FORMAT_VERSION,
            ...project
        };
        return JSON.stringify(exportData, null, 2);
    }

    static importProjectFromJSON(jsonString) {
        const data = JSON.parse(jsonString);

        if (data._format !== this.FORMAT_VERSION) {
            throw new Error('Unrecognized file format. Expected a TimeTrek project file.');
        }

        // Assign a new ID so imports don't collide
        const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
        const now = new Date().toISOString();

        const project = {
            id,
            name: data.name || 'Imported Project',
            description: data.description || '',
            createdAt: now,
            updatedAt: now,
            items: data.items || [],
            viewState: data.viewState || { zoom: 1, offset: 0, expandedItems: [] }
        };

        this.saveProject(project);
        return project;
    }

    // ── File Download Helper ─────────────────────────────────────────────────────

    static downloadJSON(project) {
        const json = this.exportProjectToJSON(project);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${project.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.timetrek.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
