
import requests
import json
import sys
import os
import django

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from ingest.connectors.nws_connector import NWSConnector

def debug_nws(state_code):
    url = f"https://api.weather.gov/alerts/active?area={state_code}"
    print(f"Fetching {url}...")

    headers = {
        "User-Agent": "(avera-debug-client, contact@avera.com)"
    }

    try:
        resp = requests.get(url, headers=headers)
        data = resp.json()

        features = data.get('features', [])
        print(f"Found {len(features)} raw alerts from API.")

        print("--- Raw Feature Inspection ---")
        for f in features[:5]:
            props = f.get('properties', {})
            geom = f.get('geometry')
            print(f"  Title: {props.get('headline')[:50]}... | Geometry: {geom is not None}")


        if not features:
            print("API returned 0 features. Check if NWS has active alerts for this state manually.")
            return

        # Mock Source
        class MockSource:
            def __init__(self, url):
                self.url = url
                self.slug = "debug-source"
                self.name = "Debug Source"

        source = MockSource(url)

        # Initialize Connector
        connector = NWSConnector(source=source)

        # Test Parse
        print("\n--- Testing Parse Logic ---")
        items = connector.parse(data)
        print(f"Connector parsed {len(items)} items.")

        for item in items:
            print(f"  - [{item['severity']}/100] {item['title']} ({item['category']})")
            geom = item.get('geometry')
            if geom:
                print(f"    Geom: {geom.get('type', 'Unknown')}")
            else:
                print("    Geom: None")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    state = sys.argv[1] if len(sys.argv) > 1 else "CA"
    debug_nws(state)
