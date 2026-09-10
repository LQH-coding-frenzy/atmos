# Worker Request Analytics

OBS-007 writes one bounded Workers Analytics Engine point after each handled HTTP request. Writes are synchronous API calls but non-blocking at the platform boundary; a write exception is contained and cannot replace the application response.

## Dataset Contract

Production uses `atmos_worker_requests`. Staging uses `atmos_worker_requests_staging` so test traffic cannot alter release gates.

| Position  | Value                                 | Bound                                                     |
| --------- | ------------------------------------- | --------------------------------------------------------- |
| `index1`  | Cloudflare Worker version ID          | provider metadata, safe characters, 64 characters maximum |
| `blob1`   | 12-character Git release ID           | lowercase hexadecimal or `unknown`                        |
| `blob2`   | normalized route group                | fixed application enum                                    |
| `blob3`   | response status class                 | `1xx` through `5xx`, or `unknown`                         |
| `blob4`   | cache status                          | `HIT`, `MISS`, `STALE`, or `BYPASS`                       |
| `blob5`   | selected Supabase backend release     | 12-character release, `v1`, `none`, or `unknown`          |
| `blob6`   | provider                              | fixed provider enum                                       |
| `double1` | request wall duration in milliseconds | clamped from 0 through 60,000                             |
| `double2` | server error flag                     | 0 or 1                                                    |
| `double3` | provider duration in milliseconds     | clamped from 0 through 60,000; 0 when no call occurred    |

The dataset never receives raw URLs, query strings, search text, headers, cookies, JWTs, IP addresses, request IDs, user IDs, or email addresses. Route groups are `health`, `version`, `weather_dashboard`, `notification_publish`, `api_proxy`, `preflight_other`, and `not_found`.

Worker version metadata supplies the immutable version ID and release tag. `RELEASE_ID` may override the tag only when deployment configuration intentionally provides the same canonical release identity.

OBS-008 owns sampling-aware SQL and PASS/FAIL/INSUFFICIENT_DATA decisions. It must filter exact version/release IDs and account for `_sample_interval`.
