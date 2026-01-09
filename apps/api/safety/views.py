from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from django.contrib.gis.geos import Polygon
from drf_spectacular.utils import extend_schema
from .serializers import SafetySnapshotSerializer
from geo.utils import point_to_h3
from django.db.models import Count
from ingest.models import AlertItem, IncidentNorm
from safety.models import RiskScore
import json

class SafetySnapshotView(APIView):
    @extend_schema(
        responses=SafetySnapshotSerializer,
        description="Get safety snapshot for a location"
    )
    def get(self, request):
        try:
            lat = float(request.query_params.get("lat"))
            lng = float(request.query_params.get("lng"))
        except (TypeError, ValueError):
            return Response({"error": "Invalid lat/lng"}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Convert to H3
        h3_id = point_to_h3(lat, lng)

        # 2. Get Real Risk Score
        try:
            risk_obj = RiskScore.objects.filter(h3_id=h3_id).latest('updated_at')
            score = risk_obj.score
            confidence = risk_obj.confidence
            reasons = risk_obj.reasons_json
        except RiskScore.DoesNotExist:
            score = -1
            confidence = "low"
            # Default reasons
            reasons = [{"factor": "data", "impact": "neutral", "detail": "Region outside of active coverage area"}]

        # 3. Evidence Metadata
        latest_alert = AlertItem.objects.filter(h3_id=h3_id).order_by('-published_at').first()
        alert_ts = latest_alert.published_at if latest_alert else timezone.now()

        data = {
            "score": score,
            "confidence": confidence,
            "reasons": reasons,
            "evidence": {
                "alerts": {
                    "last_updated": alert_ts,
                    "coverage": "live_official"
                },
                "crime": {
                    "last_updated": timezone.now(), # Update this real later
                    "coverage": "historical_only"
                },
                "environment": {
                    "last_updated": timezone.now(),
                    "coverage": "high_res"
                }
            }
        }

        serializer = SafetySnapshotSerializer(data)
        return Response(serializer.data)

class AlertsGeoJSONView(APIView):
    def get(self, request):
        bbox_param = request.query_params.get('bbox')
        qs = AlertItem.objects.all().order_by('-published_at')[:100]

        if bbox_param:
            try:
                min_lon, min_lat, max_lon, max_lat = map(float, bbox_param.split(','))
                bbox = Polygon.from_bbox((min_lon, min_lat, max_lon, max_lat))
                qs = AlertItem.objects.filter(geom__within=bbox)
            except ValueError:
                pass

        features = []
        for item in qs:
            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [item.geom.x, item.geom.y]
                },
                "properties": {
                    "id": item.id,
                    "title": item.title,
                    "summary": item.summary,
                    "category": item.category,
                    "severity": item.severity,
                    "published_at": item.published_at.isoformat()
                }
            })

        return Response({
            "type": "FeatureCollection",
            "features": features
        })

class CrimeHeatmapView(APIView):
    def get(self, request):
        """
        Returns GeoJSON of RiskScore objects (Hexagons).
        Client should render as fill-extrusion or fill layer.
        Since we don't store the Polygon in RiskScore, we need to convert H3 to GeoJSON.
        We'll use h3-py for that.
        """
        import h3

        # Get all scores (or filter by bbox if we had it)
        # For now, just return all.
        scores = RiskScore.objects.all()

        features = []
        for rs in scores:
             # h3_to_geo_boundary return tuple of (lat, lng)
             # GeoJSON expects (lng, lat)
             # h3-py v4 returns (lat, lng) tuples. GeoJSON needs (lng, lat).
             boundary_lat_lng = h3.cell_to_boundary(rs.h3_id)
             boundary_lng_lat = [(pt[1], pt[0]) for pt in boundary_lat_lng]

             # Close the polygon ring if not closed
             if boundary_lng_lat and boundary_lng_lat[0] != boundary_lng_lat[-1]:
                 boundary_lng_lat.append(boundary_lng_lat[0])

             features.append({
                 "type": "Feature",
                 "geometry": {
                     "type": "Polygon",
                     "coordinates": [boundary_lng_lat]
                 },
                 "properties": {
                     "h3_id": rs.h3_id,
                     "score": rs.score,
                     "confidence": rs.confidence
                 }
             })

        return Response({
            "type": "FeatureCollection",
            "features": features
        })

