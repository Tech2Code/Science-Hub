# Requirements Document

## Introduction

Science Hub requires a granular access control system for sensitive financial dashboard sections. Currently, only a binary admin/non-admin check exists (hiding "Admin" and "Settings" nav items from non-admin users). This feature introduces section-level permissions that allow the Admin to selectively grant or revoke access to financial sections (Sales Overview, Purchase Overview, Reports, Payments, and the dashboard Sales & Purchases widgets) for non-staff users, while permanently blocking staff users from these sections regardless of any permission grants.

## Glossary

- **Access_Control_System**: The module responsible for evaluating and enforcing section-level access permissions across the application
- **Admin**: A user whose `role` field equals `"admin"`; has full unrestricted access to all sections and can manage permissions for other users
- **Staff**: A user whose `role` field equals `"staff"`; permanently restricted from accessing protected sections regardless of any permission settings
- **Grantable_User**: A user whose `role` field is neither `"admin"` nor `"staff"`; eligible to receive section access grants from the Admin
- **Protected_Section**: A dashboard section that requires explicit access permission; includes Sales Overview, Purchase Overview, Reports Sales, Reports Purchases, Payments Received, Payments Made, and the Dashboard Sales & Purchases widgets
- **Section_Permission**: A database record linking a specific user to a specific protected section, indicating whether access is enabled or disabled
- **Navigation_Filter**: The client-side logic in DashboardShell that determines which navigation items are visible to the current user based on their permissions
- **Dashboard_Widget_Filter**: The logic that conditionally renders the Sales KPIs, Purchases KPIs, Recent Invoices, and Recent Bills sections on the main dashboard page

## Requirements

### Requirement 1: Default Admin Access

**User Story:** As an admin, I want unrestricted access to all protected sections, so that I can always manage and monitor the full business operations.

#### Acceptance Criteria

1. THE Access_Control_System SHALL grant the Admin full access to all Protected_Sections without requiring any Section_Permission records
2. WHEN an Admin navigates to any Protected_Section route, THE Access_Control_System SHALL permit the request without performing a permission lookup
3. THE Navigation_Filter SHALL display all Protected_Section navigation items in the sidebar for the Admin
4. THE Dashboard_Widget_Filter SHALL display the Sales KPIs, Purchases KPIs, Recent Invoices, and Recent Bills sections on the dashboard page for the Admin
5. IF a Section_Permission record with enabled set to false exists for an Admin user, THEN THE Access_Control_System SHALL ignore the record and continue granting full access to all Protected_Sections

### Requirement 2: Staff Permanent Restriction

**User Story:** As a business owner, I want staff users to be permanently blocked from accessing financial sections, so that sensitive financial data is only visible to authorized personnel.

#### Acceptance Criteria

1. WHILE a user has the role "staff", THE Access_Control_System SHALL deny access to all Protected_Sections
2. WHILE a user has the role "staff", THE Navigation_Filter SHALL hide all Protected_Section navigation items from the sidebar
3. WHILE a user has the role "staff", THE Dashboard_Widget_Filter SHALL hide the Sales KPIs, Purchases KPIs, Recent Invoices, and Recent Bills sections from the dashboard page
4. IF an Admin attempts to create a Section_Permission record for a Staff user, THEN THE Access_Control_System SHALL reject the operation and not persist the record
5. IF a user's role is changed to "staff" while they have existing enabled Section_Permission records, THEN THE Access_Control_System SHALL deny access to all Protected_Sections based on the current role evaluation, regardless of existing permission records

### Requirement 3: Grantable User Default Denial

**User Story:** As a business owner, I want new non-staff users to have no access to financial sections by default, so that access is only granted intentionally.

#### Acceptance Criteria

1. IF a Grantable_User has no Section_Permission records or has no Section_Permission records with the "enabled" field set to true, THEN THE Access_Control_System SHALL deny access to all Protected_Sections
2. IF a Grantable_User has no Section_Permission records or has no Section_Permission records with the "enabled" field set to true, THEN THE Navigation_Filter SHALL hide all Protected_Section navigation items from the sidebar
3. IF a Grantable_User has no Section_Permission records or has no Section_Permission records with the "enabled" field set to true, THEN THE Dashboard_Widget_Filter SHALL hide the Sales KPIs, Purchases KPIs, Recent Invoices, and Recent Bills sections from the dashboard page
4. IF a Grantable_User with no enabled Section_Permission records attempts to navigate directly to a Protected_Section route, THEN THE Access_Control_System SHALL redirect the user to the dashboard page

### Requirement 4: Admin Grants Section Access

**User Story:** As an admin, I want to enable access to specific financial sections for individual non-staff users, so that I can delegate visibility based on job responsibilities.

#### Acceptance Criteria

1. WHEN the Admin enables a Section_Permission for a Grantable_User, THE Access_Control_System SHALL allow that user to access only the specified Protected_Section without altering access to any other Protected_Section
2. WHEN the Admin enables a Section_Permission for a Grantable_User, THE Navigation_Filter SHALL display the corresponding navigation item in the sidebar for that user on their next page request
3. WHEN the Admin enables a Section_Permission for the "Sales Overview" section, THE Dashboard_Widget_Filter SHALL display the Sales KPIs and Recent Invoices sections on the dashboard page for that user
4. WHEN the Admin enables a Section_Permission for the "Purchase Overview" section, THE Dashboard_Widget_Filter SHALL display the Purchases KPIs and Recent Bills sections on the dashboard page for that user
5. IF the Admin attempts to enable a Section_Permission for a user who is not a Grantable_User, THEN THE Access_Control_System SHALL reject the operation and display an error message indicating that permissions cannot be granted to that user

