# CAT Co-Pilot — Smart Operator Assistant

> **In-Cab Heads-Up Display (HUD) & Supervisor Command Platform for Heavy Machinery Operators**

Built with an industrial dark theme featuring **Caterpillar Yellow (`#FFCD11`)** on **near-black (`#111111`)**, high-contrast tactile elements, and large touch targets (48px–64px) engineered for gloved tablet operation in heavy equipment cabins.

---

## 🏗 System Architecture & Dual Roles

The platform unifies **two distinct roles and interfaces** atop a single shared backend and UTC-normalized relational data model:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CAT Co-Pilot Platform                           │
├────────────────────────────────────────┬───────────────────────────────┤
│        Operator In-Cab HUD             │   Supervisor Command Center   │
│  - Today's Tasks in Local Time         │  - Fleet Custody (Owned/Rent) │
│  - Web Speech Hands-Free Co-Pilot      │  - Dynamic ML Task Scheduler  │
│  - 45s SOS Alert & Escalation Flow     │  - Real-Time Fleet SOS Feed   │
│  - 2D Scenario Simulator & Badges      │  - $-Cost-of-Idle Anomaly HUD │
├────────────────────────────────────────┴───────────────────────────────┤
│                 Shared Backend Engine (FastAPI + SQLite)               │
│  - SQLite Schema (Machines, Operators, Tasks, Predictions, Telemetry)  │
│  - ML Dynamic Task Duration Regressor (Photo 1 Calibration)            │
│  - Ghost Idle & Fuel Penalty Detector (Photo 2 Calibration)            │
│  - Pluggable Notification Service (WebSocket, Audit Log, SMS, Email)  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Core Datasets & Seed Data Model (Section 5)

All timestamps are stored in **UTC ISO format (`YYYY-MM-DDTHH:MM:SSZ`)** and automatically rendered in the user's local/selected timezone at display time.

1. **`machines`**: `machine_id`, `type`, `model`, `age_years`, `owner_supervisor_id`, `custody_status` (`owned`, `rented_in`, `rented_out`), `rental_counterparty`, `rental_start`, `rental_end`.
2. **`operators`**: `operator_id`, `name`, `preferred_language` (`en`, `hi`, `es`), `timezone`, `skill_level` (`Beginner`, `Intermediate`, `Expert`), `assigned_supervisor_id`.
3. **`operator_machine_assignments`**: Many-to-Many join table tracking which operator drives which machine across shifts.
4. **`tasks`**: `task_id`, `task_type`, `weather`, `operator_id`, `machine_id`, `scheduled_start` (UTC), `scheduled_end` (UTC), `status` (`upcoming`, `in-progress`, `done`, `delayed`), `location_zone`, `notes`.
5. **`task_time_predictions`**: Dedicated table for ML predicted vs actual completion time (`estimated_time_min`, `predicted_time_min`, `actual_time_min`, `completion_timestamp`).
6. **`machine_telemetry`**: Telemetry stream table directly seeded from the hackathon reference sheet (Photo 2):
   - `timestamp`, `machine_id`, `operator_id`, `engine_hours`, `fuel_used_l`, `load_cycles`, `idling_time_min`, `seatbelt_status`, `safety_alert_triggered`.

---

## 🚀 Key Features Built in this Release

### 1. Operator In-Cab HUD
- **Today's Scheduled Tasks**: Formatted dynamically into the operator's cabin timezone with status toggles (`Start Task`, `Mark Complete`).
- **ML Duration Preview**: Displays variance between supervisor estimate and weather/wear-adjusted AI duration.
- **Hands-Free Voice Co-Pilot (Web Speech API)**:
  - Speech-to-text recognition with audio feedback tone.
  - Spoken radio response for *"What's my next task?"*
  - Hands-free incident logging for *"Log hydraulic leak on left boom"*.
- **SOS Safety Flow & Pluggable Escalation**:
  - High-visibility flashing emergency overlay with 45-second countdown timer.
  - Instant one-tap `"ACKNOWLEDGE SAFE (CABIN SECURE)"`.
  - Automatic escalation to supervisor if timeout expires.
- **Multilingual Support (i18n)**:
  - English, हिन्दी (Hindi), and Español (Spanish) with persistent local profile caching.
- **Operator Portal & Safety Training Simulation Hub**:
  - **Portal Usage Training**: Interactive simulator teaching operators how to navigate and use the in-cab assistant (hands-free voice command logging, responding to 45-second SOS emergency countdowns, and tracking task duration variance).
  - **Jobsite & Machine Safety**: Scenarios addressing seatbelt interlocks, ghost idling fuel penalties, blind-spot ground crew proximity alarms, and steep slope stability.
  - Multi-choice choices evaluating Safety Compliance % and Operational Efficiency %.
  - Gamified points, progress tracking, and badge rewards (`Voice Co-Pilot Certified`, `Rapid Responder`, `Proximity Guardian`, `Eco-Operator Master`).

