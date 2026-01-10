import yaml
import os

# States to add (excluding NY because it has specific handling already)
US_STATES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
]

REGISTRY_PATH = '/Users/ray/avera/apps/api/ingest/registry/sources.yml'

def main():
    if not os.path.exists(REGISTRY_PATH):
        print("Registry not found!")
        return

    with open(REGISTRY_PATH, 'r') as f:
        data = yaml.safe_load(f) or []

    existing_slugs = {item['slug'] for item in data}
    new_entries = []

    for state in US_STATES:
        state_lower = state.lower()

        # 1. State Alerts (NWS)
        slug_alert = f"us-{state_lower}-alerts"
        if slug_alert not in existing_slugs:
            new_entries.append({
                'name': f"Official Alerts - {state}",
                'slug': slug_alert,
                'type': 'official_alerts',
                'connector': 'nws',
                'url': f"https://api.weather.gov/alerts/active?area={state}",
                'enabled': True
            })

        # 2. State Crime Baseline (Federal/State Aggregates)
        slug_crime = f"us-{state_lower}-crime-baseline"
        if slug_crime not in existing_slugs:
            new_entries.append({
                'name': f"Crime Baseline - {state}",
                'slug': slug_crime,
                'type': 'crime_history',
                'connector': 'federal_crime',
                'url': "federal://cde/baseline", # Virtual URL
                'enabled': True
            })

    if not new_entries:
        print("No new states to add.")
        return

    # safe_dump doesn't preserve comments/ordering perfectly but good enough for logic
    # Append simply as text to preserve top comments
    with open(REGISTRY_PATH, 'a') as f:
        f.write("\n# --- Nationwide Expansion ---\n")
        yaml.dump(new_entries, f, default_flow_style=False, sort_keys=False)

    print(f"Added {len(new_entries)} entries covering {len(US_STATES)} states.")

if __name__ == "__main__":
    main()
