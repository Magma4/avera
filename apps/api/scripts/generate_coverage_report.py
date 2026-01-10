import os
import django
from django.db.models import Count, Max

import sys
if __name__ == "__main__":
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    django.setup()

from ingest.models import DataSource, AlertItem, IncidentNorm
from geo.us_states import US_STATES_MAP

def generate_report():
    print(f"{'STATE':<6} | {'ALERTS (Latest)':<25} | {'INCIDENTS (Count)':<18} | {'COVERAGE'}")
    print("-" * 75)

    for state in sorted(US_STATES_MAP.keys()):
        # Alerts
        alert_slug = f"us-{state.lower()}-alerts"
        alert_qs = AlertItem.objects.filter(source__slug=alert_slug)
        alert_count = alert_qs.count()
        latest_alert = alert_qs.aggregate(Max('published_at'))['published_at__max']

        alert_str = f"{alert_count} (Latest: {latest_alert.strftime('%m-%d')})" if alert_count > 0 else "0"

        # Incidents
        crime_slug = f"us-{state.lower()}-crime-baseline"
        inc_count = IncidentNorm.objects.filter(source__slug=crime_slug).count()

        # In NY, we check specific legacy sources too
        if state == 'NY':
             ny_count = IncidentNorm.objects.filter(source__slug__in=['nyc-nypd-ytd', 'ny-state-index']).count()
             inc_count = max(inc_count, ny_count)

        coverage_status = "Full" if (alert_count > 0 or inc_count > 0) else "Empty"

        print(f"{state:<6} | {alert_str:<25} | {inc_count:<18} | {coverage_status}")

if __name__ == "__main__":
    generate_report()
