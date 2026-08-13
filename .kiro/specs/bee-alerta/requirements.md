# Requirements Document

## Introduction

BEE-Alerta (Bacnotan BEE-Alert) is a Web-Based Municipal Ordinance Reporting and Monitoring System developed as a capstone project for LORMA Colleges, College of Computer Studies and Engineering (BS Information Technology), serving the Municipality of Bacnotan, La Union, Philippines.

The system enables residents to report community concerns (e.g., improper garbage disposal, illegal parking, noise disturbances) via a web browser, tag GPS locations, upload images, and track report status in real-time. Municipal officials and staff can monitor all submitted reports through an admin dashboard with statistics, charts, and management tools. An integrated AI chatbot powered by Ollama assists residents with ordinance inquiries and guides them through the reporting process.

The system is web-based only. It uses Firebase (Firestore, Firebase Auth, Firebase Storage) as the backend. A separate Firebase data structure document is provided for future reference when a mobile app version is developed.

---

## Glossary

- **BEE-Alerta**: The web-based municipal ordinance reporting and monitoring system; full name "Bacnotan BEE-Alert".
- **Resident**: A registered community member of Bacnotan, La Union, who can submit reports and use the chatbot.
- **Official**: A municipal staff member or administrator who manages and resolves submitted reports via the admin dashboard.
- **Report**: A submitted community concern containing a description, category, optional image, GPS location, and status.
- **Report_Status**: The lifecycle stage of a report: Pending → Ongoing → Completed.
- **Category**: A classification for a report — one of: Improper Garbage Disposal, Illegal Parking, Noise Disturbances, Public Disturbance, or Others.
- **Chatbot**: The Ollama-powered AI assistant embedded in the resident interface that answers ordinance questions and guides reporting.
- **Dashboard**: The admin interface showing aggregate statistics, charts, and the report management table.
- **Firebase**: The cloud platform (Google Firebase) providing Firestore database, Authentication, and Storage services.
- **Barangay**: A village or district subdivision within the municipality of Bacnotan.
- **GPS_Tag**: A latitude/longitude coordinate pair automatically captured from the user's browser geolocation and attached to a report.
- **System**: The BEE-Alerta web application as a whole.

---

## Requirements

### Requirement 1: User Authentication

**User Story:** As a visitor, I want to log in with my credentials and select my role, so that I can access features appropriate to whether I am a resident or a municipal official.

#### Acceptance Criteria

1. WHEN a visitor opens the application, THE System SHALL display the login page with the title "Bacnotan BEE-Alert", a role selector (Resident / Official), an email-or-phone-number field, a password field, a Sign In button, a Forgot Password link, social login options (Google, Facebook, Apple), and a Register Now link.
2. WHEN a visitor selects the Resident role and submits valid credentials, THE System SHALL authenticate the user via Firebase Auth and redirect to the Resident Dashboard.
3. WHEN a visitor selects the Official role and submits valid credentials, THE System SHALL authenticate the user via Firebase Auth and redirect to the Admin Dashboard.
4. IF a user submits credentials that do not match any registered account, THEN THE System SHALL display an inline error message stating that the email/phone or password is incorrect and SHALL NOT redirect.
5. IF a user submits the login form with an empty email/phone or password field, THEN THE System SHALL display a field-level validation error and SHALL NOT attempt authentication.
6. WHEN a user clicks Forgot Password and enters a registered email address, THE System SHALL send a password-reset email via Firebase Auth and display a confirmation message.
7. WHEN a user clicks a social login button (Google, Facebook, or Apple), THE System SHALL immediately initiate the corresponding OAuth flow via Firebase Auth and, upon success, redirect to the role-appropriate dashboard.
8. WHEN an authenticated user closes the browser and reopens the application within the Firebase session expiry window, THE System SHALL restore the authenticated session without requiring re-login.

---

### Requirement 2: Resident Registration

**User Story:** As a new resident, I want to create an account, so that I can submit reports and access resident features.

