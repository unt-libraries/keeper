import os

from django.db import models
from django.utils.html import format_html

from private_storage.fields import PrivateFileField

from .constants import ACCEPTED_FILE_TYPES
from .validators import validate_file_type, validate_file_size


class Accession(models.Model):
    # Selectable status for accession
    NEW = 'NEW'
    REVIEW = 'REV'
    ACCEPTED = 'ACC'
    REJECTED = 'REJ'

    STATUS_CHOICES = (
        (NEW,       'New'),
        (REVIEW,    'Under Review'),
        (ACCEPTED,  'Accepted'),
        (REJECTED,  'Rejected'),
    )

    # Status for donor affiliation
    STUDENT = 'STU'
    FACULTY = 'FAC'
    STAFF = 'STA'
    ALUMNI = 'ALU'
    OTHER = 'OTH'

    AFFILIATION_CHOICES = (
        (STUDENT, 'Student'),
        (FACULTY, 'Faculty'),
        (STAFF, 'Staff'),
        (ALUMNI, 'Alumni'),
        (OTHER, 'Other'),
    )

    date_submitted = models.DateTimeField(auto_now_add=True)
    date_last_updated = models.DateTimeField(auto_now=True)
    description = models.TextField(blank=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    affiliation = models.CharField(max_length=25, choices=AFFILIATION_CHOICES)
    organization_name = models.CharField(blank=True, max_length=255)
    email_address = models.EmailField()
    phone_number = models.CharField(max_length=25, blank=True)
    admin_notes = models.TextField(blank=True)
    accession_status = models.CharField(max_length=25,
                                        blank=True,
                                        choices=STATUS_CHOICES,
                                        default=NEW)

    @property
    def full_name(self):
        return '{} {}'.format(self.first_name, self.last_name)

    def __str__(self):
        return '{} {}'.format(self.id, self.last_name)

    class Meta:
        ordering = ['date_submitted']


def file_upload_location(instance, filename):
    return os.path.join('uploads', str(instance.accession.id), filename)


class File(models.Model):
    file = PrivateFileField(upload_to=file_upload_location, validators=[validate_file_type, validate_file_size])
    accession = models.ForeignKey('Accession', on_delete=models.CASCADE)
    file_description = models.TextField(blank=True)
    content_type = models.CharField(max_length=255, blank=True)
    date_file_submitted = models.DateTimeField(auto_now_add=True)

    def get_filename(self):
        return os.path.basename(self.file.name)
    get_filename.short_description = 'Filename'

    def file_download_element(self):
        return format_html('<a href="{0}" download="{1}">Download file</a>',
                           self.file.url, self.get_filename())
    file_download_element.short_description = 'Download'

    def image_thumb(self):
        return format_html('<img src="{}" width="100" height="100" />', self.file.url)

    def clickable_thumb(self):
        if self.content_type.split('/')[0] == 'image':
            thumb = self.image_thumb()
        else:
            thumb = self.icon_thumb()
        return format_html('<a href="{0}" target="_blank">{1}</a>',
                           self.file.url, thumb)
    clickable_thumb.short_description = 'View file'

    def icon_thumb(self):
        mime_type = self.content_type.split('/')[0]
        if self.content_type in list(ACCEPTED_FILE_TYPES.keys()):
            icon_class = ACCEPTED_FILE_TYPES[self.content_type]
        elif '{0}/{1}'.format(mime_type, '*') in list(ACCEPTED_FILE_TYPES.keys()):
            icon_class = ACCEPTED_FILE_TYPES['{0}/{1}'.format(mime_type, '*')]
        else:
            icon_class = 'file-o'
        return format_html('<i class="far fa-{0} fa-5x"></i>', icon_class)

    def __str__(self):
        return self.get_filename()
