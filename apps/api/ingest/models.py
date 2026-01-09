from django.contrib.gis.db import models
from django.utils.translation import gettext_lazy as _

class DataSource(models.Model):
    class SourceType(models.TextChoices):
        CRIME_REPORTS = "crime_reports", _("Crime Reports")
        OFFICIAL_ALERTS = "official_alerts", _("Official Alerts")
        ENVIRONMENT = "environment", _("Environment")

    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    type = models.CharField(max_length=50, choices=SourceType.choices)
    url = models.URLField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

class IngestRun(models.Model):
    class Status(models.TextChoices):
        RUNNING = "running", _("Running")
        SUCCESS = "success", _("Success")
        FAILED = "failed", _("Failed")

    source = models.ForeignKey(DataSource, on_delete=models.CASCADE, related_name="runs")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.RUNNING)
    items_processed = models.IntegerField(default=0)
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    error_log = models.TextField(blank=True)

    def __str__(self):
        return f"{self.source.slug} - {self.started_at}"

class AlertItem(models.Model):
    source = models.ForeignKey(DataSource, on_delete=models.CASCADE)
    title = models.CharField(max_length=500)
    summary = models.TextField(blank=True)
    published_at = models.DateTimeField()
    url = models.URLField(blank=True)
    category = models.CharField(max_length=100)
    severity = models.IntegerField(default=0) # 0-10 scale?
    geom = models.PointField()
    h3_id = models.CharField(max_length=15, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['h3_id', 'published_at']),
        ]

class IncidentNorm(models.Model):
    """Normalized incident from historical crime reports"""
    source = models.ForeignKey(DataSource, on_delete=models.CASCADE)
    occurred_at = models.DateTimeField()
    category = models.CharField(max_length=100)
    severity = models.IntegerField(default=0)
    geom = models.PointField()
    h3_id = models.CharField(max_length=15, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['h3_id', 'occurred_at']),
        ]

class EnvMetric(models.Model):
    """Environmental metrics like lighting, air quality"""
    source = models.ForeignKey(DataSource, on_delete=models.CASCADE)
    metric = models.CharField(max_length=100) # e.g. "street_light_density"
    value = models.FloatField()
    ts = models.DateTimeField()
    geom = models.PointField(null=True, blank=True) # Optional if just h3
    h3_id = models.CharField(max_length=15, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['h3_id', 'metric']),
        ]
