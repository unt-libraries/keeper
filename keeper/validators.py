import magic
import fnmatch
from django.conf import settings
from django.core.exceptions import ValidationError

from .constants import ACCEPTED_FILE_TYPES


def validate_file_type(upload):
    # Determine the size of the file
    file_size = upload.size

    if file_size <= 64 * 1024 * 1024:  # 64 MB
        # File is not too large, read the whole file
        chunk = upload.file.read()
    else:
        # File is too large, read only a chunk
        chunk = upload.file.read(64 * 1024)

    upload.file.seek(0)  # Reset file pointer back to beginning
    file_type = magic.from_buffer(chunk, mime=True)

    def good_mimetype(mimetype_str, mimetype_dict):
        for allowed_mimetype in mimetype_dict:
            if fnmatch.fnmatch(mimetype_str, allowed_mimetype):
                return True
        return False

    # Raise validation error if uploaded file is not an acceptable form of media
    if not good_mimetype(file_type, ACCEPTED_FILE_TYPES):
        raise ValidationError(f'File type {file_type} not supported.')


def validate_file_size(file):
    if file.size > settings.MAX_UPLOAD_SIZE:
        raise ValidationError(f'File size must be no more than {settings.MAX_UPLOAD_SIZE / 1024 / 1024 / 1024} GB')
