from django.urls import path
from .views import (
    SafetySnapshotView,
    AlertsGeoJSONView,
    CrimeHeatmapView,
    ContextIncidentsView,
    ContextEnvironmentView,
    ContextAlertsView,
    SafetyRouteView
)

urlpatterns = [
    path('snapshot/', SafetySnapshotView.as_view(), name='snapshot'),
    path('alerts/', AlertsGeoJSONView.as_view(), name='alerts'),
    path('heatmap/', CrimeHeatmapView.as_view(), name='heatmap'),
    path('context/incidents/', ContextIncidentsView.as_view(), name='context_incidents'),
    path('context/environment/', ContextEnvironmentView.as_view(), name='context_environment'),
    path('context/alerts/', ContextAlertsView.as_view(), name='context_alerts'),
    path('routes/', SafetyRouteView.as_view(), name='routes'),
]
