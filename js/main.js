// main.js — Bootstrap: DOMContentLoaded, button wiring, sample data

import { Timeline } from './Timeline.js';
import { TimeScale, DEFAULT_SCALES } from './TimeScale.js';

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('timeline-canvas');
    const timeline = new Timeline(canvas);

    // Register all built-in scales
    DEFAULT_SCALES.forEach(scale => timeline.registerScale(scale));

    // Expose registerScale for open-source extensibility
    // Usage: window.timeline.registerScale(new TimeScale({ ... }))
    window.timeline = timeline;
    window.TimeScale = TimeScale;

    // Start rendering
    timeline.start();

    // ── Today Button ───────────────────────────────────────────────────────────
    document.getElementById('today-btn').addEventListener('click', () => {
        timeline.goToToday();
    });

    // ── Scale Buttons ──────────────────────────────────────────────────────────
    document.querySelectorAll('.scale-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            timeline.setScaleZoom(btn.dataset.scale);
        });
    });

    // ── Edit Modal Buttons ─────────────────────────────────────────────────────
    document.getElementById('edit-save-btn').addEventListener('click', () => {
        timeline.applyEdit();
    });
    document.getElementById('edit-cancel-btn').addEventListener('click', () => {
        timeline.closeEditModal();
    });
    // Close on backdrop click
    document.getElementById('edit-modal').addEventListener('click', (e) => {
        if (e.target.id === 'edit-modal') timeline.closeEditModal();
    });

    // ── Data Controls ──────────────────────────────────────────────────────────
    const csvUpload = document.getElementById('csv-upload');

    document.getElementById('upload-btn').addEventListener('click', () => {
        csvUpload.click();
    });

    csvUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type === 'text/csv') {
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    timeline.parseCSVData(ev.target.result);
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

    // ── Sample Data ────────────────────────────────────────────────────────────
    document.getElementById('sample-data-btn').addEventListener('click', () => {
        try {
            timeline.parseCSVData(SAMPLE_CSV);
            console.log('Sample data loaded successfully');
        } catch (error) {
            alert('Error loading sample data: ' + error.message);
        }
    });

    // ── Clear Data ─────────────────────────────────────────────────────────────
    document.getElementById('clear-data-btn').addEventListener('click', () => {
        timeline.setTimelineItems([]);
        console.log('Timeline data cleared');
    });
});

// ── Sample CSV Data ────────────────────────────────────────────────────────────

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
