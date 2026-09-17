"use client";

import { MyProfileCard } from "@/components/profile/MyProfileCard";

// Staff/manager's own profile — the Admin Panel (`/admin`) covers this same "My Profile" card too,
// but that whole page is admin-only (redirects everyone else to /dashboard), so non-admin roles had
// no page at all to change their own name/email/password despite the underlying API supporting it.
// This page + admin/page.tsx both render the same shared MyProfileCard rather than duplicating it.
export default function ProfilePage() {
  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Profile</h1>
          <p className="page-sub">Manage your name, login email, and password</p>
        </div>
      </div>
      <MyProfileCard sectionIndex={0} />
    </div>
  );
}