### 2. Supervisor Office Command Center
- **Fleet Custody & Rental Management**:
  - Track machines by custody state: `Owned`, `Rented In`, `Rented Out`.
  - Simple modal to record renting-in equipment or leasing machines out to subcontractors.
- **Dynamic Task Scheduler**:
  - Input start/end in supervisor's local timezone (converted to UTC on dispatch).
  - Real-time preview from the ML Task Duration Prediction Engine.
- **Real-Time Safety Monitor**:
  - Live feed of active, acknowledged, and escalated SOS alerts across the entire jobsite.
- **Idle & Telemetry Anomaly Panel**:
  - Direct visualization of the Photo 2 telemetry log (`EXC001`, `OP1001`).
  - Ghost idling flags (idling >40 mins with <3 load cycles).
  - Real-time `$-Cost-of-Idle` calculation based on off-road diesel burn rate ($1.35/L * 3.6 L/hr).

---

## 🚫 Explicit Non-Goals & Future Work

As specified in the hackathon instructions, the following items are intentionally excluded from this initial skeleton build and reserved for future milestones:

1. **Webcam / Computer-Vision Gaze & Fatigue Detection**:
   - *Status*: Excluded.
   - *Future Plan*: Client-side MediaPipe FaceMesh / YOLOv8 ONNX model running in browser WASM to detect operator eye closure >2 seconds and driver seatbelt compliance.
2. **3D Physics Sandbox Simulation**:
   - *Status*: Excluded in favor of the lightweight 2D scenario-based decision simulator.
   - *Future Plan*: Three.js/WebGL interactive simulation module for practicing bucket angles and slope excavation.
3. **Automated Synthetic Telemetry Generator**:
   - *Status*: Excluded. Data layer and pluggable hook (`backend/services/synthetic_data.py`) are structured; clean seed fixtures are used.
   - *Future Plan*: Time-series stochastic generator (CTGAN / Faker) to simulate 100+ concurrent machines.
4. **Production Authentication**:
   - *Status*: Role switcher provided for instant hackathon evaluation.
   - *Future Plan*: OAuth2 / JWT with role-based access control (RBAC).

---

## 🛠 Running Locally

### Backend (FastAPI)
```bash
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\python seed_data.py
.\.venv\Scripts\python -m uvicorn main:app --host 127.0.0.1 --port 8000
```
Swagger UI documentation available at: `http://127.0.0.1:8000/docs`

### Frontend (Vite + React)
```bash
cd frontend
npm install
npm run dev
```
Open `http://127.0.0.1:5173/` in your browser.

---

## 🎨 UI/UX Design System Overhaul (Before & After)

An end-to-end design system pass was applied across the application to establish an authentic **In-Cab Industrial HUD** experience for operators while retaining a clean, executive control center for supervisors:

| Aspect | Before | After |
| :--- | :--- | :--- |
| **Theme Consistency** | Generic white SaaS admin cards across both tabs with a black top bar slapped on top. | **Full In-Cab Dark Industrial HUD** (`#0D0D0E`, `#18181B`, `#FFCD11`) for Operators; sleek executive slate for Supervisors with smooth CSS theme switching. |
| **Hierarchy & Elevation** | Box-inside-a-box clutter (task card > scheduled window sub-box > weather sub-box > duration sub-box). | **Single elevation card hierarchy**. Inside cards, spacing, dividers (`cat-meta-row`), and distinct typography weights organize data without nested borders. |
| **Status & Badge System** | Arbitrary badge colors (green/blue/purple for fleet custody tags, confusing them with danger alerts). | **Strict semantic color system**: Red (Critical/Escalated), Amber (Warning/In-Progress), Green (Safe/Completed/Nominal), and Neutral Slate (Custody: Owned, Rented In, Rented Out). |
| **Alert Triage Scannability** | 3+ near-identical red alert cards competing for supervisor attention. | **Strong visual state per severity**: Escalated/Active alerts pulse with loud glowing red borders; acknowledged/resolved alerts visually collapse into compact receded rows. |
| **Voice Assistant Co-Pilot** | Static mic icon with minimal visual feedback when listening. | **Active animated waveform bars** (`.voice-waveform`) and glowing listening state. Emergency SOS button isolated with **1.5s hold-to-trigger protection** against accidental cabin bumps. |
| **Data Tables & KPIs** | Thin left border on Ghost Idle rows; left-aligned numeric data; plain KPI numbers. | **Subtle full-row tint** on Ghost Idle rows, **right-aligned numeric columns** with monospace tabular numbers (`.mono-num`), and KPI trend delta indicators. |
| **Modals & Responsive Reflow** | White modals jarring in cabin night mode; multi-column breaks on mobile. | **Themed in-cab dialogs** (Emergency SOS, Operator Simulator) with high-contrast tactile touch targets and mobile-responsive reflow. |

