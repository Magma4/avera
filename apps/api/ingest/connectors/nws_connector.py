
import requests
import logging
from django.utils import timezone
from .base import BaseConnector
from geo.utils import point_to_h3
from geo.us_states import US_STATES_MAP
from django.contrib.gis.geos import Point, Polygon

logger = logging.getLogger(__name__)

class NWSConnector(BaseConnector):
    """
    Ingests official alerts from api.weather.gov (National Weather Service).
    Supports nationwide coverage by state code.
    """

    def fetch(self):
        # Source URL should be: https://api.weather.gov/alerts/active?area={state_code}
        # The 'url' in DataSource can be the template or the exact URL.
        # We assume the registry provides the explicit URL per state.

        headers = {
            'User-Agent': '(avera.app, contact@avera.app)',
            'Accept': 'application/geo+json'
        }

        try:
            resp = requests.get(self.source.url, headers=headers, timeout=10)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.error(f"Failed to fetch NWS alerts from {self.source.url}: {e}")
            raise e

    def parse(self, raw_data):
        features = raw_data.get('features', [])
        parsed_items = []

        for feature in features:
            props = feature.get('properties', {})
            geom = feature.get('geometry')

            # NWS alerts often lack geometry (statewide/zone-based).
            # We preserve them and handle fallback in run().

            parsed_items.append({
                'external_id': props.get('id'),
                'title': props.get('headline') or props.get('event'),
                'summary': props.get('description') or props.get('instruction'),
                'category': 'environment_weather',
                'severity': self._map_severity(props.get('severity')),
                'source_text': props.get('senderName', 'NWS'),
                'url': props.get('id'),
                'published_at': props.get('sent'),
                'expires_at': props.get('expires'),
                'geometry': geom  # Can be None
            })

        return parsed_items

    def _map_severity(self, nws_severity):
        # NWS: Extreme, Severe, Moderate, Minor, Unknown
        mapping = {
            'Extreme': 100,
            'Severe': 80,
            'Moderate': 50,
            'Minor': 20,
            'Unknown': 10
        }
        return mapping.get(nws_severity, 10)

    def run(self):
        # Override run to handle GeoJSON parsing details
        logger.info(f"Starting NWS ingest for {self.source.slug}")
        data = self.fetch()
        items = self.parse(data)
        count = 0

        from ingest.models import AlertItem

        for item in items:
            # Dedupe check
            if AlertItem.objects.filter(source=self.source, url=item['url']).exists():
                continue

            # Handle Geometry
            geo_data = item.pop('geometry')

            lat, lng = 0, 0

            if geo_data:
                # Helper to extract centroid from GeoJSON geometry
                # (Simplified for Hackathon speed - real app would use shapely)
                coords = geo_data.get('coordinates')
                type_ = geo_data.get('type')

                if type_ == 'Polygon' and coords:
                    points = coords[0]
                    lat = sum(p[1] for p in points) / len(points)
                    lng = sum(p[0] for p in points) / len(points)
                elif type_ == 'MultiPolygon' and coords:
                    points = coords[0][0]
                    lat = sum(p[1] for p in points) / len(points)
                    lng = sum(p[0] for p in points) / len(points)
                elif type_ == 'Point' and coords:
                    lat = coords[1]
                    lng = coords[0]

            # Fallback for missing geometry: Use State Centroid
            if lat == 0:
                # Try to extract state from slug "us-ca-alerts"
                parts = self.source.slug.split('-')
                if len(parts) >= 2 and parts[0] == 'us':
                    state_code = parts[1].upper()
                    if state_code in US_STATES_MAP:
                         # Defaults from US_STATES_MAP
                         centroid = US_STATES_MAP[state_code]
                         lat, lng = centroid[0], centroid[1]

            if lat == 0:
                continue

            # Remove external_id if present
            item.pop('external_id', None)
            item.pop('expires_at', None)
            item.pop('source_text', None)

            h3_id = point_to_h3(lat, lng, resolution=7) # Use broader resolution (7) for alerts

            AlertItem.objects.create(
                source=self.source,
                h3_id=h3_id,
                geom=Point(lng, lat),
                **item
            )
            count += 1

        return count
