# Design Document — BEE-Alerta

## Overview

BEE-Alerta is a client-side web application built with vanilla HTML, CSS, and JavaScript. It uses Google Firebase as its entire backend: Firebase Authentication for identity management, Cloud Firestore for real-time database operations, and Firebase Storage for image uploads. An Ollama-powered local AI chatbot answers ordinance questions and guides residents through the reporting workflow.

The application presents two distinct user experiences within a single codebase:
- **Resident interface** — submit reports, track own reports, chat with the ordinance assistant.
- **Official (Admin) interface** — monitor community statistics, manage and update all reports, configure settings.

Role routing is enforced after authentication: the logged-in user's Firestore `role` field determines which interface is loaded.

### Design Goals

1. **Real-time by default** — Firestore listeners push changes instantly; no manual refresh needed.
2. **Warm, accessible UI** — Orange/amber brand palette with WCAG 2.1 AA contrast; keyboard-navigable throughout.
3. **Offline-graceful** — Firebase SDK caches recent reads; the UI surfaces meaningful errors when connectivity is lost.
4. **Capstone scope** — No server-side rendering framework; vanilla JS with modular ES modules keeps dependencies minimal and understandable for academic review.

---

## Architecture

```
┌────────────────────────────────────────────────┐
│                   Browser                      │
│  ┌──────────┐  ┌───────────────────────────┐  │
│  │ Auth SPA │  │     Main SPA (per role)   │  │
│  │ login.html│  │  resident.html / admin.html│  │
│  └────┬─────┘  └────────────┬──────────────┘  │
│       │                     │                  │
│  ┌────▼─────────────────────▼──────────────┐  │
│  │           Firebase JS SDK (v9 modular)  │  │
│  │  Auth  │  Firestore  │  Storage         │  │
│  └────────┴──────┬──────┴──────────────────┘  │
└──────────────────┼─────────────────────────────┘
                   │ HTTPS
         ┌─────────▼──────────┐
         │  Firebase Platform │
         │  (Google Cloud)    │
         └────────────────────┘
                   
         ┌────────────────────┐
         │  Ollama HTTP API   │  (local or self-hosted)
         │  POST /api/chat    │
         └────────────────────┘
```

### Page / Route Map

| File | Purpose |
|---|---|
| `index.html` | Login page — role selector, email/password, social auth |
| `register.html` | Resident registration form |
| `resident.html` | Resident SPA shell (Submit Report, My Reports, Chatbot tabs) |
| `admin.html` | Admin SPA shell (Dashboard, Concern Management, Settings) |

All JavaScript is split into ES modules under `src/`:

```
src/
  auth/
    login.js          # Login form logic, Firebase signInWithEmailAndPassword
    register.js       # Registration form logic
    social.js         # Google / Facebook / Apple OAuth helpers
  resident/
    report-form.js    # Submit report form, geolocation, image upload
    my-reports.js     # Firestore listener for own reports
    chatbot.js        # Ollama API client, chat UI
  admin/
    dashboard.js      # Stats cards, charts (Chart.js), recent reports listener
    concern-table.js  # Report management table, filters, search, pagination
    settings.js       # Settings toggles, Firestore persistence
  shared/
    firebase.js       # Firebase app + service initialization (singleton)
    auth-guard.js     # Role-aware redirect on page load
    ui-helpers.js     # Status badge renderer, date formatter, toast helper
    real-time.js      # Shared Firestore listener factory
```

---

## Components and Interfaces

### 1. Login Page (`index.html`)

**Visual layout:**
- Centered card on warm cream (`#FFF8F0`) background
- Gradient orange header bar (`#F97316` → `#FB923C`) with "Bacnotan BEE-Alert" title and bee logo
- Role selector: two cards (Resident / Official) with radio-button semantics
- Email-or-phone field, password field, Sign In button (filled orange)
- Row: Forgot Password link | Register Now link
- Divider "or continue with"
- Social login buttons: Google, Facebook, Apple (icon + label)

