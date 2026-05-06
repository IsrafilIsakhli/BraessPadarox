# Braess Paradox Traffic Simulation Platform

This project is a professional traffic analysis web application for testing Braess paradox scenarios on an OpenStreetMap-based interface.

Users can select origin and destination points directly on the map or enter latitude/longitude values from the control panel. The system compares multiple traffic intervention scenarios and highlights whether adding a new road improves or worsens network performance.

## Tech Stack

- `web`: React, TypeScript, Vite, Leaflet
- `api`: Node.js, Express, TypeScript
- Runtime: Docker Compose

## Quick Start

```bash
docker compose up --build
```

Application URLs:

- Web app: `http://localhost:5173`
- API health check: `http://localhost:4000/health`

## Features

- OpenStreetMap-based route selection
- Origin and destination selection by map click
- Latitude/longitude input from the side panel
- Directed-road analysis for one-way and two-way connections
- Braess paradox detection with scenario comparison
- New road testing in one-way and two-way modes
- Traffic light placement testing at bottleneck candidates
- Emergency vehicle priority scenario
- Plain-language decision summary for non-technical users
- Visual scenario comparison and recommendation cards

## Analysis Model

The API builds a directed traffic graph from OSRM route geometry and step-level route data. It estimates capacity and delay per segment, applies a BPR-style congestion cost function, and compares intervention scenarios using iterative traffic assignment.

The analysis includes:

- Baseline network performance
- New road added as one-way
- New road added as two-way
- Bottleneck road closure
- Smart traffic signal placement
- Emergency vehicle priority

## Project Structure

```text
.
├── api
│   ├── src
│   │   ├── index.ts
│   │   ├── simulation.ts
│   │   └── types.ts
│   └── Dockerfile
├── web
│   ├── src
│   │   ├── components
│   │   ├── services
│   │   ├── App.tsx
│   │   └── styles.css
│   └── Dockerfile
└── docker-compose.yml
```

## Development Notes

The application is designed as a decision-support prototype. For production-grade transport planning, the model should be extended with live traffic feeds, verified OSM road attributes, lane counts, speed limits, signal timing data, and local traffic demand calibration.

