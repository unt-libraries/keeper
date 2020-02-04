from __future__ import absolute_import
from django.urls import include, path, re_path
from django.contrib import admin
from keeper.views import intro, submit, index, stats
from keeper.admin_views import zip_files

app_name = 'keeper'

urlpatterns = [
    path('admin/', admin.site.urls),
    path('intro/', intro, name='intro'),
    path('', index, name='index'),
    path('submit/', submit, name='submit'),
    path('stats/', stats, name='stats'),
    re_path(r'^admin/([^/]+)/([^/]+)/([^/]+)/change/[^/]+_zip', zip_files, name='zip'),
    path('private-media/', include('private_storage.urls')),
]