### Requirement 5: Admin Revokes Section Access

**User Story:** As an admin, I want to disable previously granted section access for a user, so that I can adjust permissions as roles change.

#### Acceptance Criteria

1. WHEN the Admin disables a Section_Permission for a Grantable_User, THE Access_Control_System SHALL deny that user access to the specified Protected_Section
2. WHEN the Admin disables a Section_Permission for a Grantable_User, THE Navigation_Filter SHALL hide the corresponding navigation item from the sidebar for that user
3. WHEN a previously granted "Sales Overview" Section_Permission is disabled, THE Dashboard_Widget_Filter SHALL hide the Sales KPIs and Recent Invoices sections from the dashboard page for that user
4. WHEN a previously granted "Purchase Overview" Section_Permission is disabled, THE Dashboard_Widget_Filter SHALL hide the Purchases KPIs and Recent Bills sections from the dashboard page for that user
5. IF a Grantable_User is currently viewing a Protected_Section when the Admin revokes their permission, THEN THE Access_Control_System SHALL deny access on the user's next server-side request to that section and redirect them to the dashboard page

### Requirement 6: Permission Management Interface

**User Story:** As an admin, I want a dedicated interface to manage section permissions per user, so that I can efficiently control access without editing database records manually.

#### Acceptance Criteria

1. THE Access_Control_System SHALL provide a permission management interface accessible only to the Admin, and IF a non-Admin user attempts to access the permission management interface, THEN THE Access_Control_System SHALL redirect the user to the dashboard page
2. THE permission management interface SHALL display a list of all Grantable_Users with their current section permissions, showing the enabled or disabled state of each Protected_Section per user
3. THE permission management interface SHALL provide toggle controls for each Protected_Section per Grantable_User, where each toggle visually indicates whether that section permission is currently enabled or disabled
4. THE permission management interface SHALL exclude Staff users from the list of manageable users
5. WHEN the Admin toggles a section permission, THE Access_Control_System SHALL persist the change within 2 seconds without requiring a separate save action
6. IF the permission management interface fails to persist a change, THEN THE Access_Control_System SHALL display an error message indicating the failure reason and revert the toggle to its previous state
7. WHEN the Access_Control_System successfully persists a permission toggle change, THE permission management interface SHALL display a confirmation message indicating the permission was updated

### Requirement 7: Server-Side Route Protection

**User Story:** As a business owner, I want protected routes to be enforced server-side, so that users cannot bypass access controls by navigating directly to a URL.

#### Acceptance Criteria

1. WHEN a Staff user or a Grantable_User without an enabled Section_Permission requests a Protected_Section page route directly, THE Access_Control_System SHALL redirect the user to the dashboard page
2. WHEN a Staff user or a Grantable_User without an enabled Section_Permission requests a Protected_Section API endpoint directly, THE Access_Control_System SHALL return a 403 Forbidden response with a body containing an error message indicating insufficient section permissions
3. IF an unauthenticated user requests a Protected_Section route or API endpoint, THEN THE Access_Control_System SHALL redirect the user to the login page
4. WHEN a user's Section_Permission is disabled by the Admin, THE Access_Control_System SHALL deny access on the user's next server-side request to that Protected_Section without requiring the user to log out and log back in
5. THE Access_Control_System SHALL evaluate the user's role and Section_Permission records on every server-side request to a Protected_Section, rather than relying solely on a cached authorization decision from initial page load

### Requirement 8: Permission Data Model

**User Story:** As a developer, I want a well-defined data model for section permissions, so that the access control system is maintainable and extensible.

#### Acceptance Criteria

1. THE Access_Control_System SHALL store Section_Permission records in a dedicated database table with a composite unique constraint on user ID and section identifier, a foreign key from user ID to the User model, and timestamp fields (createdAt, updatedAt) consistent with other models in the schema
2. THE Access_Control_System SHALL represent each Protected_Section using a string enum containing the values: "sales_overview", "purchase_overview", "reports_sales", "reports_purchases", "payments_received", "payments_made"
3. WHEN a user is deleted, THE Access_Control_System SHALL cascade-delete all associated Section_Permission records
4. THE Access_Control_System SHALL include a boolean "enabled" field in each Section_Permission record to represent the access grant state, defaulting to false when a new record is created
5. IF no Section_Permission record exists for a given user ID and section identifier pair, THEN THE Access_Control_System SHALL treat that section as inaccessible (implicit deny) for that user

### Requirement 9: Session-Based Permission Loading

**User Story:** As a user, I want my permissions to be reflected immediately after login without extra page reloads, so that the navigation accurately represents my access level.

#### Acceptance Criteria

1. WHEN a user successfully authenticates, THE Access_Control_System SHALL load the user's section permissions from the data store and embed them in the session token before returning the authentication response
2. WHILE a user session is active, THE Navigation_Filter SHALL use the session-embedded permissions to determine visible navigation items without making additional API calls on each page navigation
3. WHEN an Admin updates a user's permissions, THE Access_Control_System SHALL ensure the affected user's session reflects the new permissions within 5 minutes of the change or on their next explicit session refresh, whichever occurs first
4. IF the Access_Control_System fails to load section permissions during authentication, THEN THE Access_Control_System SHALL deny the login attempt and display an error message indicating that permissions could not be loaded
5. WHEN a user's session token contains no section permissions or the permissions payload is malformed, THE Navigation_Filter SHALL display only the default non-restricted navigation items and SHALL NOT grant access to permission-gated sections