#### Acceptance Criteria

1. WHEN a visitor clicks the Register Now link on the login page, THE System SHALL display a registration form with fields for: full name, email address, phone number, barangay, and password.
2. WHEN a resident submits the registration form with all required fields filled in and a password of at least 8 characters, THE System SHALL create a Firebase Auth account and a corresponding Firestore user document, then redirect the resident to the Resident Dashboard.
3. IF a resident submits a registration form with an email address already associated with an existing account, THEN THE System SHALL display an inline error message stating the email is already registered and SHALL block the registration from proceeding.
4. IF a resident submits a password shorter than 8 characters or submits an empty password field, THEN THE System SHALL display a field-level validation error before submission.
5. IF a resident submits the registration form with any required field empty, THEN THE System SHALL display field-level validation errors for each empty field and SHALL NOT attempt registration.
6. THE System SHALL store resident profile data (full name, email, phone number, barangay, account creation timestamp) in Firestore upon successful registration.

---

### Requirement 3: Resident Dashboard and Navigation

**User Story:** As a resident, I want a clear dashboard with navigation, so that I can quickly access report submission, my report history, and the chatbot.

#### Acceptance Criteria

1. WHEN a resident is authenticated and on the Resident Dashboard, THE System SHALL display a navigation bar containing links to: Submit Report, My Reports, and Chatbot.
2. WHILE a resident is authenticated, THE System SHALL display the resident's full name and barangay in the navigation or header area.
3. WHEN a resident clicks a navigation link, THE System SHALL navigate to the corresponding section without a full page reload.
4. WHEN a resident clicks the Sign Out option, THE System SHALL invalidate the Firebase session and redirect to the login page, even if the session is already invalid.

---

### Requirement 4: Submit Report

**User Story:** As a resident, I want to submit a community concern report with a description, category, image, and GPS location, so that municipal officials can investigate and resolve the issue.

#### Acceptance Criteria

1. WHEN a resident navigates to Submit Report, THE System SHALL display a form with: a text description field, a category dropdown (Improper Garbage Disposal, Illegal Parking, Noise Disturbances, Public Disturbance, Others), an image upload or camera-capture control, and a GPS location capture button.
2. WHEN a resident clicks the GPS location capture button, THE System SHALL request browser geolocation permission and, upon permission grant, populate the latitude and longitude fields with the device's current coordinates.
3. IF the browser denies geolocation permission, THEN THE System SHALL display an informational message instructing the resident to enable location services, and SHALL allow manual coordinate entry.
4. WHEN a resident submits the report form with a description and category filled in, THE System SHALL create a Firestore report document with: resident user ID, description, category, GPS coordinates (if captured), image URL (if uploaded), submission timestamp, and an initial status of Pending.
5. IF a resident submits the report form with the description field empty, THEN THE System SHALL display a validation error and SHALL NOT submit the report.
6. IF a resident submits the report form with no category selected, THEN THE System SHALL display a validation error and SHALL NOT submit the report.
7. WHEN an image file is selected for upload, THE System SHALL upload the file to Firebase Storage and store the resulting URL in the report document.
8. IF the uploaded image file exceeds 5 MB, THEN THE System SHALL display an error message stating the file size limit and SHALL NOT upload the file.
9. WHEN a report is successfully submitted, THE System SHALL display a success confirmation message and clear the form fields.

---

### Requirement 5: View Own Reports

**User Story:** As a resident, I want to view all reports I have submitted and their current status, so that I can track the progress of my concerns.

#### Acceptance Criteria

1. WHEN a resident navigates to My Reports, THE System SHALL display a list of all reports submitted by the authenticated resident, ordered by submission date descending.
2. THE System SHALL display for each report: category, truncated description, submission date, and current status badge (Pending, Ongoing, or Completed).
3. WHEN a resident clicks on a report in the list, THE System SHALL display a detail view showing the full description, category, submission date, GPS coordinates (as a map or coordinate display), uploaded image (if any), and current status.
4. WHEN a report's status is updated by an Official in Firestore, THE System SHALL reflect the updated status in the resident's report list without requiring a page refresh.
5. WHEN a resident has no submitted reports, THE System SHALL display only an empty-state message encouraging the resident to submit their first report, and SHALL hide all other report-related UI elements.

