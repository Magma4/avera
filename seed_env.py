
import random
from django.utils import timezone
from django.contrib.gis.geos import Point
from ingest.models import EnvMetric, DataSource
from geo.utils import point_to_h3

def seed_lights():
    source, _ = DataSource.objects.get_or_create(
        slug="nyc-street-light-conditions",
        defaults={"name": "NYC Street Light Conditions", "type": "environment"}
    )

    # Manhattan approx bounds
    lat_min, lat_max = 40.70, 40.80
    lng_min, lng_max = -74.02, -73.93

    count = 0
    print("Seeding Street Light Outages...")
    for _ in range(500):
        lat = random.uniform(lat_min, lat_max)
        lng = random.uniform(lng_min, lng_max)
        h3_id = point_to_h3(lat, lng)

        EnvMetric.objects.create(
            source=source,
            metric="street_light_outage",
            value=1.0,
            ts=timezone.now(),
            h3_id=h3_id,
            geom=Point(lng, lat)
        )
        count += 1

    print(f"Seeded {count} outages.")

if __name__ == "__main__":
    seed_lights()
