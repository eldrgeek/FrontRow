
# Project Plan: FRONT ROW - Rev 1

**Project Goal:** To build a minimum viable product (MVP) for "FRONT ROW," an intimate virtual theater experience for live musical performances. Rev 1 focuses on establishing the core interactive 3D environment, direct WebRTC artist streaming to a limited audience, and browser-based recording.

**Key Constraints & Assumptions for Rev 1:**
* **In-Memory Backend:** All dynamic data (scheduled shows, active show state, user profiles, seat assignments) will be stored *in-memory* on the Node.js backend. This means data will be lost if the backend server restarts. Persistence will be addressed in future revisions.
* **Direct WebRTC (No SFU):** The artist's live stream will be delivered via direct peer-to-peer WebRTC connections to audience members. We are *assuming* a typical home broadband connection can reliably support up to **9 concurrent live viewers** from the artist's single outbound stream. This is a critical assumption to be validated during testing. Performance degradation may occur beyond this limit.
* **Browser-Based Recording:** Recordings will be initiated and stored locally within the user's or artist's browser. No server-side recording or persistent cloud storage of recordings in Rev 1.
* **~~Desktop Only~~** **UPDATED: Mobile-Responsive:** Rev 1 now includes mobile responsiveness and touch controls for a better user experience across devices.

---

## Phases and Milestones

### Phase 0: Project Setup & Initial Scaffolding ✅ COMPLETE
* **Goal:** Establish the basic project structure with all main files, containing only imports, ready for LLM-driven development.
* **Milestone:** All project directories and files are created, and initial dependencies are installed.

### Phase 1: Core 3D Environment & User Flow ✅ COMPLETE
* **Goal:** Implement the interactive 3D theater, user registration, seat selection, and basic show state animations.
* **Milestone 1:** The 3D theater environment is rendered, users can input their name/image and select a seat, and the camera transitions between the three defined views. Basic show state changes are visually and audibly represented.

### Phase 2: WebRTC Media Streaming & Recording ✅ MOSTLY COMPLETE
* **Goal:** Integrate live WebRTC streaming from the artist to up to 9 audience members, and enable browser-based recording.
* **Milestone 2:** Live WebRTC streaming from the artist to up to 9 concurrent audience members is functional (subject to real-world bandwidth). Browser-based recording and replay of performances are enabled.

### Phase 3: Artist Scheduling & Management (In-Memory) 🚧 IN PROGRESS
* **Goal:** Enable artists to schedule their own shows and manage their content via the in-memory backend.
* **Milestone 3:** Artists can schedule their own shows which are managed in-memory by the backend.

### Phase 4: Auto-Test Refinement & Deployment Prep 🔄 NEXT
* **Goal:** Ensure comprehensive auto-testing and prepare the project for initial deployment.
* **Milestone 4:** Robust auto-tests are in place, and the application is ready for initial deployment and real-world testing.

---

## Detailed Project Plan

### Phase 0: Project Setup & Initial Scaffolding ✅ COMPLETE

