# Moderation Features Implementation

This document describes the implementation of content reporting, user blocking, and Terms of Service features for the SiteWeave mobile app, as required by Apple App Store Review Guidelines.

## Features Implemented

### 1. Content Reporting System ✅

**Database Schema:**
- Created `content_reports` table to track reported content
- Supports reporting messages, profiles, projects, tasks, comments, and files
- Report reasons: spam, harassment, inappropriate, violence, hate_speech, other
- Status tracking: pending, reviewed, resolved, dismissed

**Backend Services:**
- `reportContent()` - Submit a content report
- `getContentReports()` - Fetch reports (platform developers only)
- `updateReportStatus()` - Update report status (platform developers only)
- `canAccessContentReports(profile)` - UI guard; requires `profiles.is_super_admin`

**Access control (platform developer vs org admin):**

| Role | `profiles.role` / org role | `is_super_admin` | Content Reports |
|------|---------------------------|------------------|-----------------|
| Organization admin | Admin / Org Admin | false | Hidden; RLS blocks global queue |
| Platform developer | any | true | Full access |
| Regular user | Team, etc. | false | Can submit reports only |

Grant platform developer access (Supabase SQL editor):

```sql
UPDATE public.profiles
SET is_super_admin = true
WHERE id = '<your-auth-user-uuid>';
```

Apply RLS migration: `supabase/migrations/20260618120000_content_reports_platform_developer_only.sql`

**UI Components:**
- `ReportContentModal` - Modal for reporting content with reason selection
- Long-press on messages in Messages screen to report
- Admin dashboard (`/admin-reports`) to view and manage reports

**Location:** 
- Database: `schema-moderation-features.sql`
- Service: `packages/core-logic/src/services/moderationService.js`
- Component: `apps/mobile/components/ReportContentModal.jsx`
- Admin Screen: `apps/mobile/app/admin-reports.js`

### 2. User Blocking System ✅

**Database Schema:**
- Created `blocked_users` table to track user blocks
- Prevents users from blocking themselves
- Unique constraint on blocker/blocked pair

**Backend Services:**
- `blockUser()` - Block a user
- `unblockUser()` - Unblock a user
- `getBlockedUsers()` - Get list of blocked user IDs
- `isUserBlocked()` - Check if a user is blocked
- `filterBlockedMessages()` - Filter messages from blocked users

**UI Components:**
- Blocked Users management screen (`/blocked-users`)
- Messages automatically filtered to exclude blocked users
- Link in ProfileDrawer to manage blocked users

**Location:**
- Database: `schema-moderation-features.sql`
- Service: `packages/core-logic/src/services/moderationService.js`
- Screen: `apps/mobile/app/blocked-users.js`
- Messages filtering: `packages/core-logic/src/services/messagesService.js`

### 3. Terms of Service ✅

**Database Schema:**
- Created `terms_of_service_acceptances` table
- Tracks version, acceptance timestamp, IP address, and user agent
- Unique constraint on user_id and version

**Backend Services:**
- `acceptTermsOfService()` - Accept ToS for a user
- `hasAcceptedTermsOfService()` - Check if user has accepted
- `getLatestTermsAcceptance()` - Get latest acceptance record

**UI Components:**
- Terms of Service screen (`/terms-of-service`)
- Shows current ToS text
- Accept button with acceptance tracking
- Link in ProfileDrawer

**Location:**
- Database: `schema-moderation-features.sql`
- Service: `packages/core-logic/src/services/moderationService.js`
- Screen: `apps/mobile/app/terms-of-service.js`

### 4. Admin Dashboard ✅

**Features:**
- View all content reports
- Filter by status (all, pending, resolved, dismissed)
- Update report status
- View report details (reason, reporter, reported user, description)
- Pull-to-refresh functionality

**Location:**
- Screen: `apps/mobile/app/admin-reports.js`
- Accessible from ProfileDrawer for Admin users only

## Database Setup

To set up the database tables, run the SQL script:

```sql
-- Run this in Supabase SQL Editor
-- File: schema-moderation-features.sql
```

This script creates:
1. `content_reports` table with RLS policies
2. `blocked_users` table with RLS policies
3. `terms_of_service_acceptances` table with RLS policies
4. Helper functions for checking blocked users and ToS acceptance
5. Indexes for performance

## Row Level Security (RLS)

All tables have RLS enabled with appropriate policies:

- **Content Reports**: Users can see their own reports, Admins can see all
- **Blocked Users**: Users can only see/manage their own blocks
- **Terms of Service**: Users can see their own acceptances, Admins can see all

## User Flows

### Reporting Content
1. User long-presses on a message in Messages screen
2. Report modal appears
3. User selects reason and optionally adds description
4. Report is submitted and stored in database
5. Admin can review and take action

### Blocking Users
1. User navigates to ProfileDrawer → Blocked Users
2. View list of currently blocked users
3. Unblock users if needed
4. Blocked users' messages are automatically filtered out

### Accepting Terms of Service
1. User navigates to ProfileDrawer → Terms of Service
2. Reads the terms
3. Clicks "Accept Terms of Service"
4. Acceptance is recorded with version and timestamp

### Admin Reviewing Reports
1. Admin navigates to ProfileDrawer → Content Reports
2. Views all reports, filtered by status
3. Updates report status (reviewed, resolved, dismissed)
4. System tracks who reviewed and when

## Integration Points

### Messages Screen
- Long-press on messages to report
- Messages from blocked users are automatically hidden
- Uses `filterBlockedMessages()` service

### ProfileDrawer
- Added "Blocked Users" menu item
- Added "Terms of Service" menu item
- Added "Content Reports" menu item (Admin only)

### Core Logic Package
- Exported moderation services from `packages/core-logic/src/index.js`
- Updated messages service to filter blocked users

## Apple App Store Compliance

These features address the following App Store Review Guidelines:

✅ **Guideline 3.1.2** - Allow users to report offensive content
✅ **Guideline 3.1.2** - Have a system to monitor reported content (Admin dashboard)
✅ **Guideline 3.1.2** - Allow users to block other users
✅ **Guideline 5.1.1** - Terms of Service available and trackable

## Testing Checklist

- [ ] Test reporting a message
- [ ] Test blocking a user
- [ ] Test that blocked users' messages don't appear
- [ ] Test unblocking a user
- [ ] Test accepting Terms of Service
- [ ] Test admin viewing reports
- [ ] Test admin updating report status
- [ ] Test RLS policies (users can't see others' reports/blocks)
- [ ] Test that messages are filtered correctly

## Next Steps

1. Run the database migration script in Supabase
2. Test all features in the app
3. Customize Terms of Service text as needed
4. Set up admin notifications for new reports (optional)
5. Add analytics tracking for reports and blocks (optional)

## Notes

- The ToS version is currently hardcoded to "1.0.0" in `apps/mobile/app/terms-of-service.js`
- Update this version when ToS changes to require re-acceptance
- Consider adding email notifications for admins when reports are submitted
- Consider adding in-app notifications for users when their content is reported

