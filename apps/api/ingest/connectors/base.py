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
            count = 0
            for item in items:
                if self.save_item(item):
                    count += 1
            return count
        except Exception as e:
            logger.error(f"Error ingesting {self.source.name}: {e}")
            raise e

    def save_item(self, item_data: Dict[str, Any]) -> bool:
        """Save a parsed item to the DB, creating if not exists based on source+h3+time or other unique key."""
        # For AlertItems, uniqueness logic depends on the source.
        # This generic saver assumes 'h3_id' and 'published_at' are key, but
        # usually we want a unique ID from the feed (e.g. guid).
        # For this step, we'll keep it simple: dedupe by duplicate fields if possible
        # or just create. A real impl would check a unique ID.

        # Dedupe check (simple):
        exists = AlertItem.objects.filter(
            source=self.source,
            title=item_data.get('title'),
            published_at=item_data.get('published_at')
        ).exists()

        if exists:
            return False

        AlertItem.objects.create(
            source=self.source,
            **item_data
        )
        return True
