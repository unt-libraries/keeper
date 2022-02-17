from django.conf.urls import include
from django.contrib import admin
from django.urls import re_path

from keeper.views import intro, submit, index, stats
from keeper.admin_views import zip_files

app_name = 'keeper'

admin.autodiscover()
admin.site.enable_nav_sidebar = False

urlpatterns = [
    re_path(r'^admin/([^/]+)/([^/]+)/([^/]+)_zip', zip_files, name='zip'),
    re_path(r'^admin/', admin.site.urls),
    re_path(r'^intro/$', intro, name='intro'),
    re_path(r'^$', index, name='index'),
    re_path(r'^submit/$', submit, name='submit'),
    re_path(r'^stats/$', stats, name='stats'),
]
