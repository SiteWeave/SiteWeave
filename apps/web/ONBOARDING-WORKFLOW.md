# SiteWeave Onboarding Workflow Guide

## The Construction Industry B2B Onboarding Experience

This guide explains the **exact workflow** for onboarding a new construction company client to SiteWeave. This is designed to give the client owner **immediate control** over their company's security and team management.

---

## Step 1: The "Handshake" (You & Owner)

### The Scenario
You sit down with the owner. You open your laptop (or an iPad).

### Action
You **don't** ask him to register. You log into your **Super Admin Dashboard** and click **"New Organization"**.

### Input
You type his:
- **Company Name** (e.g., "Miller Construction")
- **Owner Name** (e.g., "John Miller")
- **Owner Email** (e.g., "john@miller.com")

### System Event
The database:
1. Creates `Organization ID: 101`
2. Creates the first User Profile for him linked to `organization_id: 101`
3. Creates a default **Org Admin** role with full permissions (aligned with `create-org-admin`)
4. Sends an invitation email to the owner
5. Generates a **"One-Time Setup Link"**

### The Handoff
The system generates a setup link. You hand the iPad to him:

> **"Here, you're the owner. Click this link to set your password."**

### Technical Implementation

**Super Admin Dashboard**: `/admin/super`

```javascript
// SuperAdminDashboard.jsx
const handleCreateOrganization = async (e) => {
  // 1. Create organization
  const { data: org } = await supabaseClient
    .from('organizations')
    .insert({ name: companyName, slug: slug })
    .select()
    .single();

  // 2. Create Org Admin role (see create-organization edge function)
  const { data: adminRole } = await supabaseClient
    .from('roles')
    .insert({
      organization_id: org.id,
      name: 'Org Admin',
      permissions: { can_manage_users: true, can_manage_roles: true, ... }
    })
    .select()
    .single();

  // 3. Create contact for owner
  const { data: ownerContact } = await supabaseClient
    .from('contacts')
    .insert({
      name: ownerName,
      email: ownerEmail,
      type: 'Team',
      role: 'Owner',
      organization_id: org.id
    })
    .select()
    .single();

  // 4. Send invitation
  const invitationToken = generateInvitationToken();
  await supabaseClient
    .from('invitations')
    .insert({
      email: ownerEmail,
      organization_id: org.id,
      role_id: adminRole.id,
      invitation_token: invitationToken,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

  // 5. Generate setup link
  const setupUrl = `${window.location.origin}/invite/${invitationToken}`;
  // Display this to the consultant
};
```

---

## Step 2: The "Power" Move (Defining Roles)

### The Scenario
He logs in using the setup link, sets his password, and the dashboard loads.

### Action
He goes to **Settings > Roles**.

### The Pitch
You say:

> **"You define who does what. Not me."**

### Workflow

1. He clicks **"Create Role"** → Names it **"Foreman"**
2. He sees a list of checkboxes (the **Permissions JSON**):
   - ✅ Can Create Projects
   - ✅ Can View Budget
   - ❌ Can Delete Projects
3. He creates another role: **"Laborer"** (View Tasks Only)

### Why This Wins
He feels **in control** of his company's security immediately.

### Technical Implementation

**Role Management Component**: `RoleManagement.jsx`

```javascript
// RoleManagement.jsx
const handleCreateRole = async (e) => {
  e.preventDefault();
  
  const { data, error } = await supabaseClient
    .from('roles')
    .insert({
      organization_id: currentOrganization.id,
      name: roleName,
      permissions: {
        can_create_projects: permissions.can_create_projects,
        can_view_budget: permissions.can_view_budget,
        can_delete_projects: permissions.can_delete_projects,
        can_create_tasks: permissions.can_create_tasks,
        can_edit_tasks: permissions.can_edit_tasks,
        can_delete_tasks: permissions.can_delete_tasks,
        can_view_financials: permissions.can_view_financials,
        can_manage_users: permissions.can_manage_users,
        can_manage_roles: permissions.can_manage_roles,
        can_assign_tasks: permissions.can_assign_tasks,
        can_view_reports: permissions.can_view_reports,
        can_manage_contacts: permissions.can_manage_contacts
      }
    })
    .select()
    .single();
};
```

**Database Schema**:

