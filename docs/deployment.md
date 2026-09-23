# Deployment

## Overview

The production setup has four services:

    nginx  →  api (FastAPI)  →  postgres (with PostGIS)
              admin (Next.js)       redis

Only nginx is exposed to the outside. Everything else is on an
internal Docker network.

## What you need

- A Linux server (Ubuntu 22.04 or later is a good default). A small
  VPS with 2 GB RAM handles a campus pilot.
- Docker and Docker Compose installed on the server.
- A domain name pointing at the server's IP. Optional for a
  closed-network pilot.

## Deploying

### 1. Clone the repo on the server

    git clone <repo-url> /opt/campus-nav
    cd /opt/campus-nav

### 2. Create the environment file

    cp .env.example .env

Edit `.env` and set at minimum:

    POSTGRES_PASSWORD=<a long random string>
    JWT_SECRET=<a long random string>
    REDIS_PASSWORD=<a long random string>
    MEDIA_BASE_URL=https://your-domain.example

Generate the random strings with:

    python3 -c "import secrets; print(secrets.token_hex(32))"

Run that three times and paste the results in.

**Do not leave JWT_SECRET or POSTGRES_PASSWORD at their defaults.**
The compose file refuses to start if either is missing, on purpose.

### 3. Build and start

    docker compose -f docker-compose.prod.yml up -d --build

First start takes a few minutes — the Postgres image pulls, the API
image builds, and the migrations run.

### 4. Run the database migrations

The API's startup hook creates the schema on first boot, but if you
have existing data to migrate from SQLite:

    docker compose -f docker-compose.prod.yml exec api \
        python -m backend.pipeline.migrate_sqlite_to_postgres

That copies from a SQLite file at `backend/data/campus.db`. If you
don't have one, skip this step.

### 5. Ingest the map

    docker compose -f docker-compose.prod.yml exec api \
        python -m backend.pipeline.ingest

This reads `backend/data/map.osm` and populates the database. Do it
once after first deploy. Subsequent map updates use the re-import
view on the admin site.

### 6. Create the first admin account

    docker compose -f docker-compose.prod.yml exec api \
        python admin/scripts/create_admin_user.py \
        --email you@example.com --password <a-strong-password>

Then log in at `https://your-domain.example/login`.

## TLS

For a real deployment, terminate TLS at nginx. The simplest path is
certbot:

    apt install certbot python3-certbot-nginx
    certbot --nginx -d your-domain.example

Certbot edits the nginx config and sets up automatic renewal. After
that, `MEDIA_BASE_URL` should be `https://your-domain.example`.

## Updating

When the code changes:

    cd /opt/campus-nav
    git pull
    docker compose -f docker-compose.prod.yml up -d --build

The API and admin containers rebuild. Postgres and Redis stay up.

## Backups

The database and uploaded media are in named Docker volumes:
`campus-nav_postgres-data` and `campus-nav_api-media`.

Back them up with:

    docker run --rm \
        -v campus-nav_postgres-data:/data \
        -v $(pwd)/backups:/backup \
        alpine tar czf /backup/postgres-$(date +%F).tar.gz -C /data .

    docker run --rm \
        -v campus-nav_api-media:/data \
        -v $(pwd)/backups:/backup \
        alpine tar czf /backup/media-$(date +%F).tar.gz -C /data .

Run this on a schedule — a cron job that does it nightly and keeps
the last 7 days is enough.

## Health checks

    curl https://your-domain.example/api/health

The response says whether each dependency (database, graph, redis)
is healthy. The overall `status` is `ok`, `degraded`, or `down`.

## Logs

    docker compose -f docker-compose.prod.yml logs -f api
    docker compose -f docker-compose.prod.yml logs -f admin
    docker compose -f docker-compose.prod.yml logs -f nginx

In production the API logs are JSON, one object per line. Ship them
to a log aggregator, or tail them manually for a small deployment.

## Without Postgres

If your environment doesn't support Postgres yet (Phase 13 was
deferred), you can deploy with SQLite by editing the compose file:

1. Comment out the `postgres` service.
2. Change the `api` service's `DATABASE_URL` to
   `sqlite:////app/data/campus.db`.
3. Mount a volume at `/app/data` so the SQLite file persists.

This works for a small pilot but doesn't scale and doesn't have
PostGIS. Migrate to Postgres before opening the app to more than a
few dozen concurrent users.

## What's not automated

- **Deploy on push.** The `deploy.yml` workflow builds and pushes
  Docker images to GHCR, but the deploy step is commented out. To
  enable it, uncomment the `deploy` job and add the three secrets
  (`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY`) to the GitHub repo.
- **Database migrations.** Alembic migrations aren't run
  automatically. Run them manually after `git pull` if the schema
  changed.
- **Certificate renewal.** Certbot sets up a cron job automatically,
  but it's worth verifying that it runs.