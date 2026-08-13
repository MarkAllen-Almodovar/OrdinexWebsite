# Bacnotan BEE-Alert — Documentation

## Project Overview

Bacnotan BEE-Alert (Bacnotan Emergency and Environment Alert) is a web application for residents and barangay officials of Bacnotan to report and manage community concerns. Residents submit reports (noise, illegal parking, garbage, etc.), track their submissions, and chat with an AI assistant. Officials log in to a separate admin portal to triage, update, and resolve concerns.

The frontend is a multi-page Vite app backed by Firebase Authentication, Firestore, and Cloud Storage. The local AI chatbot feature uses Ollama running on the same machine.

---

## File Structure

```
BeeAlertWebsite/
├── index.html              # Sign-in page
├── register.html           # Registration page
├── resident.html           # Resident portal (submit / track reports + chatbot)
├── admin.html              # Official/admin portal
├── vite.config.js          # Vite build config (multi-page entry points)
├── vitest.config.js        # Vitest test config
├── package.json
├── .env.example            # Template — copy to .env and fill in values
├── firebase.json           # Firebase Hosting config
├── .firebaserc             # Firebase project alias
│
├── src/
│   ├── auth/
│   │   ├── login.js        # Sign-in form, forgot-password flow, auth guard
│   │   ├── register.js     # Registration form with validation
│   │   └── social.js       # Google / Facebook / Apple OAuth
│   ├── resident/
│   │   ├── app.js          # Resident SPA entry: auth guard, tab routing
│   │   ├── report-form.js  # Submit new concern report
│   │   ├── my-reports.js   # View / filter own submitted reports
│   │   └── chatbot.js      # AI chatbot powered by Ollama
│   ├── admin/
│   │   ├── app.js          # Admin SPA entry: auth guard, section routing
│   │   ├── dashboard.js    # Stats dashboard with Chart.js
│   │   ├── concern-table.js# Filterable / paginated report management table
│   │   └── settings.js     # Admin account settings
│   └── shared/
│       ├── firebase.js     # Firebase app initialisation (reads VITE_* env vars)
│       ├── auth-guard.js   # Role-aware route protection
│       ├── ui-helpers.js   # Shared UI utilities (toasts, badges, date formatting)
│       └── styles/
│           └── main.css    # Global stylesheet
│
└── tests/
    └── unit/
        ├── register.test.js       # validatePassword, validateRegistrationForm, getPasswordStrength
        ├── report-form.test.js    # validateReportForm, validateImageFile
        ├── concern-table.test.js  # applyFilters, paginateReports
        └── ui-helpers.test.js     # statusBadge, formatDate, showToast, loading overlay
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your Firebase project credentials. Find these in the Firebase Console under **Project Settings → Your apps → SDK setup and configuration**:

```dotenv
VITE_API_KEY=<your Firebase API key>
VITE_AUTH_DOMAIN=<your-project-id>.firebaseapp.com
VITE_PROJECT_ID=<your-project-id>
VITE_STORAGE_BUCKET=<your-project-id>.appspot.com
VITE_MESSAGING_SENDER_ID=<your messaging sender ID>
VITE_APP_ID=<your Firebase app ID>

# Ollama endpoint (default — change if using a different port or host)
VITE_OLLAMA_URL=http://localhost:11434
```

### 3. Firebase project setup

In the Firebase Console, enable:
- **Authentication** — Email/Password provider (and optionally Google, Facebook, Apple)
- **Firestore Database** — create in production or test mode
- **Storage** — for report photo uploads

Deploy Firestore security rules from `firebase.json` when ready:

```bash
firebase deploy --only firestore,storage
```

---

## Running the Dev Server

```bash
npm run dev
```

Opens at `http://localhost:5173`. All four pages are available:

| URL | Page |
|-----|------|
| `/` or `/index.html` | Sign-in |
| `/register.html` | Create account |
| `/resident.html` | Resident portal |
| `/admin.html` | Admin portal |

---

## Running Tests

```bash
npm test
```

Runs all 118 unit tests with Vitest. All tests are in `tests/unit/` and run against pure exported functions — no Firebase credentials needed.

```bash
npm run test:unit      # unit tests only
npm run test:property  # property-based tests (fast-check)
npm run test:watch     # watch mode during development
```

---

## Building for Production

```bash
npm run build
```

Output goes to `dist/`. The build bundles all four HTML entry points with their module graphs, hashes assets, and tree-shakes unused code.

```bash
npm run preview   # serve the dist/ build locally for smoke-testing
```

---

## Firebase Data Structure

### `users/{uid}`

| Field | Type | Description |
|-------|------|-------------|
| `fullName` | string | Resident's full name |
| `email` | string | Email address |
| `phoneNumber` | string | Philippine mobile number |
| `barangay` | string | Barangay name |
| `role` | `"resident"` \| `"official"` | Determines which portal the user sees |
| `createdAt` | Timestamp | Server timestamp set at registration |

### `reports/{reportId}`

| Field | Type | Description |
|-------|------|-------------|
| `uid` | string | Firebase Auth UID of the submitting resident |
| `residentName` | string | Resident's full name (denormalised) |
| `barangay` | string | Resident's barangay (denormalised) |
| `category` | string | One of: `Improper Garbage Disposal`, `Illegal Parking`, `Noise Disturbances`, `Public Disturbance`, `Others` |
| `description` | string | Free-text description of the concern |
| `status` | `"Pending"` \| `"Ongoing"` \| `"Completed"` | Managed by officials |
| `photoURL` | string \| null | Cloud Storage download URL (optional) |
| `submittedAt` | Timestamp | Server timestamp set on creation |
| `updatedAt` | Timestamp | Server timestamp updated by admin actions |
| `adminNote` | string | Official's response / resolution note |

---

## Known Limitations

- **Firebase credentials required** — The app will not authenticate or load data without a real Firebase project. Copy `.env.example` to `.env` and fill in all `VITE_*` values before running in development or production.
- **Ollama must be running locally** — The resident chatbot tab calls `http://localhost:11434` (or `VITE_OLLAMA_URL`). If Ollama is not installed and running, chatbot requests will fail. Install Ollama from [ollama.com](https://ollama.com) and pull a model (e.g. `ollama pull llama3`) before using the chatbot feature.
- **Social login needs provider configuration** — Google, Facebook, and Apple sign-in require the respective OAuth providers to be enabled and configured in the Firebase Console, and (for Facebook/Apple) additional app credentials set up with those platforms.
- **No offline support** — The app requires an active network connection to Firebase. There is no service worker or offline cache.
- **Single municipality** — The app is scoped to Bacnotan. Barangay is a free-text field; there is no validation against a fixed list of barangays.
