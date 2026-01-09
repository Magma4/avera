import os
import django
from django.db.models import Count, Min, Max

# Setup Django standalone
import sys
sys.path.append('/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from ingest.models import IncidentNorm, IngestRun

def run():
    print("--- INGEST CONFIG ---")
    runs = IngestRun.objects.filter(source__slug='nyc-nypd-ytd').order_by('-started_at')
    print(f"Total Runs for 'nyc-nypd-ytd': {runs.count()}")
    for r in runs[:3]:
        print(f"Run {r.id}: {r.status} items={r.items_processed} start={r.started_at} end={r.completed_at}")
        if r.error_log:
            print(f"  Error: {r.error_log[:200]}")

    print("\n--- DATA STATS ---")
    total = IncidentNorm.objects.count()
    print(f"Total Incidents in DB: {total}")

    if total == 0:
        return

    dates = IncidentNorm.objects.aggregate(min_date=Min('occurred_at'), max_date=Max('occurred_at'))
    print(f"Date Range: {dates['min_date']} to {dates['max_date']}")

    # Check spatial bounds (approx via raw query or fetching extremes)
    # Using Django GIS aggregates if possible, otherwise simple manual check of a few rows
    # Actually PostGIS supports Extent
    from django.contrib.gis.db.models import Extent
    bounds = IncidentNorm.objects.aggregate(extent=Extent('geom'))
    print(f"Spatial Bounds: {bounds['extent']}")

    print("\n--- CATEGORY SAMPLE ---")
    cats = IncidentNorm.objects.values('category').annotate(c=Count('id')).order_by('-c')[:5]
    for c in cats:
        print(f"{c['category']}: {c['c']}")

if __name__ == '__main__':
    run()