**JavaScript behaviour (`auth/login.js`):**
- On page load, `auth-guard.js` checks for an existing Firebase session; if present, redirects immediately to role-appropriate page.
- On Sign In: validates non-empty fields, calls `signInWithEmailAndPassword`, reads `role` from Firestore `users/{uid}`, routes accordingly.
- On social button click: immediately calls `signInWithPopup` with the appropriate provider.
- On Forgot Password: renders inline modal for email input, calls `sendPasswordResetEmail`.

### 2. Registration Page (`register.html`)

**Fields:** Full Name, Email, Phone Number, Barangay (text input), Password, Confirm Password.

**Validation (client-side, before Firebase call):**
- All fields required.
- Password ≥ 8 characters; Confirm Password must match.
- Email format check (HTML5 `type="email"` + regex fallback).

**On submit:**
1. `createUserWithEmailAndPassword` → Firebase Auth account.
2. `setDoc(doc(db, 'users', uid), { fullName, email, phoneNumber, barangay, role: 'resident', createdAt })` → Firestore.
3. Redirect to `resident.html`.

### 3. Auth Guard (`shared/auth-guard.js`)

Every protected page imports `authGuard(requiredRole)`:
```js
// auth-guard.js
import { onAuthStateChanged } from 'firebase/auth';
import { getDoc, doc } from 'firebase/firestore';

export async function authGuard(requiredRole) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) { window.location.href = '/index.html'; return; }
      const snap = await getDoc(doc(db, 'users', user.uid));
      const role = snap.data()?.role;
      if (role !== requiredRole) {
        window.location.href = role === 'official' ? '/admin.html' : '/resident.html';
        return;
      }
      resolve(user);
    });
  });
}
```

### 4. Resident SPA (`resident.html`)

Tab-based single-page layout. Active tab content is shown; others have `display: none`.

**Tabs:** Submit Report | My Reports | Chatbot

**Submit Report tab:**
- Form fields: description (textarea), category (select), image upload (accept="image/*"), GPS capture button.
- GPS button calls `navigator.geolocation.getCurrentPosition`; on success fills hidden lat/lng inputs.
- On submit: validates required fields → uploads image to `Firebase Storage` at path `reports/{uid}/{timestamp}_{filename}` → writes Firestore document → shows success toast.

**My Reports tab:**
- Firestore query: `where('residentId', '==', uid)`, `orderBy('submittedAt', 'desc')`.
- `onSnapshot` listener re-renders the list on every change.
- Each row shows: category badge, truncated description, date, status badge (colour-coded).
- Clicking a row opens a detail modal with full info, image, and GPS display.

**Chatbot tab:**
- Chat bubble UI: resident messages right-aligned (orange), assistant messages left-aligned (white card).
- On send: appends user bubble, shows animated dots loader, calls `POST /api/chat` on the Ollama server.
- On response: removes loader, appends assistant bubble.
- On error: appends error bubble, preserves any partial response already displayed.
- Session history kept in a JS array (not persisted to Firestore in this version).

### 5. Admin SPA (`admin.html`)

Sidebar + main-content layout.

**Sidebar navigation:** Dashboard | Community Concern Management | Settings | (Sign Out at bottom)

On mobile (< 768 px): sidebar collapses to a hamburger-triggered drawer overlay.

#### 5a. Dashboard Section

- Four summary stat cards: Total, Pending, Ongoing, Completed — computed from live Firestore aggregate query or client-side count.
- **Line chart** — Chart.js `Line`; x-axis = last 14 days, y-axis = submissions per day.
- **Bar chart** — Chart.js `Bar`; x-axis = categories, y-axis = count.
- **Pie chart** — Chart.js `Doughnut`; category breakdown. Shows "No data available" placeholder when total = 0.
- **Recent Reports** — last 10 reports from `onSnapshot`, rendered as a mini-table.
- Loading indicator shown when Firestore update latency exceeds 3 seconds (timeout-triggered CSS spinner overlay).

#### 5b. Community Concern Management Section

Table columns: `#` | Resident | Category | Description | Date | Image | Status | Actions

**Filters bar:** Status dropdown | Category dropdown | Search text input (debounced 300 ms)

**Pagination:** 20 rows per page; "Load More" button fetches next batch via Firestore `startAfter` cursor.

