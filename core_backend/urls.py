from __future__ import annotations

from django.conf import settings
from django.contrib import admin
from django.http import FileResponse, HttpResponseNotFound
from django.urls import include, path, re_path


def spa_index(request, *args, **kwargs):
    """Serve the built React index.html for any non-API/admin route so that
    client-side routing (React Router) works on deep links and refreshes."""
    index_file = settings.SPA_ROOT / "index.html"
    if index_file.exists():
        return FileResponse(open(index_file, "rb"))
    return HttpResponseNotFound(
        "Frontend build not found. Run `npm run build` to generate dist/."
    )


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("api.urls")),
    # Catch-all: hand everything else to the SPA. Static assets (JS/CSS in
    # dist/) are served by WhiteNoise before reaching this.
    re_path(r"^(?!api/|admin/).*$", spa_index, name="spa"),
]
