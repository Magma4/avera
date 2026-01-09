# Decisions

## Scope
- **US-only launch**: The initial launch will focus exclusively on the United States. This simplifies data sourcing and regulatory compliance.

## Technology
- **Mapbox Frontend**: Chosen for its flexibility, performance, and rich feature set for rendering complex geospatial data.

## Product & Ethics
- **Evidence Layers**:
  1.  **Official Crime Reports**: Historical baseline data from official sources.
  2.  **Official Alerts**: Government, police bulletins, and transit alerts. ONLY official sources.
  3.  **Environmental Context**: Satellite data, air quality, smoke/haze, nighttime activity proxies.
- **Truth/Ethics Rules**:
  - **No Crowdsourced "Live Crime"**: We do not allow user-submitted reports to avoid bias and verification issues.
  - **Clear Labeling**: Environmental factors must be clearly labeled as such and distinguished from crime stats.
  - **Confidence, Freshness, Coverage**: Every data point or snapshot must clearly display its confidence level, how fresh the data is, and the known coverage of the source.
