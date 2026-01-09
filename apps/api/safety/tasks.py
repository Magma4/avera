from celery import shared_task
from .calculators import calculate_risk_scores
import logging

logger = logging.getLogger(__name__)

@shared_task
def recompute_risk_scores_task():
    """
    Periodic task to refresh all risk scores.
    """
    logger.info("Starting scheduled risk score recomputation")
    try:
        count = calculate_risk_scores()
        logger.info(f"Successfully recomputed scores for {count} cells")
        return f"Recomputed {count} cells"
    except Exception as e:
        logger.exception("Failed to recompute risk scores")
        raise e
