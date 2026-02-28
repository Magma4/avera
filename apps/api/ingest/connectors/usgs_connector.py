import requests
import logging
from datetime import datetime
from django.utils import timezone
from django.contrib.gis.geos import Point
from .base import BaseConnector
from geo.utils import point_to_h3
from ingest.models import AlertItem

logger = logging.getLogger(__name__)


class USGSConnector(BaseConnector):
    """
    Ingests real-time earthquake data from USGS GeoJSON feeds.
    Feed: https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson
    Updates every 5 minutes. No API key required.
    """

    MAGNITUDE_SEVERITY_MAP = [
        # (min_magnitude, severity_score)
        (7.0, 100),   # Major
        (6.0, 90),    # Strong
        (5.0, 80),    # Moderate
        (4.0, 60),    # Light
        (3.0, 40),    # Minor
        (2.0, 20),    # Very Minor
        (0.0, 10),    # Micro
    ]

    def fetch(self):
        """Fetch the USGS all-day earthquake GeoJSON feed."""
        url = self.source.url or 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'

        headers = {
            'User-Agent': 'Avera Safety Platform (contact@avera.app)',
            'Accept': 'application/json'
        }

        try:
            resp = requests.get(url, headers=headers, timeout=15)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.error(f"Failed to fetch USGS earthquake data: {e}")
            raise e

    def parse(self, raw_data):
        """Parse GeoJSON FeatureCollection into alert-ready dicts."""
        features = raw_data.get('features', [])
        parsed = []

        for feature in features:
            props = feature.get('properties', {})
            geom = feature.get('geometry', {})
            coords = geom.get('coordinates', [])

            if len(coords) < 2:
                continue

            lng, lat = coords[0], coords[1]
            mag = props.get('mag', 0) or 0
            place = props.get('place', 'Unknown Location')
            event_time = props.get('time')  # Unix milliseconds
            detail_url = props.get('url', '')
            event_type = props.get('type', 'earthquake')

            # Only process actual earthquakes
            if event_type != 'earthquake':
                continue

            # Skip micro-quakes (< M2.0) to reduce noise
            if mag < 2.0:
                continue

            # Map magnitude to severity
            severity = 10
            for min_mag, sev in self.MAGNITUDE_SEVERITY_MAP:
                if mag >= min_mag:
                    severity = sev
                    break

            # Parse timestamp
            try:
                published_at = datetime.fromtimestamp(event_time / 1000, tz=timezone.utc)
            except Exception:
                published_at = timezone.now()

            # Build title
            mag_label = f"M{mag:.1f}"
            title = f"Earthquake {mag_label} - {place}"

            parsed.append({
                'lat': lat,
                'lng': lng,
                'title': title,
                'summary': f"A magnitude {mag:.1f} earthquake detected. {place}.",
                'category': 'seismic',
                'severity': severity,
                'published_at': published_at,
                'url': detail_url,
                'mag': mag,
            })

        return parsed

    def run(self):
        """Override run for custom dedup and AlertItem creation."""
        logger.info(f"Starting USGS earthquake ingest for {self.source.slug}")

        raw_data = self.fetch()
        items = self.parse(raw_data)

        if not items:
            logger.info("No significant earthquakes in the last 24h")
            return 0

        count = 0

        # Pre-fetch existing URLs for dedup
        existing_urls = set(
            AlertItem.objects.filter(
                source=self.source,
                category='seismic'
            ).values_list('url', flat=True)
        )

        objs = []
        for item in items:
            # Deduplicate by USGS event URL
            if item['url'] in existing_urls:
                continue

            lat = item.pop('lat')
            lng = item.pop('lng')
            item.pop('mag')  # Not stored in AlertItem

            h3_id = point_to_h3(lat, lng, resolution=7)

            objs.append(AlertItem(
                source=self.source,
                h3_id=h3_id,
                geom=Point(float(lng), float(lat)),
                **item
            ))

        if objs:
            AlertItem.objects.bulk_create(objs, batch_size=500, ignore_conflicts=True)

        count = len(objs)
        logger.info(f"USGS earthquake ingest complete: {count} new alerts")
        return count
