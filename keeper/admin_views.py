import os

from .models import File
from zipfile import ZIP_DEFLATED
import zipstream

from django.contrib.auth.decorators import login_required
from django.http import StreamingHttpResponse, Http404
from django.conf import settings

from .utils import generate_data_file


# Zip the files in admin for download
# Solution from: http://stackoverflow.com/questions/12881294/django-create-a-zip-of-multiple-files-and-make-it-downloadable
# and: https://github.com/allanlei/python-zipstream
@login_required
def zip_files(request, app, model, pk):
    z = zipstream.ZipFile(mode='w', compression=ZIP_DEFLATED)

    path = os.path.join(settings.MEDIA_ROOT, 'uploads', pk)
    queried_files = File.objects.filter(accession=pk)

    if len(queried_files) is 0:
        raise Http404

    filenames = [(str(f), f.file_description) for f in queried_files]

    zip_filename = "{}.zip".format(pk)

    for this_file in filenames:
        full_path = os.path.join(path, this_file[0])
        zip_path = os.path.join(pk, this_file[0])
        z.write(full_path, zip_path)

    z.write(os.path.join(path, 'metadata.txt'), generate_data_file(app, model, pk, path, filenames))

    response = StreamingHttpResponse(z, content_type='application/zip')
    response['Content-Disposition'] = 'attachment; filename={}'.format(zip_filename)
    return response
