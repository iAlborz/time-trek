// projects-main.js — Projects landing page bootstrap

import { ProjectManager } from './ProjectManager.js';

document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('project-grid');
    const emptyState = document.getElementById('empty-state');
    const modal = document.getElementById('new-project-modal');
    const nameInput = document.getElementById('new-project-name');
    const descInput = document.getElementById('new-project-desc');
    const jsonImport = document.getElementById('json-import');

    // ── Render Project Cards ────────────────────────────────────────────────────

    function renderProjects() {
        const projects = ProjectManager.listProjects();
        grid.innerHTML = '';

        if (projects.length === 0) {
            emptyState.style.display = 'block';
            grid.style.display = 'none';
            return;
        }

        emptyState.style.display = 'none';
        grid.style.display = 'grid';

        // Sort by updatedAt descending
        projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        projects.forEach(entry => {
            const card = document.createElement('div');
            card.className = 'project-card';
            card.dataset.projectId = entry.id;

            const created = new Date(entry.createdAt);
            const updated = new Date(entry.updatedAt);
            const dateStr = formatDate(updated);

            card.innerHTML = `
                <h3 class="project-card-title">${escapeHtml(entry.name)}</h3>
                ${entry.description ? `<p class="project-card-desc">${escapeHtml(entry.description)}</p>` : ''}
                <div class="project-card-meta">
                    <span>${entry.itemCount || 0} items</span>
                    <span>Updated ${dateStr}</span>
                </div>
                <div class="project-card-actions">
                    <button class="project-card-btn project-card-export" title="Export JSON">Export</button>
                    <button class="project-card-btn project-card-delete" title="Delete project">Delete</button>
                </div>
            `;

            // Click card → open project
            card.addEventListener('click', (e) => {
                if (e.target.closest('.project-card-btn')) return;
                openProject(entry.id);
            });

            // Export button
            card.querySelector('.project-card-export').addEventListener('click', (e) => {
                e.stopPropagation();
                const project = ProjectManager.loadProject(entry.id);
                if (project) ProjectManager.downloadJSON(project);
            });

            // Delete button
            card.querySelector('.project-card-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Delete "${entry.name}"? This cannot be undone.`)) {
                    ProjectManager.deleteProject(entry.id);
                    renderProjects();
                }
            });

            grid.appendChild(card);
        });
    }

    function openProject(id) {
        ProjectManager.setActiveProjectId(id);
        window.location.href = `index.html?project=${id}`;
    }

    // ── New Project ─────────────────────────────────────────────────────────────

    document.getElementById('new-project-btn').addEventListener('click', () => {
        nameInput.value = '';
        descInput.value = '';
        modal.classList.add('visible');
        nameInput.focus();
    });

    document.getElementById('new-project-create').addEventListener('click', () => {
        const name = nameInput.value.trim();
        if (!name) {
            nameInput.focus();
            return;
        }
        const desc = descInput.value.trim();
        const project = ProjectManager.createProject(name, desc);
        modal.classList.remove('visible');
        openProject(project.id);
    });

    document.getElementById('new-project-cancel').addEventListener('click', () => {
        modal.classList.remove('visible');
    });

    // Close modal on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('visible');
    });

    // Enter key in name input creates project
    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('new-project-create').click();
        }
    });

    // ── Import Project ──────────────────────────────────────────────────────────

    document.getElementById('import-project-btn').addEventListener('click', () => {
        jsonImport.click();
    });

    jsonImport.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const project = ProjectManager.importProjectFromJSON(ev.target.result);
                renderProjects();
                // Optionally open it immediately
                openProject(project.id);
            } catch (error) {
                alert('Error importing project: ' + error.message);
            }
        };
        reader.readAsText(file);
        jsonImport.value = '';
    });

    // ── Helpers ──────────────────────────────────────────────────────────────────

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatDate(date) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    }

    // ── Initial Render ──────────────────────────────────────────────────────────

    renderProjects();
});
