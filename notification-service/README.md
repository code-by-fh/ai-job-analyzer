# Notification Service

Standalone HTTP service that holds every notification channel and all sending logic of the AI Job
Agent (Pushover, Resend, Mailjet, SMTP). Each calling app authenticates with its own API key and sees
only its own channels; inside an app, channels belong to an opaque `owner` string the app passes
(the job agent passes its user id).

Python 3.11, FastAPI, SQLAlchemy on a SQLite file, Fernet encryption at rest.

## Quick start (compose)

1. In the repository's `.env`, set `NOTIFY_API_KEY` and `NOTIFY_ENCRYPTION_KEY` (see
   [Generating the keys](#generating-the-keys)).
2. `docker compose up -d --build ai-job-agent-notify`

The compose service `ai-job-agent-notify` publishes no host port. The server reaches it at
`http://ai-job-agent-notify:8000` over the `notify` network (`internal: true`, joined only by the
server and the service); the service alone also joins `notify_egress` to reach the providers.

## Generating the keys

The two keys have different formats and different jobs. Generate each one separately and never use
the same value for both.

| Variable | Format | Purpose |
|---|---|---|
| `NOTIFY_API_KEY` | any 32-256 characters of `A-Z a-z 0-9 . _ ~ + / = -` | authenticates the server at the service |
| `NOTIFY_ENCRYPTION_KEY` | a Fernet key: 32 random bytes, URL-safe base64, 44 characters ending in `=` | encrypts the stored channel settings |

```bash
# NOTIFY_API_KEY
python -c "import secrets; print(secrets.token_urlsafe(48))"
# NOTIFY_ENCRYPTION_KEY (needs the cryptography package)
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# without a local cryptography package, run it in the service image:
docker compose run --rm --no-deps ai-job-agent-notify \
  python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

A 32-character string such as a password is **not** a Fernet key. The service then refuses to start
with `NOTIFY_ENCRYPTION_KEY must be a Fernet key (32 url-safe base64-encoded bytes)`.

Store `NOTIFY_ENCRYPTION_KEY` safely, for example in a password manager. If it is lost or changed
without a [key rotation](#key-rotation), every stored channel becomes unreadable and has to be set up
again. Compose builds the service-side `NOTIFY_API_KEYS` from `NOTIFY_API_KEY`
(`ai-job-agent:<key>`), so you do not set it yourself.

## Local development

```bash
cd notification-service
python3.11 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
python -m pytest
export NOTIFY_API_KEYS="job-agent:$(python -c 'import secrets; print(secrets.token_urlsafe(48))')"
export NOTIFY_ENCRYPTION_KEY="$(python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')"
export NOTIFY_DATABASE_PATH=./notify.sqlite3
uvicorn app.main:create_app --factory --port 8000 --reload
```

`docker-compose.dev.yml` mounts `app/` read-only into the container and runs uvicorn with `--reload`.

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NOTIFY_API_KEYS` | yes | none | Comma-separated `app_id:key` pairs. `app_id`: 1-64 of `a-z 0-9 _ -`, starting with a letter or digit. Key: 32-256 of `A-Z a-z 0-9 . _ ~ + / = -`, unique per app. Compose sets it to `ai-job-agent:${NOTIFY_API_KEY}`. |
| `NOTIFY_ENCRYPTION_KEY` | yes | none | Fernet key that encrypts every stored channel field. Losing it makes all stored channels unreadable; change it only through a rotation (below). |
| `NOTIFY_ENCRYPTION_KEY_OLD` | no | none | The previous key during a rotation: still decrypts, never encrypts. |
| `NOTIFY_DATABASE_PATH` | no | `/data/notifications.sqlite3` | SQLite file; its directory must exist and be writable. |

The process refuses to start when `NOTIFY_API_KEYS` is unset, empty or malformed, when a key is shorter
than 32 characters or shared by two apps, and when `NOTIFY_ENCRYPTION_KEY` is missing or invalid. Error
messages name the variable, never a value.

## Key rotation

1. Generate a new key and set it as `NOTIFY_ENCRYPTION_KEY`; move the current key to
   `NOTIFY_ENCRYPTION_KEY_OLD`.
2. Restart the service. With an old key set, startup re-encrypts every channel with the new key
   (log line "Re-encrypted N channel(s)"); a channel neither key opens stops the start.
3. Remove `NOTIFY_ENCRYPTION_KEY_OLD` and restart again.

## Operation notes

- **One process.** Rate limits are kept in memory and SQLite takes one writer, so run a single uvicorn
  worker (the Dockerfile does). Scaling out needs a shared limiter and another database.
- **Schema.** v1 creates its one table on startup (`create_all`). The first schema change must
  introduce a migration tool (Alembic) before it ships.
- **Container.** Non-root user `10001`, read-only root filesystem, `/data` the only writable path,
  all capabilities dropped, `no-new-privileges`, healthcheck on `GET /health`. The SQLite file is
  created (or narrowed) to mode 0600 at startup.
- **Logs.** UTC timestamps; channel ids, types, counts, HTTP status codes and exception type names
  only. Never recipients, keys, passwords or provider answer text.

## API (v1)

All routes except `GET /health` require `Authorization: Bearer <key>`. Authentication runs before
routing and before the body is read: without a valid key every request, including an unknown path or
malformed JSON, answers 401. Any connection other than HTTP (a WebSocket handshake) is refused
(close code 1008). Request bodies are capped at 1 MiB (413). Requests reject unknown keys.

### Error envelope

```json
{"error": {"code": "VALIDATION_ERROR", "message": "Request validation failed", "traceId": "3f2c...",
           "fields": [{"field": "fields.host", "message": "must resolve to public addresses"}]}}
```

`fields` appears only on 422. Messages are fixed texts; input values (and so secrets) are never echoed.

| Status | `code` | When |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | Missing, malformed or unknown key (`WWW-Authenticate: Bearer`) |
| 404 | `NOT_FOUND` | Unknown path, or a channel outside the caller's app and owner |
| 405 | `METHOD_NOT_ALLOWED` | Wrong method on a known path |
| 409 | `CHANNEL_LIMIT_REACHED` | The owner already has 20 channels |
| 413 | `PAYLOAD_TOO_LARGE` | Body above 1 MiB |
| 422 | `VALIDATION_ERROR` | Invalid request, per-field details |
| 429 | `RATE_LIMITED` | Rate limit hit, `Retry-After` in seconds |
| 500 | `INTERNAL_ERROR` | Unexpected; logged with stack trace and the same `traceId` |

### `GET /health`

No key. `200 {"status": "ok"}`.

### `GET /v1/openapi.json`

The generated OpenAPI description.

### `GET /v1/channel-types`

```json
{"items": [{"id": "smtp", "label": {"de": "E-Mail (SMTP)", "en": "Email (SMTP)"},
            "fields": [{"name": "host", "label": {"de": "SMTP-Server", "en": "SMTP server"}, "kind": "host",
                        "required": true, "secret": false, "max_length": 253, "max_items": null, "default": null}, ...]}]}
```

Field kinds: `token` (printable ASCII, no spaces), `text` (no control characters), `ascii_text`
(printable ASCII, spaces allowed; SMTP credentials, which smtplib sends as ASCII), `email`,
`email_list` (1 to `max_items` addresses), `host` (ASCII host name or IP literal, must resolve to
public addresses), `port` (integer 1-65535).

| Type | Fields (secret in bold; all required unless noted) |
| --- | --- |
| `pushover` | **`api_token`** (100), **`user_key`** (100, the recipient) |
| `resend` | **`api_key`** (200), `from_email`, `recipients` (max 50) |
| `mailjet` | **`api_key`** (200), **`secret_key`** (200), `from_email`, `recipients` (max 50) |
| `smtp` | `host` (253), `port` (optional, default 587, STARTTLS), `username` (254), **`password`** (256), `from_email`, `recipients` (max 50) |

### Channels

`owner`: 1-128 characters of `A-Z a-z 0-9 . _ : @ -`. Every channel route needs it (query parameter,
or body field on create); a channel of another owner or another app is a 404.

- `POST /v1/channels` body `{"owner", "type", "name" (1-100, one line), "fields": {...}}`
  -> `201` with `Location: /v1/channels/{id}` and the channel.
- `GET /v1/channels?owner=&limit=50&offset=0` (`limit` 1-100) -> `{"items": [...], "total", "limit", "offset"}`, oldest first.
- `GET /v1/channels/{id}?owner=` -> the channel.
- `PATCH /v1/channels/{id}?owner=` body `{"name"?, "fields"?: {...}}`: an omitted field stays (secrets
  included), `null` clears an optional field (a required one answers 422 `required`). Type and owner
  cannot change. -> `200` with the channel.
- `DELETE /v1/channels/{id}?owner=` -> `204`.

A channel in a response:

```json
{"id": "6f1c...", "type": "resend", "name": "Mail", "owner": "42",
 "fields": {"from_email": "jobs@example.com", "recipients": ["me@example.com"]},
 "secrets": {"api_key": "set"}, "created_at": "2026-10-16T08:00:00Z", "updated_at": "2026-10-16T08:00:00Z"}
```

Secret values are write-only: they appear only as `"set"` / `"not set"`. All field values, secret or
not, are stored as one Fernet token per channel. An SMTP host is resolved on create/update (and again
before each send); any loopback, private, link-local, CGNAT, multicast, reserved or metadata address
answers 422 `must resolve to public addresses`.

### `POST /v1/channels/{id}/test?owner=`

Sends a fixed test message to the channel's default recipients. Limits: 5 per minute per app and
owner, and 20 per minute per app across all owners (429). -> `200 {"channel_id", "delivered": true|false, "reason": null|"<reason>"}`.

### `POST /v1/notifications`

Limit: 120 per minute per app (429).

```json
{"owner": "42",
 "channel_ids": ["6f1c..."],
 "subject": "Hallo", "body": "Plain text",
 "recipients": ["someone@example.com"]}
```

or, instead of `body`, a job digest template (`subject` then optional, default
`[Job Agent] N neue(r) Job-Match(es) von <platform_name>`):

```json
{"owner": "42",
 "template": {"name": "job_digest",
              "html": "<p>Hi $userName</p>{{#jobs}}<a href=\"$url\">$title</a>{{/jobs}}",
              "push_text": "$title @ $company",
              "variables": {"user_name": "Ann", "platform_name": "Board",
                            "jobs": [{"title": "Engineer", "company": "Acme", "match_score": 80,
                                      "reasoning": "Fits.", "url": "https://example.com/1"}]}}}
```

- `channel_ids` (max 20, optional): omitted or empty means every channel of the owner. One unknown id
  is a 404 and nothing is sent.
- `recipients` (1-50 addresses, optional) replace an e-mail channel's default list; Pushover ignores them.
- Bounds: `subject` 250 (one line), `body` 10000, `html` 100000, `push_text` 2000, `jobs` 1-100,
  job `title`/`company` 300, `reasoning` 5000, `url` 2048, `match_score` 0-100, `user_name` 100,
  `platform_name` 200 (one line).
- Plain notifications go out as text mail; the digest as HTML mail (custom `html`, or the built-in
  layout) and, on Pushover, as one push per job (`push_text`, or the built-in line). Job fields, user
  and source names are HTML-escaped, links are `http(s)` only, variables are substituted in one pass.

-> `200 {"results": [{"channel_id", "delivered", "reason"}]}`, one entry per channel in creation order.

### `POST /v1/previews`

Renders a job digest exactly as `POST /v1/notifications` would and sends nothing. Body
`{"template": {...}}` with the same `job_digest` template and bounds as above.
-> `200 {"subject", "html", "push_text"}` (`push_text` is the first job's push message). The HTML is
the template author's markup with escaped job text: a client shows it only in a sandboxed frame.

### Delivery reasons

`auth_rejected` (HTTP 401/403, SMTP auth), `rejected` (other 4xx, SMTP sender/recipient/data
refused, a stored credential smtplib cannot encode), `unreachable` (connection, DNS, disconnect), `timeout`, `tls_failed` (SMTP without
STARTTLS or with an invalid certificate), `host_not_public` (SMTP host now resolves to a non-public
address), `failed` (anything else, unexpected errors logged with stack trace).
