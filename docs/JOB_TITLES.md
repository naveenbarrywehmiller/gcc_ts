# Job titles

The management sidebar orders Work Type, Departments, Users, Job Title, then Dedicated/Flex. Job titles describe positions and do not grant permissions.

Managers and System Admins create and rename titles. System Admins can deactivate them. Admins and Viewers can view the management page. Signed-in users can read the active choices for account forms.

| Endpoint | Request | Response |
| --- | --- | --- |
| `GET /api/job-titles` | None | `{ jobTitles: [{ id, name, active, created_at }] }`, active titles sorted by name |
| `POST /api/job-titles` | `{ name }` | `201 { jobTitle }` |
| `PUT /api/job-titles/:id` | `{ name }` | `200 { jobTitle }` |
| `DELETE /api/job-titles/:id` | None | `200 { message }`, deactivates the choice |

Names are trimmed, 1–100 characters, and unique without regard to case. Invalid names return `400`, duplicates `409`, and unknown or inactive update targets `404`. Writes use the existing catalog permissions and audit log.

User creation requires `job_title_id`, a positive integer or numeric ID string referencing an active title. User profile updates require an assigned title and reject empty or invalid values. Partial updates may omit the field if the user already has a title. An existing inactive title can be retained, but cannot be newly assigned. Profile, directory, password login, Microsoft login, and `/api/auth/me` responses include `job_title_id` and `job_title_name`. The dashboard displays the title from the authenticated profile; a new login or reload picks up changes made by another administrator.

Startup creates the catalog and nullable foreign key without guessing positions for existing accounts or changing their access. Existing accounts show `Not assigned`; their next profile save requires a title. Bootstrap and Microsoft account provisioning can also initially leave the position unassigned for an administrator to complete. Deactivation retains assigned names; permanent user anonymization clears the title reference.
