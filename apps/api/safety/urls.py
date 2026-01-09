from django.urls import path
from .views import SafetySnapshotView

urlpatterns = [
    path("snapshot/", SafetySnapshotView.as_view(), name="safety-snapshot"),
]
