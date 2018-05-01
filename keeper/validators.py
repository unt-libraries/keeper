import os
import magic
import fnmatch
from django.conf import settings
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.core.exceptions import ValidationError

from constants import ACCEPTED_FILE_TYPES


# Validator from http://blog.hayleyanderson.us/2015/07/18/validating-file-types-in-django/
def validate_file_type(upload):
    # Make uploaded file accessible for analysis by saving in tmp
    tmp_path = 'tmp/{}'.format(upload.name[2:])
    default_storage.save(tmp_path, ContentFile(upload.file.read()))
    full_tmp_path = os.path.join(settings.MEDIA_ROOT, tmp_path)

    # Get MIME type of file using python-magic and then delete
    file_type = magic.from_file(full_tmp_path, mime=True)
    default_storage.delete(tmp_path)

    def good_mimetype(mimetype_str, mimetype_lst):
        for allowed_mimetype in mimetype_lst:
            if fnmatch.fnmatch(mimetype_str, allowed_mimetype):
                return True
        return False

    # Raise validation error if uploaded file is not an acceptable form of media
    if not good_mimetype(file_type, ACCEPTED_FILE_TYPES):
        raise ValidationError('File type not supported.')