---

### Requirement 6: Chatbot

**User Story:** As a resident, I want to interact with an AI chatbot, so that I can ask questions about municipal ordinances and get guided through the reporting process.

#### Acceptance Criteria

1. WHEN a resident navigates to the Chatbot section, THE System SHALL display a chat interface with a message history panel, a text input field, and a Send button.
2. WHEN a resident types a message and clicks Send or presses Enter, THE System SHALL send the message to the Ollama-based chatbot and display the resident's message in the chat history.
3. WHEN the Ollama chatbot returns a response, THE System SHALL display the response in the chat history with a visual distinction from the resident's messages.
4. WHILE the chatbot is processing a response, THE System SHALL display a loading indicator in the chat history.
5. IF the Ollama service is unavailable, THEN THE System SHALL display an error message in the chat interface stating the assistant is temporarily unavailable, and SHALL also display any partially completed response if one was in progress.
6. THE Chatbot SHALL be configured with knowledge of Bacnotan municipal ordinances and SHALL provide guidance on the reporting process when asked.
7. THE System SHALL preserve the chat message history for the duration of the resident's session.

---

### Requirement 7: Admin Dashboard Overview

**User Story:** As a municipal official, I want an overview dashboard with key statistics and charts, so that I can quickly assess the state of community reports.

#### Acceptance Criteria

1. WHEN an Official is authenticated and on the Admin Dashboard, THE System SHALL display four summary cards showing: total report count, pending report count, ongoing report count, and completed report count.
2. THE System SHALL display a line chart showing report submission trends over time (by day or week).
3. THE System SHALL display a bar chart comparing report counts across categories.
4. WHEN report data exists, THE System SHALL display a pie chart showing the proportional breakdown of reports by Category; WHEN all report counts are zero, THE System SHALL display a "no data available" message in place of the pie chart.
5. THE System SHALL display a Recent Reports list on the dashboard showing the latest 5–10 reports with category, status badge, and submission date.
6. WHEN Firestore report data changes (new submission or status update), THE System SHALL update the dashboard statistics and charts in real time without requiring a page refresh.
7. WHEN an Official is authenticated and on the Admin Dashboard, THE System SHALL display a sidebar navigation with links to: Dashboard, Community Concern Management, and Settings.

---

### Requirement 8: Community Concern Management

**User Story:** As a municipal official, I want to view, filter, search, and update all submitted reports, so that I can manage community concerns efficiently.

#### Acceptance Criteria

1. WHEN an Official navigates to Community Concern Management, THE System SHALL display a table of all submitted reports with columns: Report ID, Resident Name, Category, Description (truncated), Submitted Date, Image (thumbnail or icon), Status, and Actions.
2. THE System SHALL support filtering the report table by Status (All, Pending, Ongoing, Completed).
3. THE System SHALL support filtering the report table by Category.
4. WHEN an Official types in a search field, THE System SHALL filter the table to show only reports whose description or resident name contains the search text.
5. WHEN an Official clicks an Actions button for a report, THE System SHALL display options to: View Full Details, Change Status.
6. WHEN an Official selects a new status for a report (Pending, Ongoing, or Completed), THE System SHALL update the report document in Firestore immediately and reflect the change in the table.
7. WHEN the status of a report is updated, THE System SHALL record the update timestamp in the report document.
8. THE System SHALL support pagination or infinite scroll for the report table when more than 20 reports exist.
9. WHEN viewing the full details of a report, THE System SHALL display: resident name, barangay, description, category, GPS coordinates (as a map or coordinate display), uploaded image (full size), submission date, and status history.

---

