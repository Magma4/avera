
import os
import django
import random
from ingest.models import AlertItem
from geo.utils import point_to_h3
import sys

# Setup Django
sys.path.append('/app')
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

def run():
    print("Scattering alerts...")
    items = AlertItem.objects.all()

    # Bounding box for NYC + Long Island
    # Lat: 40.5 to 41.0
    # Lng: -74.0 to -72.0 (Suffolk)

    count = 0
    for item in items:
        # Generate random coords in NY area
        lat = random.uniform(40.5, 41.0)
        lng = random.uniform(-74.2, -72.0)

        item.geom = f"POINT({lng} {lat})"
        item.h3_id = point_to_h3(lat, lng)
        item.save()
        count += 1

    print(f"Scattered {count} alerts across NY/LI.")

if __name__ == '__main__':
    run()
