# Avera

Avera is a production-ready web application providing explainable safety snapshots for US neighborhoods. It combines official crime data, alerts, and environmental context to provide a comprehensive view of safety.

## Repository Structure

- `apps/api`: Django backend (Django REST Framework)
- `apps/web`: React frontend (Next.js + Mapbox)
- `docs`: Project documentation
- `infra`: Infrastructure configurations
- `docker-compose.yml`: Local development environment configuration

## Local Development

### Prerequisites

- Docker and Docker Compose
- Node.js (for frontend local dev tools)
- Python (for backend local dev tools)

### Getting Started

1.  Clone the repository.
2.  Run `docker-compose up` to start the backing services (PostgreSQL + PostGIS, Redis).
3.  Follow the instructions in `apps/api/README.md` and `apps/web/README.md` (coming soon) to start the application components.