* `[✅]` **0.1. Run the `front_row_installer.py` script:** *(Equivalent setup completed via TypeScript/Vite migration)*
    * `[✅]` Execute project setup and verification - **DONE via Vite setup**
    * `[✅]` Verify project directories created - **DONE: front-row-vite, server, tests structure**
    * `[✅]` Verify all source files created - **DONE: TypeScript conversion complete**
    * `[✅]` Confirm audio files in place - **DONE: applause.mp3 in public/audio/**
* `[✅]` **0.2. Install Node.js Dependencies:**
    * `[✅]` Dependencies installed in both frontend and backend - **DONE: npm install completed**
    * `[✅]` Verify node_modules exist - **DONE**
* `[✅]` **0.3. Install Python Test Dependencies:**
    * `[✅]` Test requirements and Playwright setup - **DONE**
* `[✅]` **0.4. CLI Authentication (Interactive):**
    * `[✅]` Netlify authentication - **DONE: Deployed to frontrowtheater.netlify.app**
    * `[✅]` Backend deployment - **DONE: Deployed to frontrow-tvu6.onrender.com**
* `[✅]` **0.5. Project Initialization for Deployment (CLI):**
    * `[✅]` Netlify deployment configured - **DONE**
    * `[✅]` Backend deployment configured - **DONE**

---

### Phase 1: Core 3D Environment & User Flow ✅ COMPLETE (Milestone 1)

* `[✅]` **1.1. Backend: Basic API & WebSockets for Show State & Seat Management (In-Memory):**
    * `[✅]` **Backend API implemented** in `server/index.js`
        * `[✅]` `/api/shows` endpoints (GET, POST) - **DONE**
        * `[✅]` WebSocket connection for real-time updates - **DONE**
        * `[✅]` `select-seat` event handling - **DONE**
        * `[✅]` `artist-go-live` and `artist-end-show` events - **DONE**
        * `[✅]` In-memory data structures implemented - **DONE**
* `[✅]` **1.2. Frontend: `src/App.tsx` Core Logic:**
    * `[✅]` **Core App logic implemented**
        * `[✅]` State management for all core features - **DONE**
        * `[✅]` Socket.IO connection and listeners - **DONE**
        * `[✅]` User flow functions (name/image submit, seat selection, view changes) - **DONE**
        * `[✅]` Conditional rendering based on app state - **DONE**
* `[✅]` **1.3. Frontend: `src/components/LoadingScreen.tsx`:**
    * `[✅]` **Loading screen implemented** - **DONE with CSS animations**
* `[✅]` **1.4. Frontend: `src/components/UserInputForm.tsx`:**
    * `[✅]` **User input form implemented**
        * `[✅]` Name and image input fields - **DONE**
        * `[✅]` Image preview with Base64 handling - **DONE**
        * `[✅]` Form submission logic - **DONE**
        * `[✅]` Mobile camera integration - **DONE**
* `[✅]` **1.5. Frontend: `src/components/Stage.tsx`:**
    * `[✅]` **3D Stage implemented**
        * `[✅]` Stage geometry with semicircle platform - **DONE**
        * `[✅]` Artist name display on stage floor - **DONE**
        * `[✅]` YouTube screen integration - **DONE**
* `[✅]` **1.6. Frontend: `src/components/SeatSelection.tsx`:**
    * `[✅]` **Seat selection fully implemented**
        * `[✅]` 9 seats in 180-degree arc - **DONE**
        * `[✅]` Click handlers and visual states - **DONE**
        * `[✅]` Occupied seat display with names and images - **DONE**
        * `[✅]` Mobile-friendly larger touch targets - **DONE**
* `[✅]` **1.7. Frontend: `src/components/PerformerView.tsx`:**
    * `[✅]` **Performer camera view implemented** - **DONE**
* `[✅]` **1.8. Frontend: `src/components/UserView.tsx`:**
    * `[✅]` **User seat view implemented**
        * `[✅]` Camera positioning from selected seat - **DONE**
        * `[✅]` Peripheral audience member rendering - **DONE**
* `[✅]` **1.9. Frontend: Show State Animations:**
    * `[✅]` **Show state transitions implemented**
        * `[✅]` Pre-show, live, post-show states - **DONE**
        * `[✅]` Applause audio integration - **DONE**
        * `[✅]` Visual state indicators - **DONE**

### ✨ BONUS PHASE 1.5: Advanced UI/UX Improvements ✅ COMPLETE
* `[✅]` **Advanced Camera Controls:**
    * `[✅]` Collapsible camera controls with orbit functionality - **DONE**
    * `[✅]` Precision movement with fine-tuned increments - **DONE**
    * `[✅]` Position readout tool for easy camera positioning - **DONE**
    * `[✅]` Slower, more elegant transitions (1.2s) - **DONE**
* `[✅]` **Mobile & Touch Enhancements:**
    * `[✅]` Mobile-responsive seat selection - **DONE**
    * `[✅]` Touch event handling for 3D objects - **DONE**
    * `[✅]` Collapsible view controls - **DONE**
* `[✅]` **Production Deployment:**
    * `[✅]` Backend deployed to Render with CORS configuration - **DONE**
    * `[✅]` Frontend deployed to Netlify with environment variables - **DONE**
    * `[✅]` Live production URLs configured and tested - **DONE**

---

### Phase 2: WebRTC Media Streaming & Recording ✅ MOSTLY COMPLETE (Milestone 2)

* `[✅]` **2.1. Frontend: Artist WebRTC Stream Setup:**
    * `[✅]` **Artist streaming implemented**
        * `[✅]` getUserMedia integration - **DONE**
        * `[✅]` RTCPeerConnection setup - **DONE**
        * `[✅]` WebRTC offer/answer signaling - **DONE**
        * `[✅]` "Go Live" / "End Show" controls - **DONE**
* `[✅]` **2.2. Frontend: Audience WebRTC Stream Reception:**
    * `[✅]` **Audience streaming implemented**
        * `[✅]` Multiple audience member support - **DONE**
        * `[✅]` Remote stream handling - **DONE**
        * `[✅]` Stage video texture integration - **DONE**
        * `[🔄]` **Performance testing needed** - 9-viewer concurrent testing required
* `[✅]` **2.3. Frontend: Browser-Based Recording:**
    * `[✅]` **Recording functionality implemented**
        * `[✅]` MediaRecorder API integration - **DONE**
        * `[✅]` "Record Performance" and "Record My Experience" - **DONE**
        * `[✅]` Download recording functionality - **DONE**
* `[⏰]` **2.4. Frontend: "Past Shows" Integration:**
    * `[❌]` **Not implemented** - Placeholder needed for recorded show playback

---

### Phase 3: Artist Scheduling & Management 🚧 IN PROGRESS (Milestone 3)

* `[✅]` **3.1. Backend: In-Memory Show Scheduling:**
    * `[✅]` **Scheduling backend implemented**
        * `[✅]` scheduledShows array in memory - **DONE**
        * `[✅]` GET/POST /api/shows endpoints - **DONE**
* `[❌]` **3.2. Frontend: Artist Scheduling UI:**
    * `[❌]` **Artist dashboard not implemented** - Current placeholder shows alert
    * `[❌]` Show creation form needed
    * `[❌]` Show management interface needed

---

### Phase 4: Auto-Test Refinement & Deployment Prep 🔄 NEXT (Milestone 4)

* `[❌]` **4.1. Auto-Test Comprehensive Coverage:**
    * `[❌]` Multi-browser audience testing not implemented
    * `[❌]` 9-viewer concurrent performance validation needed
    * `[❌]` WebRTC stress testing required
* `[✅]` **4.2. Deployment Configuration:**
    * `[✅]` Production deployment complete - **DONE**
    * `[✅]` Environment configuration - **DONE**

---