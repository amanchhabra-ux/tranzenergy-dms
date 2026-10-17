// Roles above everyone else, shared by the browser and the API.
//
// Super User: everything an Admin can do, and the only one who may
//  - add a project,
//  - give Viewers access to a project (or take it away),
//  - add, change, remove or reset the password of an Admin or another Super User.
// Admins keep everything else (users below Admin, passwords, workflow, organisation…).
//
// Until the workspace has a Super User, Admins act as one, so nothing changes on deploy;
// an Admin may then make themselves Super User once (Admin panel → Users).
export const SUPER_ROLE = 'Super User';
export const ADMIN_ROLE = 'Admin';
export const VIEWER_ROLE = 'Viewer';

/** Admin or Super User: sees every project and has the Admin panel. */
export const isAdminRole = (role) => role === ADMIN_ROLE || role === SUPER_ROLE;

/** Does the workspace have a Super User yet? */
export const hasSuperUser = (users) => (users || []).some(u => u?.role === SUPER_ROLE);

/**
 * May this user do Super User things? A Super User always; an Admin only while the workspace
 * has no Super User (`adminByEmail`: an admin listed in ADMIN_EMAILS without a role).
 */
export function actsAsSuper(user, users, { adminByEmail = false } = {}) {
  if (user?.role === SUPER_ROLE) return true;
  return (user?.role === ADMIN_ROLE || adminByEmail) && !hasSuperUser(users);
}
