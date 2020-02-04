from __future__ import absolute_import
import os
from .models import File
from zipfile import ZIP_DEFLATED
import zipstream
from django.contrib.auth.decorators import login_required
from django.http import StreamingHttpResponse, Http404
from django.conf import settings
from .utils import generate_data_file
import six


# Zip the files in admin for download
# Solution from: http://stackoverflow.com/questions/12881294/django-create-a-zip-of-multiple-files-and-make-it-downloadable
# and: https://github.com/allanlei/python-zipstream
@login_required
def zip_files(request, app, model, pk):
    z = zipstream.ZipFile(mode='w', compression=ZIP_DEFLATED)

    storage_path = os.path.join(settings.PRIVATE_STORAGE_ROOT)
    queried_files = File.objects.filter(accession=pk)

    if len(queried_files) == 0:
        raise Http404

    filenames = [(six.text_type(f.file.name), f.file_description) for f in queried_files]
    file_dir = os.path.join(storage_path, os.path.dirname(filenames[0][0]))

    zip_filename = "accession_{}.zip".format(pk)

    for this_file in filenames:
        full_path = os.path.join(storage_path, this_file[0])
        zipped_path = os.path.join('uploads', os.path.basename(this_file[0]))
        z.write(full_path, zipped_path)

    z.write(os.path.join(file_dir, 'metadata.txt'), generate_data_file(app, model, pk, file_dir, filenames))

    response = StreamingHttpResponse(z, content_type='application/zip')
    response['Content-Disposition'] = 'attachment; filename={}'.format(zip_filename)
    return response