```sql
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{}',
  is_system_role BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

---

## Step 3: The "Roster" (Adding the Team)

### The Scenario
This is where he expects you to "build the accounts."

### Action
He goes to **Team > Add Members**.

### Input
He types a list of emails (or pastes a CSV) and selects a **Role** for each:
- `mike@miller.com` → **Foreman**
- `steve@miller.com` → **Laborer**

### Technical Reality (The Correction)
He does **NOT** set their passwords.

### The System
1. Creates a **"Pending Invitation"** in the database
2. Sends an email to Mike and Steve:

> **"Miller Construction has invited you to SiteWeave. Click here to join."**

### Why This Is Better
It shifts the **liability**. If Mike chooses a weak password, that's on Mike, not the Owner (or you).

### Technical Implementation

**User Management Component**: `UserManagement.jsx`

```javascript
// UserManagementService.js
export const inviteUser = async (supabaseClient, organizationId, email, roleId, invitedByUserId) => {
  // 1. Create contact
  const { data: contact, error: contactError } = await supabaseClient
    .from('contacts')
    .insert({
      email: email.toLowerCase(),
      name: email.split('@')[0],
      type: 'Team',
      organization_id: organizationId
    })
    .select()
    .single();

  // 2. Create invitation
  const invitationToken = generateInvitationToken();
  const { data: invitation, error: invitationError } = await supabaseClient
    .from('invitations')
    .insert({
      email: email.toLowerCase(),
      organization_id: organizationId,
      role_id: roleId,
      invited_by_user_id: invitedByUserId,
      invitation_token: invitationToken,
      status: 'pending',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    })
    .select()
    .single();

  // 3. Send invitation email (via Supabase Edge Function or Resend)
  const inviteUrl = `${window.location.origin}/invite/${invitationToken}`;
  await sendInvitationEmail(email, inviteUrl, organizationName);

  return invitation;
};
```

**Invitation Acceptance Flow**: `/invite/:token`

```javascript
// InviteAcceptPage.jsx
const handleAcceptInvitation = async (e) => {
  e.preventDefault();
  
  // 1. Sign up the user
  const { data: authData, error: signUpError } = await supabaseClient.auth.signUp({
    email: invitation.email,
    password: password,
    options: {
      data: {
        invitation_token: token,
        organization_id: invitation.organization_id,
        role_id: invitation.role_id
      }
    }
  });

  // 2. Update invitation status
  await supabaseClient
    .from('invitations')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', invitation.id);

  // 3. Update user profile
  await supabaseClient
    .from('profiles')
    .update({
      organization_id: invitation.organization_id,
      role_id: invitation.role_id
    })
    .eq('id', authData.user.id);

  // 4. Navigate to dashboard
  navigate('/');
};
```

---

## Step 4: The Result (Instant Directory)

### The Scenario
Mike (the Foreman) gets the email, clicks the link, sets his password, and downloads the app.

### The "Magic" Moment
When Mike logs in, he **doesn't see a blank screen**.

He is automatically inside **"Miller Construction"**.

He clicks **"Team"** and automatically sees:
- **John Miller** (Owner)
- **Steve** (Laborer)

### Your "Pre-added" Point
You are **exactly right** here. Because they share an `organization_id`, the **"Company Directory"** is auto-populated. No one has to add each other as friends.

### Technical Implementation

**Team Directory Component**: `TeamDirectory.jsx`

```javascript
// TeamDirectory.jsx
const loadTeamMembers = async () => {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select(`
      id,
      created_at,
      contacts (
        id,
        name,
        email,
        role,
        phone,
        avatar_url,
        status
      ),
      roles (
        name
      )
    `)
    .eq('organization_id', currentOrganization.id)
    .order('created_at', { ascending: true });

  setTeamMembers(data || []);
};
```

**Database RLS Policy**:

```sql
-- Profiles: Users can see all profiles in their organization
CREATE POLICY "Users can view profiles in their organization"
ON profiles FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  )
);
```

---

## Key Technical Features

### 1. **Data Isolation**
Every table has an `organization_id` column. RLS policies ensure users only see data from their organization.

### 2. **Dynamic Roles**
Roles are stored in the `roles` table with a `permissions` JSONB column. Organization Admins can create custom roles.

### 3. **Guest Access**
The `project_collaborators` table allows users from other organizations to access specific projects (for subcontractors).

### 4. **Invitation Flow**
- Invitations are stored in the `invitations` table
- Users receive an email with a setup link
- They set their own password
- They are automatically linked to the organization

### 5. **Auto-populated Directory**
All users in the same organization automatically see each other in the Team Directory.

---

## User Experience Summary

| Step | User Action | System Response |
|------|-------------|-----------------|
| **1. Handshake** | Consultant creates organization | Setup link generated |
| **2. Power Move** | Owner defines roles | Custom permissions stored |
| **3. Roster** | Owner invites team | Invitation emails sent |
| **4. Instant Directory** | Team members log in | Auto-populated team view |

---

## Routes & Components

| Route | Component | Purpose |
|-------|-----------|---------|
| `/admin/super` | `SuperAdminDashboard` | Consultant creates organizations |
| `/invite/:token` | `InviteAcceptPage` | New users set password |
| `/team` | `TeamDirectory` | View all team members |
| `/settings/roles` | `RoleManagement` | Create/edit roles |
| `/settings/users` | `UserManagement` | Invite/manage team |

---

## Next Steps

1. **Deploy the schema**: Run `../../schema.sql` in Supabase SQL Editor
2. **Seed demo account**: Run `scripts/seed-demo-account.sql`
3. **Test the workflow**:
   - Log in as Super Admin
   - Create a test organization
   - Accept the invitation
   - Create roles
   - Invite team members
   - Verify Team Directory

---

## Conclusion

This workflow gives construction company owners **immediate control** over their team's security and access, while shifting password liability to individual users. The "Instant Directory" feature eliminates the need for manual friend requests, creating a seamless team experience.

**The magic**: Everyone shares an `organization_id`, so they're automatically connected.
