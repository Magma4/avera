from rest_framework import serializers

class EvidenceSourceSerializer(serializers.Serializer):
    last_updated = serializers.DateTimeField()
    coverage = serializers.CharField()

class EvidenceSerializer(serializers.Serializer):
    alerts = EvidenceSourceSerializer()
    crime = EvidenceSourceSerializer()
    environment = EvidenceSourceSerializer()

class ReasonSerializer(serializers.Serializer):
    factor = serializers.CharField()
    impact = serializers.CharField()
    detail = serializers.CharField()

class SafetySnapshotSerializer(serializers.Serializer):
    score = serializers.IntegerField(min_value=-1, max_value=100)
    confidence = serializers.ChoiceField(choices=["low", "medium", "high"])
    reasons = ReasonSerializer(many=True)
    evidence = EvidenceSerializer()

class IncidentMixSerializer(serializers.Serializer):
    category = serializers.CharField()
    count = serializers.IntegerField()
    pct = serializers.FloatField()

class IncidentTrendSerializer(serializers.Serializer):
    week = serializers.CharField() # ISO Date
    count = serializers.IntegerField()

class ContextMetaSerializer(serializers.Serializer):
    radius = serializers.CharField()
    total = serializers.IntegerField()
    coverage = serializers.CharField()

class IncidentsContextSerializer(serializers.Serializer):
    mix = IncidentMixSerializer(many=True)
    trend = IncidentTrendSerializer(many=True)
    meta = ContextMetaSerializer()
