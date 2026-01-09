from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from .serializers import SafetySnapshotSerializer

class SafetySnapshotView(APIView):
    def GET(self, request):
        # Validate query params
        lat = request.query_params.get("lat")
        lng = request.query_params.get("lng")
        time = request.query_params.get("time")

        if not lat or not lng:
            return Response(
                {"error": "Missing lat/lng parameters"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Mock Data
        mock_data = {
            "score": 85,
            "confidence": "high",
            "reasons": [
                {
                    "factor": "Official Crime Reports",
                    "impact": "Positive",
                    "detail": "Low violent crime rate in the last 12 months."
                },
                {
                    "factor": "Environmental",
                    "impact": "Neutral",
                    "detail": "Moderate street lighting observed."
                }
            ],
            "evidence": {
                "alerts": {
                    "last_updated": timezone.now(),
                    "coverage": "Citywide"
                },
                "crime": {
                    "last_updated": timezone.now() - timezone.timedelta(days=1),
                    "coverage": "High"
                },
                "environment": {
                    "last_updated": timezone.now() - timezone.timedelta(days=7),
                    "coverage": "Satellite + StreetView"
                }
            }
        }

        serializer = SafetySnapshotSerializer(mock_data)
        return Response(serializer.data)

    def get(self, request):
        return self.GET(request)
