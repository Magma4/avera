from abc import ABC, abstractmethod
from typing import List, Dict, Any
import logging
from ..models import DataSource, AlertItem

logger = logging.getLogger(__name__)

class BaseConnector(ABC):
    def __init__(self, source: DataSource):
        self.source = source

    @abstractmethod
    def fetch(self) -> Any:
        """Fetch raw data from the source."""
        pass

    @abstractmethod
    def parse(self, raw_data: Any) -> List[Dict[str, Any]]:
        """Parse raw data into a list of dictionaries with standard keys."""
        pass

    def run(self) -> int:
        """Main execution flow."""
        logger.info(f"Starting ingest for {self.source.name}")
        try:
            raw_data = self.fetch()
            items = self.parse(raw_data)

            # Prepare AlertItem instances
            instances_to_create = []
            for item in items:
                instance = self.prepare_item(item)
                if instance:
                    instances_to_create.append(instance)

            if not instances_to_create:
                return 0

            # Bulk insert (ignore_conflicts=True handles uniqueness constraints naturally assuming DB unique_together is correct)
            # If DB doesn't have unique constraints, we can do programmatic deduplication.
            # However, for speed, assuming programmatic deduplication first.

            # Extract keys for deduplication
            seen_keys = set()
            unique_instances = []
            for inst in instances_to_create:
                # Use title and published_at as a proxy for deduplication key
                key = (inst.title, inst.published_at)
                if key not in seen_keys:
                    seen_keys.add(key)
                    unique_instances.append(inst)

            # Check DB for existing records in one query
            titles = [i.title for i in unique_instances]
            dates = [i.published_at for i in unique_instances]

            existing_records = set(
                AlertItem.objects.filter(
                    source=self.source,
                    title__in=titles,
                    published_at__in=dates
                ).values_list('title', 'published_at')
            )

            # Filter out records already in DB
            new_instances = [
                inst for inst in unique_instances
                if (inst.title, inst.published_at) not in existing_records
            ]

            if new_instances:
                AlertItem.objects.bulk_create(new_instances, batch_size=500, ignore_conflicts=True)

            return len(new_instances)
        except Exception as e:
            logger.error(f"Error ingesting {self.source.name}: {e}")
            raise e

    def prepare_item(self, item_data: Dict[str, Any]) -> AlertItem:
        """Prepare an AlertItem instance from data without saving it."""
        try:
            return AlertItem(source=self.source, **item_data)
        except Exception as e:
            logger.error(f"Failed to prepare item: {e}")
            return None
