import requests
import logging
from django.utils import timezone
from django.conf import settings
from django.contrib.gis.geos import Point
from .base import BaseConnector
from geo.utils import point_to_h3
from ingest.models import EnvMetric

logger = logging.getLogger(__name__)

# Grid of major US metro centroids to query AirNow for broad coverage
# Format: (lat, lng, label)
QUERY_POINTS = [
    # Northeast
    (40.7128, -74.0060, "New York"),
    (42.3601, -71.0589, "Boston"),
    (39.9526, -75.1652, "Philadelphia"),
    (38.9072, -77.0369, "Washington DC"),
    (40.4406, -79.9959, "Pittsburgh"),
    (43.0481, -76.1474, "Syracuse"),
    (42.8864, -78.8784, "Buffalo"),
    # Southeast
    (33.7490, -84.3880, "Atlanta"),
    (25.7617, -80.1918, "Miami"),
    (28.5383, -81.3792, "Orlando"),
    (35.2271, -80.8431, "Charlotte"),
    (36.1627, -86.7816, "Nashville"),
    (30.2672, -97.7431, "Austin"),
    (29.7604, -95.3698, "Houston"),
    (32.7767, -96.7970, "Dallas"),
    (29.4241, -98.4936, "San Antonio"),
    (30.3322, -81.6557, "Jacksonville"),
    (32.7765, -79.9311, "Charleston"),
    # Midwest
    (41.8781, -87.6298, "Chicago"),
    (42.3314, -83.0458, "Detroit"),
    (39.0997, -94.5786, "Kansas City"),
    (44.9778, -93.2650, "Minneapolis"),
    (39.7684, -86.1581, "Indianapolis"),
    (41.4993, -81.6944, "Cleveland"),
    (39.9612, -82.9988, "Columbus"),
    (43.0389, -87.9065, "Milwaukee"),
    (38.6270, -90.1994, "St Louis"),
    # West
    (34.0522, -118.2437, "Los Angeles"),
    (37.7749, -122.4194, "San Francisco"),
    (47.6062, -122.3321, "Seattle"),
    (33.4484, -112.0740, "Phoenix"),
    (39.7392, -104.9903, "Denver"),
    (36.1699, -115.1398, "Las Vegas"),
    (45.5152, -122.6784, "Portland"),
    (32.7157, -117.1611, "San Diego"),
    (37.3382, -121.8863, "San Jose"),
    (40.7608, -111.8910, "Salt Lake City"),
    (35.4676, -97.5164, "Oklahoma City"),
    (46.8721, -113.9940, "Missoula"),
    # Alaska / Hawaii
    (61.2181, -149.9003, "Anchorage"),
    (21.3069, -157.8583, "Honolulu"),
]


class AirNowConnector(BaseConnector):
    """
    Ingests real-time air quality data from the EPA AirNow API.
    Replaces mocked PM2.5 / Ozone readings with verified government data.
    API Docs: https://docs.airnowapi.org/CurrentObservationsByLatLon/docs
    """

    def fetch(self):
        """Fetch AQI observations for a grid of US metro areas."""
        api_key = getattr(settings, 'AIRNOW_API_KEY', '') or ''
        if not api_key:
            logger.error("AIRNOW_API_KEY not set in settings / .env")
            raise ValueError("AIRNOW_API_KEY is required. Register free at https://docs.airnowapi.org/")

        all_observations = []

        for lat, lng, label in QUERY_POINTS:
            url = (
                f"https://www.airnowapi.org/aq/observation/latLong/current/"
                f"?format=application/json"
                f"&latitude={lat}&longitude={lng}"
                f"&distance=50"
                f"&API_KEY={api_key}"
            )
            try:
                resp = requests.get(url, timeout=10)
                resp.raise_for_status()
                data = resp.json()
                if data:
                    for obs in data:
                        obs['_query_label'] = label
                    all_observations.extend(data)
            except Exception as e:
                logger.warning(f"AirNow fetch failed for {label}: {e}")
                continue

        return all_observations

    def parse(self, raw_data):
        """Parse AirNow JSON into EnvMetric-ready dicts."""
        return raw_data  # Already structured JSON, we process in run()

    def run(self):
        """Override run for EnvMetric bulk creation instead of AlertItem."""
        logger.info(f"Starting AirNow ingest for {self.source.slug}")

        observations = self.fetch()
        if not observations:
            logger.warning("No AirNow observations returned")
            return 0

        # Clear old AirNow data for this source (idempotent refresh)
        deleted, _ = EnvMetric.objects.filter(source=self.source, metric__in=['pm25', 'ozone']).delete()
        if deleted:
            logger.info(f"Cleared {deleted} old AirNow records")

        objs = []
        seen = set()

        for obs in observations:
            param = obs.get('ParameterName', '')
            aqi = obs.get('AQI')
            lat = obs.get('Latitude')
            lng = obs.get('Longitude')

            if not param or aqi is None or not lat or not lng:
                continue

            # Map parameter names
            if 'PM2.5' in param:
                metric = 'pm25'
            elif 'OZONE' in param.upper() or 'O3' in param.upper():
                metric = 'ozone'
            else:
                continue  # Skip other parameters for now

            # Deduplicate by location + metric
            key = (round(lat, 3), round(lng, 3), metric)
            if key in seen:
                continue
            seen.add(key)

            h3_id = point_to_h3(lat, lng, resolution=7)  # Regional resolution

            # Parse observation time
            date_str = obs.get('DateObserved', '')
            hour = obs.get('HourObserved', 0)
            try:
                from datetime import datetime
                ts = datetime.strptime(date_str.strip(), '%Y-%m-%d')
                ts = ts.replace(hour=int(hour), tzinfo=timezone.utc)
            except Exception:
                ts = timezone.now()

            objs.append(EnvMetric(
                source=self.source,
                metric=metric,
                value=float(aqi),
                ts=ts,
                geom=Point(float(lng), float(lat)),
                h3_id=h3_id
            ))

        if objs:
            EnvMetric.objects.bulk_create(objs, batch_size=500)

        logger.info(f"AirNow ingest complete: {len(objs)} observations saved")
        return len(objs)