**Actions menu (per row):**
- View Full Details → opens detail modal (same fields as resident detail view + status history timeline)
- Change Status → inline dropdown → `updateDoc` call → optimistic UI update

**Status history:** stored as a Firestore sub-collection `reports/{id}/statusHistory` with fields `{ status, updatedAt, updatedBy }`.

#### 5c. Settings Section

Three accordion sections: General Settings | Notification Settings | Content Preferences

Each setting renders as a labelled toggle switch (`<input type="checkbox" role="switch">`).

On toggle: immediate `setDoc` to `settings/{officialId}` with merged update. On Firestore write failure: toggle stays visually changed, error toast shown with a Retry button.

### 6. Shared UI Helpers (`shared/ui-helpers.js`)

```js
export function statusBadge(status) { /* returns <span> with colour class */ }
export function formatDate(timestamp) { /* returns 'Jan 15, 2025' format */ }
export function showToast(message, type = 'success') { /* renders dismissible toast */ }
export function showLoadingOverlay() { /* shows spinner overlay on active section */ }
export function hideLoadingOverlay() { /* hides spinner overlay */ }
```

---

## Data Models

### Firestore Collection: `users`

| Field | Type | Notes |
|---|---|---|
| `userId` | string | Same as Firebase Auth UID |
| `fullName` | string | |
| `email` | string | |
| `phoneNumber` | string | |
| `barangay` | string | |
| `role` | string | `"resident"` or `"official"` |
| `createdAt` | timestamp | Server timestamp |

### Firestore Collection: `reports`

| Field | Type | Notes |
|---|---|---|
| `reportId` | string | Auto-generated Firestore ID |
| `residentId` | string | Firebase Auth UID of submitter |
| `residentName` | string | Denormalized from users doc at submission time |
| `barangay` | string | Denormalized from users doc |
| `category` | string | One of the five defined categories |
| `description` | string | Free text |
| `imageUrl` | string? | Firebase Storage download URL; null if no image |
| `latitude` | number? | GPS coordinate; null if not captured |
| `longitude` | number? | GPS coordinate; null if not captured |
| `status` | string | `"Pending"` &#124; `"Ongoing"` &#124; `"Completed"` |
| `submittedAt` | timestamp | |
| `updatedAt` | timestamp | Updated on every status change |

### Firestore Sub-collection: `reports/{id}/statusHistory`

| Field | Type | Notes |
|---|---|---|
| `status` | string | New status value |
| `updatedAt` | timestamp | |
| `updatedBy` | string | Official's Firebase Auth UID |

### Firestore Collection: `settings`

| Field | Type | Notes |
|---|---|---|
| `officialId` | string | Firebase Auth UID |
| `emailNotificationsEnabled` | boolean | |
| `displayName` | string | |
| `contactEmail` | string | |
| `updatedAt` | timestamp | |

> **Note:** The above data models are the canonical Firestore structure for both the web application and the future mobile app phase. The mobile app should read/write these same collections to ensure data consistency.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Report Submission Round Trip

*For any* valid report object (non-empty description, valid category, optional image URL, optional GPS coordinates), submitting the report and then querying the `reports` collection by `residentId` SHALL return a document containing all submitted field values unchanged.

**Validates: Requirements 4.4, 4.7**

---

### Property 2: Status Transition Validity

*For any* report document, the `status` field SHALL always be one of exactly three valid values: `"Pending"`, `"Ongoing"`, or `"Completed"`. After an Official applies any status change, the updated document SHALL contain only a valid status value.

**Validates: Requirements 8.6**

---

### Property 3: Report Ownership Isolation

*For any* authenticated resident, the My Reports query SHALL return only reports where `residentId` equals the authenticated user's UID — regardless of how many other residents have submitted reports.

**Validates: Requirements 5.1**

---

### Property 4: Input Validation Rejects Blank Descriptions

*For any* string composed entirely of whitespace characters (spaces, tabs, newlines), submitting it as a report description SHALL be rejected by the client-side validator, and no Firestore write SHALL be attempted.

**Validates: Requirements 4.5**

---

### Property 5: Image Size Gate

