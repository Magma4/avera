from django.utils import timezone
from django.db.models import Count, Avg
from ingest.models import IncidentNorm, EnvMetric

class ScoringService:
    """
    Implements V1 Scoring Logic: Heuristic & Explainable.
    Fuses Crime History, Environmental Factors, and Alerts.
    """

    def calculate_score(self, h3_id):
        """
        Computes the overall Safety Score (0-100) for a given H3 cell.
        Returns dict with score, confidence, and reasons.
        """
        # 1. Crime Baseline
        crime_score, crime_reasons = self._compute_crime_score(h3_id)

        # 2. Environmental Modifiers
        env_adjustment, env_reasons = self._compute_env_impact(h3_id)

        # 3. Alerts (Placeholder)
        # alerts_adjustment = 0

        # 4. Fusion
        # Base is the Crime Score (which is 0-100 Safe)
        # Env applies penalty or bonus to that state.
        raw_score = crime_score + env_adjustment

        # 5. Confidence
        confidence = self._compute_confidence(h3_id)

        # 6. Score Clamping (Step 1)
        # If confidence is NOT high, score cannot be below 25.
        # This prevents alarmist low scores on weak data.
        min_score_allowed = 0
        if confidence != "high":
            min_score_allowed = 25

        final_score = max(min_score_allowed, min(100, raw_score))

        return {
            'score': int(final_score),
            'confidence': confidence,
            'reasons': crime_reasons + env_reasons
        }

    def _compute_crime_score(self, h3_id):
        """
        Calculates score based on historical incidents.
        Start at 100 (Safe). Deduct based on count and severity.
        """
        incidents = IncidentNorm.objects.filter(h3_id=h3_id)
        count = incidents.count()

        if count == 0:
            return 100, [{"factor": "crime_history", "impact": "positive", "score_impact": 0, "detail": "No recent incidents reported"}]

        avg_severity = incidents.aggregate(Avg('severity'))['severity__avg'] or 0

        # Heuristic:
        # Risk = (Count * 2) + (AvgSeverity * 0.5)
        # Example: 10 thefts (sev 20) -> 20 + 10 = 30 risk. Score 70.
        # Example: 1 Assault (sev 80) -> 2 + 40 = 42 risk. Score 58.
        risk_val = (count * 2.0) + (avg_severity * 0.5)

        base_score = 100 - risk_val

        # Determine dominant crime for explanation
        # Step 3: Neutral Language
        top_cat = incidents.values('category').annotate(c=Count('category')).order_by('-c').first()
        topic = top_cat['category'] if top_cat else "incidents"

        # Clean up topic string to be more neutral if needed, but primary categorization is handled below.

        reasons = []
        if base_score < 60:
            reasons.append({
                "factor": "crime_history",
                "impact": "negative",
                "score_impact": int(-risk_val),
                "detail": "Historical Incident Context: Reports related to personal safety appear with higher frequency (Aggregated 1yr)"
            })
        elif base_score < 85:
            reasons.append({
                "factor": "crime_history",
                "impact": "neutral",
                "score_impact": int(-risk_val),
                "detail": "Historical Incident Context: Intermittent reports detected. No indication of active threats."
            })
        else:
             reasons.append({
                "factor": "crime_history",
                "impact": "positive",
                "score_impact": int(-risk_val) if risk_val > 0 else 0,
                "detail": "Historical Incident Context: Low density of reported incidents."
            })

        return base_score, reasons

    def _compute_env_impact(self, h3_id):
        """
        Calculates modifiers from environmental data.
        Returns: adjustment_value (float), list of reasons
        """
        adjustment = 0.0
        reasons = []

        metrics = EnvMetric.objects.filter(h3_id=h3_id)

        # Street Lights (Negative)
        outages = metrics.filter(metric='street_light_outage').count()
        if outages > 0:
            # -5 points per outage, cap at -30
            pen = min(outages * 5, 30)
            adjustment -= pen
            reasons.append({
                "factor": "environment",
                "impact": "negative",
                "score_impact": int(-pen),
                "detail": f"Environmental Context: {outages} street light outages detected (Proxy for visibility)"
            })

        # Subway Entrances (Positive)
        subways = metrics.filter(metric='subway_entrance').count()
        if subways > 0:
            # +5 points per entrance, cap at +20
            bonus = min(subways * 5, 20)
            adjustment += bonus
            reasons.append({
                "factor": "environment",
                "impact": "positive",
                "score_impact": int(bonus),
                "detail": f"Environmental Context: {subways} subway entrances nearby (Active Transit Zone)"
            })

        return adjustment, reasons

    def _compute_confidence(self, h3_id):
        """
        Estimates confidence based on data volume/recency.
        """
        # For V1, simple heuristic on incident count.
        # If we have 0 incidents, confidence is low unless we know we have good coverage.
        # Assuming YTD data covers NYC well.

        inc_count = IncidentNorm.objects.filter(h3_id=h3_id).count()

        if inc_count > 50:
            return "high"
        elif inc_count > 5:
            return "medium"
        else:
            return "low"