### Requirement 9: Admin Settings

**User Story:** As a municipal official, I want to configure system settings, so that I can manage notifications and content preferences.

#### Acceptance Criteria

1. WHEN an Official navigates to Settings, THE System SHALL display three sections: General Settings, Notification Settings, and Content Preferences.
2. THE System SHALL display toggle switches for each configurable setting.
3. WHEN an Official toggles a setting and the Firestore write fails, THE System SHALL keep the toggle in its updated state, display an error message, and allow the user to retry the save operation.
4. THE Notification Settings section SHALL include a toggle to enable or disable email notifications for new report submissions.
5. THE General Settings section SHALL include the ability to update the official's display name and contact email.

---

### Requirement 10: Real-Time Updates

**User Story:** As a user of the system, I want data to update automatically, so that I always see the current state of reports without manually refreshing the page.

#### Acceptance Criteria

1. WHEN a new report is submitted by any Resident, THE Admin Dashboard statistics and the Community Concern Management table SHALL reflect the new report within 3 seconds without a page reload; IF the update exceeds 3 seconds, THE System SHALL display a loading indicator until synchronization completes.
2. WHEN an Official updates a report's status, THE Resident's My Reports list SHALL reflect the updated status within 3 seconds without a page reload.
3. THE System SHALL use Firestore real-time listeners to achieve live data synchronization across both resident and official interfaces.

---

### Requirement 11: Responsive Web Design

**User Story:** As a user, I want the application to display correctly on different screen sizes, so that I can use it on desktop, tablet, or mobile browser.

#### Acceptance Criteria

1. THE System SHALL render all pages correctly on viewport widths from 360 px (mobile) to 1920 px (desktop) without horizontal scrolling or overlapping elements. Viewports wider than 1920 px are outside the supported range.
2. THE System SHALL adapt the navigation sidebar on the admin interface to a collapsible drawer on viewport widths below 768 px.
3. THE System SHALL adapt the report table on the admin interface to a card-based list layout on viewport widths below 768 px.
4. THE System SHALL use relative units (rem, %, vw) rather than fixed pixel widths for layout containers.

---

### Requirement 12: Accessibility

**User Story:** As a user with accessibility needs, I want the web application to follow basic accessibility standards, so that I can navigate and use it with assistive technologies.

#### Acceptance Criteria

1. THE System SHALL provide descriptive alt text for all meaningful images and icons.
2. THE System SHALL use semantic HTML elements (nav, main, header, section, button, label) throughout all pages.
3. THE System SHALL ensure all interactive elements are keyboard-navigable and have a visible focus indicator.
4. THE System SHALL maintain a color contrast ratio of at least 4.5:1 for normal text against its background, consistent with WCAG 2.1 AA standards.
5. THE System SHALL associate all form inputs with visible labels using the HTML label element or aria-label attribute.

---

### Requirement 13: Firebase Data Structure (Future Reference — Mobile App Phase)

**User Story:** As a future developer of the mobile app version, I want a documented Firestore data structure, so that I can build the mobile app with consistent data models.

#### Acceptance Criteria

1. THE System documentation SHALL define a `users` Firestore collection with fields: userId (string), fullName (string), email (string), phoneNumber (string), barangay (string), role (string: "resident" | "official"), createdAt (timestamp).
2. THE System documentation SHALL define a `reports` Firestore collection with fields: reportId (string), residentId (string), residentName (string), barangay (string), category (string), description (string), imageUrl (string, optional), latitude (number, optional), longitude (number, optional), status (string: "Pending" | "Ongoing" | "Completed"), submittedAt (timestamp), updatedAt (timestamp).
3. THE System documentation SHALL define a `settings` Firestore collection with fields: officialId (string), emailNotificationsEnabled (boolean), displayName (string), contactEmail (string), updatedAt (timestamp).
4. THE System documentation SHALL be noted as reference material for the future mobile app phase and SHALL NOT be implemented as a separate module in the current web-based version.
