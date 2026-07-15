// main.js — Bootstrap: DOMContentLoaded, button wiring, sample data, project integration

import { Timeline } from './Timeline.js';
import { TimeScale, DEFAULT_SCALES } from './TimeScale.js';
import { ProjectManager } from './ProjectManager.js';

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
        // No project context — start fresh (direct access to index.html)
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
            window.location.href = 'projects.html';
        });
    }

    // ── Today Button ────────────────────────────────────────────────────────────
    document.getElementById('today-btn').addEventListener('click', () => {
        timeline.goToToday();
    });

    // ── Scale Buttons ───────────────────────────────────────────────────────────
    document.querySelectorAll('.scale-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            timeline.setScaleZoom(btn.dataset.scale);
        });
    });

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

// ── Sample CSV Data ─────────────────────────────────────────────────────────────

const SAMPLE_CSV = `Item Name,Type,Start Date,End Date,Parent Item,Notes
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
