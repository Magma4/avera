from django.db import models

class RiskScore(models.Model):
    class TimeBucket(models.TextChoices):
        DAY = "day", "Day"
        NIGHT = "night", "Night"

    class Confidence(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"

    h3_id = models.CharField(max_length=15, db_index=True)
    time_bucket = models.CharField(max_length=10, choices=TimeBucket.choices)
    score = models.IntegerField() # 0-100
    confidence = models.CharField(max_length=10, choices=Confidence.choices)
    reasons_json = models.JSONField(default=list)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['h3_id', 'time_bucket']
        indexes = [
            models.Index(fields=['h3_id', 'time_bucket']),
        ]
