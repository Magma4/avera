import os
import yaml
from celery import shared_task
from django.conf import settings
from .models import DataSource, IngestRun
from .connectors.rss import RSSConnector

import logging
logger = logging.getLogger(__name__)

@shared_task
def ingest_source(source_slug):
    try:
        source = DataSource.objects.get(slug=source_slug)
    except DataSource.DoesNotExist:
        logger.error(f"Source {source_slug} not found.")
        return

    run = IngestRun.objects.create(source=source)

    try:
        # Determine connector class
        if source.slug == 'nyc-transit': # or check registry/type
             connector = RSSConnector(source)
             count = connector.run()
             count = connector.run()
        elif source.slug in ['nyc-nypd-ytd', 'nyc-street-light-conditions', 'nyc-subway-entrances', 'ny-state-index']:
            from .connectors.csv_connector import CSVConnector
            connector = CSVConnector(source)
            count = connector.run()
        else:
            # Fallback or generic logic if we add more
            # For now just log
            logger.warning(f"No connector mapped for {source.slug}")
            count = 0

        # Update run status
        run.status = IngestRun.Status.SUCCESS
        run.items_processed = count
        run.completed_at = timezone.now()
        run.save()
        return f"Ingested {count} items for {source.slug}"

    except Exception as e:
        run.status = IngestRun.Status.FAILED
        run.error_log = str(e)
        run.save()
        logger.exception(f"Ingest failed for {source_slug}")
        return f"Failed to ingest {source.slug}: {e}"

@shared_task
def trigger_all_ingests():
    """
    Reads the registry file, ensures sources exist in DB, and triggers ingestion.
    """
    registry_path = os.path.join(settings.BASE_DIR, 'ingest/registry/sources.yml')
    if not os.path.exists(registry_path):
        logger.error(f"Registry not found at {registry_path}")
        return

    with open(registry_path, 'r') as f:
        registry = yaml.safe_load(f)

    triggered = []
    for entry in registry:
        if not entry.get('enabled', False):
            continue

        slug = entry['slug']
        # Ensure exists
        slug = entry['slug']
        # Ensure exists and update
        DataSource.objects.update_or_create(
             slug=slug,
             defaults={
                 'name': entry['name'],
                 'type': entry['type'],
                 'url': entry['url'], # This ensures the URL is updated
                 'connector': entry['connector'] # Also ensure connector is up to date
             }
        )
        # Trigger task
        ingest_source.delay(slug)
        triggered.append(slug)

    return f"Triggered ingest for: {', '.join(triggered)}"

from django.utils import timezone
