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
    score = serializers.IntegerField(min_value=0, max_value=100)
    confidence = serializers.ChoiceField(choices=["low", "medium", "high"])
    reasons = ReasonSerializer(many=True)
    evidence = EvidenceSerializer()
