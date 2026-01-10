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

        # 1. Convert to H3 (Try Res 9 first - High Precision NYC)
        h3_id = point_to_h3(lat, lng, resolution=9)
        risk_obj = None

        # 2. Get Real Risk Score
        try:
            risk_obj = RiskScore.objects.filter(h3_id=h3_id).latest('updated_at')
        except RiskScore.DoesNotExist:
            # Fallback: Try Res 7 (National Baseline)
            h3_id_r7 = point_to_h3(lat, lng, resolution=7)
            try:
                risk_obj = RiskScore.objects.filter(h3_id=h3_id_r7).latest('updated_at')
                h3_id = h3_id_r7 # Update h3_id reference for alerts lookup below
            except RiskScore.DoesNotExist:
                pass

        if risk_obj:
            score = risk_obj.score
            confidence = risk_obj.confidence
            reasons = risk_obj.reasons_json
        else:
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

        # 1. Determine Resolution Strategy
        # Try High Res (9) first - e.g. for NYC
        h3_id = point_to_h3(lat, lng, resolution=9)

        # Check if we have high-res data here
        # Optimization: Just check if ANY incidents exist for this hex
        if not IncidentNorm.objects.filter(h3_id=h3_id).exists():
             # Fallback to Regional (7) - for Nationwide Baseline
             h3_id_r7 = point_to_h3(lat, lng, resolution=7)
             # If we have baseline data at Res 7, use that ID.
             # If neither exists, it doesn't matter which empty ID we use, but let's stick to 7 if 9 failed?
             # No, if nothing exists, we return empty anyway.
             # But checking if r7 exists ensures we don't accidentally switch resolution if both are empty.
             # Actually, if both are empty, it returns 0.
             if IncidentNorm.objects.filter(h3_id=h3_id_r7).exists():
                 h3_id = h3_id_r7

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

        # 2. Trend (Weekly with Breakdown)
        from django.db.models.functions import TruncWeek
        from collections import defaultdict

        trend_map = defaultdict(lambda: {"count": 0, "breakdown": defaultdict(int)})

        if total_count > 0:
            # Group by Week AND Category
            stats = qs.annotate(week=TruncWeek('occurred_at')) \
                      .values('week', 'category') \
                      .annotate(c=Count('id')) \
                      .order_by('week')

            for item in stats:
                if item['week']:
                    w = item['week'].date().isoformat()
                    c = item['c']
                    cat = item['category']

                    trend_map[w]["count"] += c
                    trend_map[w]["breakdown"][cat] += c

        # Flatten for response
        trend_data = []
        for week in sorted(trend_map.keys()):
            trend_data.append({
                "week": week,
                "count": trend_map[week]["count"],
                "breakdown": dict(trend_map[week]["breakdown"])
            })

        # 3. Meta
        # Determine coverage label based on sources present
        # In a real app we'd distinct('source__type') but let's check slug conventions
        coverage_label = "Municipal Data (High)"
        if total_count > 0:
            # Check if any result is from a baseline source
            is_baseline = qs.filter(source__slug__contains='baseline').exists()
            if is_baseline:
                coverage_label = "Federal Aggregates (Baseline)"

        meta = {
            "radius": "H3 L9 (~0.1km²)",
            "total": total_count,
            "coverage": coverage_label
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

class ContextAlertsView(APIView):
    """
    Returns list of official alerts for the 'Alerts' dashboard tab.
    """
    def get(self, request):
        try:
            lat = float(request.query_params.get("lat"))
            lng = float(request.query_params.get("lng"))
        except (TypeError, ValueError):
            return Response({"error": "Invalid params"}, status=status.HTTP_400_BAD_REQUEST)

        h3_id = point_to_h3(lat, lng)

        # Get alerts with spatial radius (k=5 ~ 2.5km radius at Res 9)
        import h3
        neighbor_ids = h3.grid_disk(h3_id, 5)

        alerts = AlertItem.objects.filter(h3_id__in=neighbor_ids).select_related('source').order_by('-published_at')

        data = []
        for a in alerts:
            data.append({
                "id": a.id,
                "title": a.title,
                "summary": a.summary,
                "category": a.category,     # e.g. "transit", "weather", "safety"
                "severity": a.severity,
                "source": a.source.name,    # Credible source name
                "source_type": a.source.type,
                "published_at": a.published_at.isoformat(),
                "url": a.url
            })

        return Response({
            "alerts": data,
            "meta": {
                "count": len(data),
                "disclaimer": "Alerts from verified municipal agencies."
            }
        })
class SafetyRouteView(APIView):
    """
    Calculates a route prioritizing safety context.
    POST body: { start_lat, start_lng, end_lat, end_lng }
    """
    def post(self, request):
        print(f"DEBUG: SafetyRouteView POST received. Data: {request.data}", flush=True)
        try:
            start_lat = float(request.data.get("start_lat"))
            start_lng = float(request.data.get("start_lng"))
            end_lat = float(request.data.get("end_lat"))
            end_lng = float(request.data.get("end_lng"))
        except (TypeError, ValueError):
            return Response({"error": "Invalid coordinates"}, status=status.HTTP_400_BAD_REQUEST)

        from .services.routing import RoutingService
        service = RoutingService()
        result = service.calculate_safer_route(start_lat, start_lng, end_lat, end_lng)

        if not result:
            return Response({"error": "Could not find a route"}, status=status.HTTP_404_NOT_FOUND)

        return Response(result)