*For any* image file with byte size greater than 5 × 1024 × 1024 bytes (5 MB), the upload validation function SHALL reject the file and return an error message, and no Firebase Storage upload SHALL be initiated.

**Validates: Requirements 4.8**

---

### Property 6: Status Badge Rendering

*For any* report with a valid status value, the `statusBadge()` rendering function SHALL return an HTML element with a non-empty `class` attribute and non-empty inner text that matches the status value.

**Validates: Requirements 5.2, 8.1**

---

### Property 7: Settings Persistence Round Trip

*For any* settings object (boolean flags, display name, contact email), writing the object to Firestore and then reading it back SHALL return an equivalent object with all field values preserved.

**Validates: Requirements 9.3**

---

### Property 8: Date Formatting Consistency

*For any* Firestore timestamp, the `formatDate()` helper SHALL return a non-empty string in a human-readable format that correctly encodes the year, month, and day from the original timestamp.

**Validates: Requirements 5.2, 7.5, 8.1**

---

## Error Handling

| Scenario | Handling |
|---|---|
| Firebase Auth — wrong credentials | Inline form error message; no redirect |
| Firebase Auth — email already in use | Inline registration error; block submit |
| Firestore read failure | Toast error; retry button; stale data remains visible |
| Firestore write failure (settings) | Toggle stays changed; error toast with Retry |
| Firebase Storage upload failure | Toast error; form remains open |
| Geolocation denied | Info message; allow manual entry fallback |
| Image file > 5 MB | File input error message; upload blocked |
| Ollama unavailable | Error bubble in chat; partial response shown if available |
| Network offline (general) | Firebase SDK serves cached reads; write operations queued until reconnect |
| Real-time update latency > 3 s | Loading spinner overlay shown until sync completes |

---

## Testing Strategy

### PBT Applicability Assessment

This feature includes pure transformation functions (validation, status-badge rendering, date formatting, data-model I/O) that are suitable for property-based testing. All Correctness Properties above map directly to testable properties using a PBT library.

**PBT does NOT apply to:**
- Firebase Storage upload integration (external service, use integration tests)
- Firebase Auth flows (external service, use example-based mocks)
- Chart.js rendering (UI library, use snapshot tests)
- Sidebar navigation toggling (UI behavior, use example-based tests)

### Property-Based Testing

**Library:** [fast-check](https://github.com/dubzzz/fast-check) (JavaScript; runs in Node.js via Vitest)

**Configuration:** Minimum 100 iterations per property test.

**Tag format:** `// Feature: bee-alerta, Property N: <property_text>`

Each Correctness Property MUST be implemented as a single property-based test.

### Unit Testing

**Framework:** Vitest

Unit tests target:
- `auth/login.js` — field validation logic
- `auth/register.js` — password and email validation
- `resident/report-form.js` — form validation, GPS capture mock
- `shared/ui-helpers.js` — `statusBadge`, `formatDate`, `showToast`
- `admin/concern-table.js` — filter and search logic

### Integration Testing

- Firebase Auth sign-in and registration flows (using Firebase Emulator Suite)
- Firestore report CRUD operations (using Firebase Emulator Suite)
- Firebase Storage upload (using Firebase Emulator Suite)
- End-to-end status update flow: Official changes status → Resident's My Reports reflects change (Emulator Suite)

### Manual / Acceptance Testing

- Responsive layout on Chrome DevTools device profiles (360 px, 768 px, 1440 px)
- Keyboard navigation through all forms and tables
- Screen reader smoke test with NVDA or VoiceOver

### Test Directory Layout

```
tests/
  unit/
    ui-helpers.test.js
    report-form.test.js
    concern-table.test.js
    login.test.js
    register.test.js
  property/
    report-submission.property.test.js   # Property 1
    status-transition.property.test.js   # Property 2
    ownership-isolation.property.test.js # Property 3
    blank-description.property.test.js   # Property 4
    image-size-gate.property.test.js     # Property 5
    status-badge.property.test.js        # Property 6
    settings-persistence.property.test.js # Property 7
    date-formatting.property.test.js     # Property 8
  integration/
    auth.integration.test.js
    reports.integration.test.js
    storage.integration.test.js
    realtime-status.integration.test.js
```
