
import os
import django
import random
from django.utils import timezone
from django.contrib.gis.geos import Point
from ingest.models import AlertItem, DataSource
from geo.utils import point_to_h3

def run():
    print("Clearing old alerts...")
    AlertItem.objects.all().delete()

    # Ensure Sources exist
    mta_source, _ = DataSource.objects.get_or_create(
        slug="mta-feed",
        defaults={"name": "MTA Service Status", "type": "official_alerts"}
    )
    nws_source, _ = DataSource.objects.get_or_create(
        slug="nws-feed",
        defaults={"name": "National Weather Service", "type": "official_alerts"}
    )
    nypd_source, _ = DataSource.objects.get_or_create(
        slug="nypd-feed",
        defaults={"name": "NYPD Operations", "type": "official_alerts"}
    )
    dot_source, _ = DataSource.objects.get_or_create(
        slug="ny-dot",
        defaults={"name": "NY State DOT", "type": "official_alerts"}
    )

    alerts = []

    # 1. NYC Alerts (Transit & Police) - Bounded to ~NYC
    # Lat: 40.55 - 40.90, Lng: -74.05 - -73.70
    nyc_data = [
        ("Subway Delays: A Train", "Southbound A trains are running with delays due to signal problems at 42 St.", "transit", mta_source, 2),
        ("Police Activity", "Avoid the area of 5th Ave and 34th St due to ongoing police investigation.", "police", nypd_source, 7),
        ("L Train Suspended", "L Train service suspended between 8 Av and Lorraine Av due to unauthorized person on tracks.", "transit", mta_source, 5),
        ("Protest Activity", "Large demonstration expected at Union Square. Expect varying traffic delays.", "safety", nypd_source, 3),
        ("Bus Detour: M15", "M15 buses are detoured due to road work on 1st Ave.", "transit", mta_source, 1),
        ("Suspicious Package", "Safe clearance given at Fulton St station after earlier investigation.", "police", nypd_source, 4),
    ]

    print("Generating NYC alerts...")
    for _ in range(40): # Generate 40 scattered NYC events
        title, summary, cat, src, sev = random.choice(nyc_data)
        lat = random.uniform(40.6, 40.85)
        lng = random.uniform(-74.0, -73.8)

        # Jitter title slightly to avoid identical dupes
        full_title = f"{title} ({random.randint(100, 999)})" if "Subway" in title else title

        item = AlertItem(
            source=src,
            title=full_title,
            summary=summary,
            category=cat,
            severity=sev,
            published_at=timezone.now() - timezone.timedelta(minutes=random.randint(5, 120)),
            url="https://new.mta.info/",
            geom=Point(lng, lat),
            h3_id=point_to_h3(lat, lng)
        )
        alerts.append(item)

    # 2. Statewide Alerts (Weather & Traffic) - Full NY State Coverage
    # Lat: 40.5 - 45.0 (NYC to Canadian Border)
    # Lng: -79.8 - -72.0 (Buffalo to Montauk)
    statewide_data = [
        ("Winter Storm Warning", "Heavy lake effect snow expected. Total snow accumulations of 12 to 24 inches.", "weather", nws_source, 8),
        ("High Wind Advisory", "West winds 20 to 30 mph with gusts up to 50 mph expected.", "weather", nws_source, 4),
        ("Road Closure: I-90", "I-90 Thruway Westbound closed due to jackknifed tractor trailer.", "safety", dot_source, 6),
        ("Dense Fog Advisory", "Visibility one quarter mile or less in dense fog.", "weather", nws_source, 3),
        ("Flood Watch", "Flash flooding caused by excessive rainfall is possible in low-lying areas.", "weather", nws_source, 6),
        ("Severe Thunderstorm Watch", "Conditions are favorable for severe thunderstorms producing 60 mph wind gusts.", "weather", nws_source, 5),
    ]

    print("Generating Statewide alerts (Buffalo, Syracuse, Albany, etc.)...")
    for _ in range(80): # Increased count for larger area
        title, summary, cat, src, sev = random.choice(statewide_data)

        # Random coord within rough NY shape
        lat = random.uniform(40.5, 45.0)
        lng = random.uniform(-79.5, -73.0)

        # Simple bounding hack to avoid placing points deep in PA/Ocean
        # (Very rough approximation of NY shape)
        if lat < 42.0 and lng < -75.0: continue # Skip PA corner

        item = AlertItem(
            source=src,
            title=title,
            summary=summary,
            category=cat,
            severity=sev,
            published_at=timezone.now() - timezone.timedelta(hours=random.randint(1, 24)),
            url="https://weather.gov/",
            geom=Point(lng, lat),
            h3_id=point_to_h3(lat, lng)
        )
        alerts.append(item)

    AlertItem.objects.bulk_create(alerts)
    print(f"Seeded {len(alerts)} realistic alerts covering all of NY State.")
