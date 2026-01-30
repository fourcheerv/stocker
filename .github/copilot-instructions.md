# Stocker - AI Coding Agent Instructions

## Project Overview
**Stocker** is a PWA (Progressive Web App) for tracking inventory stock operations across multiple departments in a printing company. It provides role-based access, QR code scanning, photo capture, and Excel import/export capabilities.

## Architecture

### Core Stack
- **Frontend**: Vanilla JavaScript (no frameworks) with HTML5/CSS3, PWA features (Service Worker)
- **Database**: PouchDB (offline-first) syncing with CouchDB remote server
- **Backend**: Node.js Express (optional, currently unused endpoints in `backend-server/server.js`)
- **Auth**: Session-based (SessionStorage) + IndexedDB for user credentials
- **External APIs**: Google Drive API (for email exports), html5-qrcode library

### Key Directories
- `js/` - Main application logic (app.js, login.js, admin.js, bobines.js)
- `css/` - Global and page-specific styles
- `backend-server/` - Express server (PouchDB endpoints, JWT auth - not currently integrated)
- `stocker_session/` - Alternative session-based implementation (see dual architecture note)

### Data Flow
1. **Login** → SessionStorage stores account ID → Redirects to appropriate page
2. **Data Entry** → Form submitted → PouchDB local storage → Live sync to remote CouchDB
3. **Admin Panel** → Fetches all docs from local DB → Display/export/delete operations
4. **Logout** → Clears SessionStorage + CouchDB session

## Critical Patterns & Conventions

### 1. PouchDB Database Configuration
All pages use the same local/remote DB pair:
```javascript
const localDB = new PouchDB("stocks");
const remoteDB = new PouchDB("https://access:4G9?r3oKH7tSbCB7rMM9PDpq7L5Yn&tCgE8?qEDD@couchdb.monproprecloud.fr/stocks");
localDB.sync(remoteDB, { live: true, retry: true }).on("error", console.error);
```
⚠️ **Critical**: DB credentials are embedded in URLs. CouchDB uses cookie-based auth via `/_session` endpoint.

### 2. Authentication Flow
- **Method**: SessionStorage-based (NOT JWT tokens currently implemented)
- **Account Storage**: Hardcoded in [login.js](login.js) with service names and redirect URLs
- **Admin Flag**: Account ID "Admin" with password "adminStocker2025!" unlocks admin.html
- **Session Check**: Every page validates `currentAccount` from SessionStorage, redirects to login if missing

### 3. User Accounts (Service-based)
15+ predefined accounts in [js/login.js](js/login.js), each mapped to departments:
- Example: `'btn-bobines'` → BOB329 → bobines.html
- Each service account has unique password and redirect destination
- Admin account provides full data access and export capabilities

### 4. Form & Data Structure
Stock records contain:
- `code_produit` (QR-scanned product code, required)
- `designation` (product name from Excel import datalist)
- `quantite_sortie` (numeric)
- `libelle_axe1/axe2/axe3` (optional category fields)
- `date_sortie` (ISO datetime, auto-populated)
- `photos` (array of base64 image strings, max 3)
- Generated `_id`, `_rev` for PouchDB

### 5. Excel Import Pattern
[app.js](js/app.js) uses XLSX library to load product list:
- Expects Excel file with `code_produit` and `designation` columns
- Populates HTML5 `<datalist>` for autocomplete
- Called during DOMContentLoaded via `loadExcelData()`

### 6. Service Worker & Offline First
[service-worker.js](js/service-worker.js) caches core assets (login page, CSS, icons).
- Enables app to work offline with locally cached data
- PouchDB sync queue ensures records sync when connection restored
- Cache versioning via `CACHE_NAME` variable

### 7. Photo Handling
- Images captured or selected are compressed via canvas
- Stored as base64 strings in PouchDB document
- Limited to 3 photos per record (UI enforced)
- Compression reduces size for sync efficiency

### 8. Admin Panel Specifics
[admin.js](js/admin.js) includes:
- **Pagination**: 10 items per page with custom navigation
- **Filtering**: By search text, date range, service account
- **Export**: CSV to browser download or Base64-encoded email via Google Drive API
- **Bobines Special**: Uses XLSX export instead of CSV
- **Edit Modal**: Inline editing of any field with save to PouchDB
- **Bulk Operations**: Select multiple records for mass delete

## Common Workflows

### Adding a New Service Account
1. Add entry to `serviceAccounts` object in [login.js](js/login.js)
2. Update filter dropdown in [admin.html](admin.html) and [bobines.html](bobines.html)
3. Update [admin.js](js/admin.js) CSS visibility logic for Bobines export button

### Fixing Sync Issues
- Check CouchDB remote URL and credentials in app.js/admin.js/bobines.js (all three!)
- Verify SessionStorage is not cleared during auth errors
- Monitor browser console for 401 errors (session expired)
- Test offline mode via DevTools → Network → Offline

### Modifying Form Fields
- Update HTML form structure in [index.html](index.html)
- Add field to `generateEditFields()` in [admin.js](js/admin.js) for edit modal
- Update CSV export logic in `generateCSVContent()` function
- Preserve field in `getAxe1Label()` and similar helper functions if user-facing

### Database Operations
- **Read**: `localDB.allDocs({include_docs: true})` for full list
- **Write**: `localDB.post(record)` for new, `localDB.put(doc)` for updates
- **Delete**: Must include `_rev` in deletion payload
- **Sync**: Trigger manually via `syncWithServer()` or use live sync

## Language & Conventions
- **Language**: French (UI text, variable names, comments)
- **Date Format**: ISO 8601 for storage (`toISOString()`), localized display (`toLocaleDateString('fr-FR')`)
- **CSS Classes**: kebab-case (e.g., `.logout-btn`, `.filter-container`)
- **Function Names**: camelCase in English (e.g., `formatDateForDisplay()`, `exportToCSV()`)
- **Error Handling**: Use `try/catch` with `console.error()` + user alerts via `alert()`

## Dual Architecture Note
⚠️ **Workspace contains two versions**:
- `/js` - Main production version (Session/SessionStorage auth)
- `/stocker_session/js` - Alternative with explicit CouchDB session setup (`setupRemoteDB()`)

If modifying database auth, update BOTH implementations to keep them consistent.

## Known Limitations & Quirks
- No backend validation (relies on frontend PouchDB + CouchDB permissions)
- Email export requires Google Drive API key (not in repo)
- No user password change functionality (hardcoded in login.js)
- Bobines export uses XLSX but other services use CSV
- Excel import file path hardcoded (must be in app directory or CDN)
