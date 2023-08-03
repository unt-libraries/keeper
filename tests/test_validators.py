import pytest
from unittest import mock
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from keeper.validators import validate_file_type


def test_validate_file_type():
    # Test a valid file type - text/plain
    file_content = b"Some file content"
    file_upload = SimpleUploadedFile("file1.txt", file_content)
    validate_file_type(file_upload)  # Should not raise ValidationError

    # Test a valid file type - image/png
    file_content = b"\x89PNG\r\n\x1a\n" + b"\0" * 64 * 1024  # PNG file header + padding
    file_upload = SimpleUploadedFile("file2.png", file_content)
    with mock.patch('keeper.validators.magic.from_buffer', return_value='image/png'):
        validate_file_type(file_upload)  # Should not raise ValidationError

    # Test an invalid file type - application/x-msdos-program
    file_content = b"MZ" + b"\0" * 64 * 1024  # EXE file header + padding
    file_upload = SimpleUploadedFile("file3.exe", file_content)
    with mock.patch('keeper.validators.magic.from_buffer', return_value='application/x-msdos-program'):
        with pytest.raises(ValidationError):
            validate_file_type(file_upload)

    # Test a file with no content
    file_upload = SimpleUploadedFile("file4.txt", b"")
    with pytest.raises(ValidationError):
        validate_file_type(file_upload)


def test_validate_file_type_large_file():
    # Test a large file that exceeds the chunk size
    file_content = b"Some file content" * (64 * 1024)  # Make file larger than chunk size
    file_upload = SimpleUploadedFile("large_file.txt", file_content)
    validate_file_type(file_upload)  # Should not raise ValidationError
