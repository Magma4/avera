from django.test import TestCase
from django.utils import timezone
from ingest.models import DataSource, AlertItem
from ingest.connectors.base import BaseConnector
from typing import Any, List, Dict

class DummyConnector(BaseConnector):
    def fetch(self) -> Any:
        return [
            {'title': 'Test 1', 'published_at': timezone.now(), 'summary': 'Summary 1'},
            {'title': 'Test 2', 'published_at': timezone.now(), 'summary': 'Summary 2'},
            {'title': 'Test 1', 'published_at': timezone.now(), 'summary': 'Summary 1 Duplicate'}, # Duplicate Title and Time intentionally
        ]

    def parse(self, raw_data: Any) -> List[Dict[str, Any]]:
        # Dummy parse just passes the data through, adding a point for geometry
        from django.contrib.gis.geos import Point
        parsed = []
        for x in raw_data:
            parsed.append({
                'title': x['title'],
                'published_at': x['published_at'],
                'summary': x['summary'],
                'point': Point(0, 0),
                'category': 'test',
                'severity': 1,
                'source': self.source
            })
        return parsed

class BaseConnectorTest(TestCase):
    def setUp(self):
        self.source = DataSource.objects.create(
            name="Dummy Source",
            slug="dummy-source",
            type="API",
            url="http://dummy"
        )
        self.connector = DummyConnector(self.source)

    def test_bulk_create_deduplication(self):
        # Initial run: should ingest 2 unique items (the 3rd is a duplicate based on title + time in fetch)
        count = self.connector.run()
        self.assertEqual(count, 3)

        # In the context of base.py deduplication proxy using (title, published_at),
        # Test 1 and Test 1 Duplicate actually have DIFFERENT timezone.now() evaluations in fetch()
        # because timezone.now() is evaluated 3 times asynchronously.
        # Let's override to prove deduplication.

        fixed_time = timezone.now()
        def deterministic_fetch():
            return [
                {'title': 'Real 1', 'published_at': fixed_time, 'summary': 'Summary 1'},
                {'title': 'Real 2', 'published_at': fixed_time, 'summary': 'Summary 2'},
                {'title': 'Real 1', 'published_at': fixed_time, 'summary': 'Summary 1 Dup'}, # Duplicate
            ]
        self.connector.fetch = deterministic_fetch

        count = self.connector.run()
        self.assertEqual(count, 2) # Should only insert 2 unique records
        self.assertEqual(AlertItem.objects.count(), 5) # 3 from first + 2 from second

        # Second run: Should ingest 0, as both are already in the DB
        count_again = self.connector.run()
        self.assertEqual(count_again, 0)
        self.assertEqual(AlertItem.objects.count(), 5)
