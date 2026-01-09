import feedparser
import logging
from datetime import datetime, timezone as py_timezone
from time import mktime
from django.utils import timezone as django_timezone
from .base import BaseConnector
from geo.utils import point_to_h3
import requests

logger = logging.getLogger(__name__)

class RSSConnector(BaseConnector):
    def fetch(self):
        # Using feedparser's remote fetch
        return feedparser.parse(self.source.url)

    def parse(self, raw_data) -> list:
        items = []
        for entry in raw_data.entries:
            # Parse timestamp
            published_at = django_timezone.now()
            if hasattr(entry, 'published_parsed'):
                published_at = datetime.fromtimestamp(mktime(entry.published_parsed)).replace(tzinfo=py_timezone.utc)

            # Geo logic: RSS usually doesn't have lat/lng cleanly.
            # For this example, we will assign a mock location (NYC center) if missing,
            # or try to parse geo tags if available.
            # In a real app, we'd geocode the title/description or use Georss.

            # MOCK GEO since generic RSS rarely guarantees connection to a point.
            # Let's say NYCTA alerts are "general NYC" -> put them in a central NYC H3.
            lat, lng = 40.7128, -74.0060
            h3_id = point_to_h3(lat, lng)

            item = {
                "title": entry.title,
                "summary": getattr(entry, 'summary', ''),
                "published_at": published_at,
                "url": getattr(entry, 'link', ''),
                "category": "transit",
                "severity": 1, # Default
                "geom": f"POINT({lng} {lat})", # WKT
                "h3_id": h3_id
            }
            items.append(item)
        return items
