import os
import django
import logging

import sys
if __name__ == "__main__":
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    django.setup()

from ingest.models import DataSource
from ingest.tasks import ingest_source

# States to bootstrap immediately for demo purposes
from geo.us_states import US_STATES_MAP

# Bootstrap ALL states found in our geometry map
States_List = list(US_STATES_MAP.keys())
# States_List = ['NY', 'CA', 'FL', 'TX', 'IL', 'PA', 'NJ', 'MA', 'WA', 'GA', 'NC']

def bootstrap():
    # Load Registry to sync DB
    import yaml
    from django.conf import settings

    registry_path = os.path.join(settings.BASE_DIR, 'ingest/registry/sources.yml')
    if not os.path.exists(registry_path):
        print(f"Registry not found at {registry_path}")
        return

    with open(registry_path, 'r') as f:
        registry = yaml.safe_load(f)

    print(f"Bootstrapping data for {len(States_List)} states...")

    for state in States_List:
        if state == 'NY':
            print("Skipping NY (Special Legacy Handling)...")
            continue

        # 1. Crime Baseline
        slug = f"us-{state.lower()}-crime-baseline"

        # Sync DB first
        entry = next((item for item in registry if item['slug'] == slug), None)
        if entry: # safety check if entry found
             DataSource.objects.update_or_create(
                 slug=slug,
                 defaults={
                     'name': entry['name'],
                     'type': entry['type'],
                     'url': entry['url'],
                     'is_active': entry.get('enabled', True)
                 }
             )

        print(f"Triggering {slug}...")
        try:
            # We call the task function directly (synchronously) for the script
            # ignoring @shared_task wrapper behavior if possible, or just calling .apply()
            # actually ingest_source is a celery task, so calling it as function works in python if not imported weirdly

            # Re-fetch source to be sure
            source = DataSource.objects.get(slug=slug)

            # Run
            res = ingest_source(slug)
            print(f"  -> {res}")

        except Exception as e:
            print(f"  [X] Failed: {e}")

        # 1.5 Calculate Scores (CRITICAL for Heatmap Visibility)
        from safety.models import RiskScore
        from safety.services.scoring import ScoringService
        from ingest.models import IncidentNorm

        print(f"  [i] Computing Risk Scores for {slug}...")
        # Find all H3 IDs we just touched
        source_obj = DataSource.objects.get(slug=slug)
        h3_ids = IncidentNorm.objects.filter(source=source_obj).values_list('h3_id', flat=True).distinct()

        scorer = ScoringService()
        score_objs = []

        # Batch create scores
        for h3_id in h3_ids:
            res = scorer.calculate_score(h3_id)
            score_objs.append(RiskScore(
                h3_id=h3_id,
                score=res['score'],
                confidence=res['confidence'],
                reasons_json=res['reasons']
            ))

        # Bulk create/update? RiskScore doesn't have unique constraint on h3_id in model def shown?
        # Actually standard Django model has id. We should probably delete old scores for these H3s first or update.
        # For demo speed: Delete old scores for these hexes and re-insert.
        RiskScore.objects.filter(h3_id__in=h3_ids).delete()
        RiskScore.objects.bulk_create(score_objs, batch_size=1000)
        print(f"  -> Generated {len(score_objs)} RiskScore tiles.")

        # 2. Alerts (NWS)
        slug_alerts = f"us-{state.lower()}-alerts"

        # Sync DB for Alerts
        entry_a = next((item for item in registry if item['slug'] == slug_alerts), None)
        if entry_a:
             DataSource.objects.update_or_create(
                 slug=slug_alerts,
                 defaults={
                     'name': entry_a['name'],
                     'type': entry_a['type'],
                     'url': entry_a['url'],
                     'is_active': entry_a.get('enabled', True)
                 }
             )

        print(f"Triggering {slug_alerts}...")
        try:
             res = ingest_source(slug_alerts)
             print(f"  -> {res}")
        except Exception as e:
             # NWS might timeout or have no alerts, just log
             print(f"  [!] Alert Ingest Log: {e}")

    print("Bootstrap complete.")

if __name__ == "__main__":
    bootstrap()