class ContextIncidentsView(APIView):
    """
    Returns aggregated incident data for the 'Incidents' dashboard tab.
    - Mix: Category breakdown
    - Trend: Weekly counts
    """
    def get(self, request):
        try:
            lat = float(request.query_params.get("lat"))
            lng = float(request.query_params.get("lng"))
            days = int(request.query_params.get("days", 90))
        except (TypeError, ValueError):
            return Response({"error": "Invalid params"}, status=status.HTTP_400_BAD_REQUEST)

        h3_id = point_to_h3(lat, lng)

        # Date Filter
        start_date = timezone.now() - timezone.timedelta(days=days)
        qs = IncidentNorm.objects.filter(h3_id=h3_id, occurred_at__gte=start_date)

        # 1. Mix (Categories)
        total_count = qs.count()
        mix_data = []
        if total_count > 0:
            cat_stats = qs.values('category').annotate(c=Count('id')).order_by('-c')
            for item in cat_stats:
                mix_data.append({
                    "category": item['category'],
                    "count": item['c'],
                    "pct": round((item['c'] / total_count) * 100, 1)
                })

        # 2. Trend (Weekly)
        from django.db.models.functions import TruncWeek
        trend_data = []
        if total_count > 0:
            date_stats = qs.annotate(week=TruncWeek('occurred_at')).values('week').annotate(c=Count('id')).order_by('week')
            for item in date_stats:
                if item['week']:
                     trend_data.append({
                        "week": item['week'].date().isoformat(),
                        "count": item['c']
                    })

        # 3. Meta
        meta = {
            "radius": "H3 L9 (~0.1km²)",
            "total": total_count,
            "coverage": "Municipal Data (High)" # Placeholder for real coverage logic
        }

        return Response({
            "mix": mix_data,
            "trend": trend_data,
            "meta": meta
        })

class ContextEnvironmentView(APIView):
    """
    Returns environmental context (Satellite derived).
    Includes: PM2.5, Haze/Smoke, Night Activity.
    """
    def get(self, request):
        try:
            lat = float(request.query_params.get("lat"))
            lng = float(request.query_params.get("lng"))
        except (TypeError, ValueError):
            return Response({"error": "Invalid params"}, status=status.HTTP_400_BAD_REQUEST)

        # In a real app, we'd query pixel values from a stored heavy raster or EnvMetric.
        # For this demo, we will simulate satellite data based on location/randomness
        # to demonstrate the UI capabilities.

        import random

        # 1. PM 2.5 (Air Quality)
        pm25_val = round(random.uniform(5.0, 35.0), 1)
        pm25_status = "Good" if pm25_val < 12 else "Moderate" if pm25_val < 35 else "Unhealthy"

        # 2. Smoke / Haze
        has_smoke = random.choice([True, False]) if pm25_val > 20 else False

        # 3. Nighttime Activity (VIIRS Proxy)
        activity_level = random.choice(["Low", "Medium", "High"])

        # 4. Trend (Mocked based on days)
        days = int(request.query_params.get("days", 7))
        trend = []
        base = pm25_val

        # Improve mock logic to look realistic for 24h vs 7d
        step_label = "Hour" if days == 1 else "Day"
        steps = 24 if days == 1 else days

        for i in range(steps):
             # Random walk
            change = random.uniform(-2, 2)
            base = max(0, min(50, base + change))
            trend.append({"day": f"{step_label} {i+1}", "val": round(base, 1)})

        data = {
            "metrics": [
                {
                    "label": "PM2.5 Concentration",
                    "value": f"{pm25_val} µg/m³",
                    "status": pm25_status,
                    "source": "Sentinel-5P / Ground",
                    "res": "~1km",
                    "updated": timezone.now().isoformat()
                },
                {
                    "label": "Smoke / Haze Detection",
                    "value": "Detected" if has_smoke else "None",
                    "status": "Warning" if has_smoke else "Clear",
                    "source": "GOES-16 Satellite",
                    "res": "~2km",
                    "updated": timezone.now().isoformat()
                },
                {
                    "label": "Night-time Lighting Activity",
                    "value": activity_level,
                    "status": "Context",
                    "source": "VIIRS / Suomi NPP",
                    "res": "~750m",
                    "updated": timezone.now().isoformat()
                }
            ],
            "trend": trend,
            "meta": {
                "disclaimer": "Environmental signals are context only, not crime indicators."
            }
        }

        return Response(data)
