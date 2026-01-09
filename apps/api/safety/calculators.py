from django.utils import timezone
from django.db.models import Sum, Count, Avg
from ingest.models import IncidentNorm
from safety.models import RiskScore
import logging

logger = logging.getLogger(__name__)

def calculate_risk_scores():
    """
    Aggregates IncidentNorm data by H3 cell and updates RiskScore.
    This is a simplistic MVP implementation.
    """
    logger.info("Starting risk score calculation")

    # 1. Identify active H3 cells (those with incidents)
    # Ideally we process all cells in a region, but for MVP we follow the data.
    active_cells = IncidentNorm.objects.values_list('h3_id', flat=True).distinct()

    count = 0
    for h3_id in active_cells:
        # Use Scoring Service
        from safety.services.scoring import ScoringService
        service = ScoringService()
        result = service.calculate_score(h3_id)

        # Update or Create RiskScore
        RiskScore.objects.update_or_create(
            h3_id=h3_id,
            defaults={
                'score': result['score'],
                'confidence': result['confidence'],
                'reasons_json': result['reasons'],
                'updated_at': timezone.now()
            }
        )
        count += 1
        count += 1

    logger.info(f"Updated risk scores for {count} cells")
    return count
