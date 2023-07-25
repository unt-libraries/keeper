import os
import magic
import fnmatch
from django.core.exceptions import ValidationError

from .constants import ACCEPTED_FILE_TYPES


def validate_file_type(upload):
    # Read a chunk of the file (64KB in this case) and get the MIME type
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
