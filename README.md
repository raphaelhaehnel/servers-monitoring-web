# FacIT — Infrastructure Server Monitor

A self-hosted dashboard for managing test servers in a team environment. Built for developers who spend too much time pinging colleagues and ask "is server X free?"

<img width="1898" height="912" alt="facit ui" src="https://github.com/user-attachments/assets/8f56bdfa-703c-4887-a4af-7fc1e588c286" />


---

## What it does

FacIT keeps a live view of all your servers — what's installed on them, whether they're up, and who's currently using them. When you need a server to test your code, you open the dashboard, find an available one, and book it. Everyone else sees it's taken.

Key features:

- **Live status** — periodically polls all servers via SSH and displays component health (Active, Server Down, Invalid State)
- **Booking system** — reserve a server with your name, a comment, and an optional duration
- **Expiry warnings** — if a booking is running long, the card flags it so forgotten bookings don't block the team
- **Audit log** — every book, free, and comment change is recorded per server so you always know what happened
- **Component-aware** — understands Gateways, Microservices, and RedisWriter components, parses their specific SSH commands, and displays them cleanly
- **Filters & sorting** — filter by environment, component type, status, app name, or booking state; sort by any field
- **Authentication** — read-only for anyone, write access requires credentials
---

## Stack

**Backend** — Python 3.10 with FastAPI. Serves a REST API, runs SSH polls on a background scheduler, and persists everything to a JSON file (backed by a PVC when deployed on OpenShift).

**Frontend** — React 18 with Vite. No UI framework, just plain CSS with custom properties. Talks to the backend via a thin API client.

---

## Running locally

You'll need Python 3.10+ and Node 20+.

**Backend**

```bash
cd server-monitor/backend
pip install -r requirements.txt

# The backend runs in mock SSH mode by default — no real servers needed
uvicorn app.main:app --reload
```

The API will be at `http://localhost:8000`. You can explore all endpoints at `http://localhost:8000/docs`.

**Frontend**

```bash
cd server-monitor/frontend
npm install
npm run dev
```

Open `http://localhost:3000`. The Vite dev server proxies `/api` and `/auth` to the backend automatically.

**Default credentials**

```
username: redis
password: redis123
```

Change these before deploying anywhere (see Configuration below).

---

## Configuration

Everything is controlled through environment variables. Copy `.env.example` to `.env` and adjust.

| Variable | Default | Description |
|---|---|---|
| `DATA_DIR` | `./data` | Where `servers.json` is stored. Point this at your PVC mount on OpenShift. |
| `SSH_MOCK_MODE` | `true` | Set to `false` to connect to real servers |
| `SSH_USERNAME` | `root` | SSH login user |
| `SSH_PASSWORD` | _(empty)_ | SSH password (prefer key auth) |
| `SSH_KEY_PATH` | _(empty)_ | Path to a PEM private key file |
| `SSH_PORT` | `22` | SSH port |
| `POLL_INTERVAL_SECONDS` | `300` | How often all servers are polled in the background |
| `AUTH_USERNAME` | `redis` | Dashboard login username |
| `AUTH_PASSWORD` | `redis123` | Dashboard login password |
| `AUTH_TOKEN_TTL` | `28800` | Session duration in seconds (8 hours). Set to `0` to disable expiry. |

---

## Project structure

```
server-monitor/
├── app/
│   ├── main.py           # FastAPI app, auth endpoints, lifespan
│   ├── config.py         # All configuration from env vars
│   ├── models.py         # Pydantic types — ServerInfo, AuditEntry, etc.
│   ├── routes.py         # REST endpoints (/api/v1/servers/...)
│   ├── server_service.py # Business logic — booking, polling, audit log
│   ├── storage.py        # Thread-safe JSON persistence
│   ├── ssh_client.py     # SSH abstraction with mock and real modes
│   ├── parsers.py        # Component-type handlers (Strategy pattern)
│   ├── auth.py           # Token-based session management
│   └── scheduler.py      # Background SSH polling with APScheduler
├── frontend/
│   └── src/
│       ├── App.jsx
│       ├── api/client.js
│       ├── hooks/          # useAuth, useToast, useAutoRefresh
│       └── components/     # Header, ServerCard, Modals, FilterSortBar, …
└── openshift/
    └── deployment.yaml   # PVC + ConfigMap + Secret + Deployment + Route
```

---

## Adding a new component type

The SSH parsing uses a Strategy pattern — each component type is one class. To add support for a new type:

1. Create a subclass of `ComponentHandler` in `app/parsers.py`
2. Add it to the `_HANDLERS` list

That's it. The service layer, routes, storage, and frontend all pick it up automatically.

```python
class MyNewHandler(ComponentHandler):
    @property
    def component_type(self) -> str:
        return "MyNewType"          # must match what appears after "Interfaces:" in Status output

    def extra_ssh_command(self) -> Optional[str]:
        return "my_command"         # or None if Status is enough

    def parse_extra_output(self, raw: str) -> list[str]:
        # return a list of display strings
        return [line.split(",")[0] for line in raw.strip().splitlines() if line]
```

---

## Deploying on OpenShift

Build the image, push it to your internal registry, then apply the manifests:

```bash
oc apply -f openshift/deployment.yaml
```

Before applying, edit `openshift/deployment.yaml` and:
- Replace `<your-namespace>` in the image reference
- Set `AUTH_USERNAME` and `AUTH_PASSWORD` in the Secret to something other than the defaults
- Set `SSH_MOCK_MODE` to `"false"` and configure SSH credentials

The manifest creates a PVC for data persistence, a ConfigMap for non-sensitive settings, a Secret for credentials, and an edge-terminated Route for HTTPS access.

---

## DNS naming convention

Servers are expected to follow this format:

```
<system>-<environment>-<name>-<number>
```

Example: `google-prod1-redis-1` → environment is automatically extracted as `prod1`. If a server doesn't follow this convention, the environment field will be empty.

---

## License

MIT — do whatever you want with it.

---

*Built by [Raphael Haehnel](https://github.com/raphaelhaehnel)*
