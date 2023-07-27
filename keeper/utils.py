import os
from django.utils import timezone

from .models import Accession


def generate_data_file(app, model, pk, path, filenames):
    accession = Accession.objects.get(pk=pk)
    related_files = '\n'.join("{0}\n{1}".format(*f) for f in filenames)

    file_template = """Accession: {accession_id}
Download date: {download_date}
Date submitted: {date_submitted}

Status: {accession_status}
Date last updated: {date_last_updated}

Donor name: {donor_name}
Affiliation: {affiliation}
Email: {email_address}
Phone: {phone_number}

Admin notes: {admin_notes}

Accession description: {description}

Included files:
{related_files}
"""

    context = {
        "accession_id": accession.pk,
        "date_submitted": format_datetime(timezone.localtime(accession.date_submitted)),
        "date_last_updated": format_datetime(timezone.localtime(accession.date_last_updated)),
        "download_date": format_datetime(timezone.localtime(timezone.now())),
        "description": accession.description,
        "donor_name": accession.full_name,
        "affiliation": [item[1] for item in Accession.AFFILIATION_CHOICES if item[0] == accession.affiliation][0],
        "email_address": accession.email_address,
        "phone_number": accession.phone_number,
        "admin_notes": accession.admin_notes,
        "accession_status": [item[1] for item in Accession.STATUS_CHOICES if item[0] == accession.accession_status][0],
        "related_files": related_files
    }

    with open(os.path.join(path, 'metadata.txt'), 'w') as f:
        f.write(file_template.format(**context))

    return 'metadata.txt'


def format_datetime(dt):
    return dt.strftime('%Y-%m-%d %I:%M %p  %Z')
