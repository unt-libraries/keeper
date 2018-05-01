import json

from django.shortcuts import render
from django.http import HttpResponse, JsonResponse
from django.template.loader import render_to_string
from django.views.decorators.http import require_POST

from .forms import AccessionForm, FileForm
from .models import File, Accession, ACCEPTED_FILE_TYPES


def intro(request):
    return render(request, 'keeper/intro.html')


def index(request):
    if 'accession' in request.session:
        accession_data = request.session.get('accession')
        accession_form = AccessionForm(prefix='accession',
                                       initial={
                                           'first_name': accession_data.get('first_name', ''),
                                           'last_name': accession_data.get('last_name', ''),
                                           'affiliation': accession_data.get('affiliation', ''),
                                           'email_address': accession_data.get('email_address', ''),
                                           'phone_number': accession_data.get('phone_number', ''),
                                       })
    else:
        accession_form = AccessionForm(prefix='accession')
    file_form = FileForm(prefix='file')

    context = {
        'accepted_file_types': json.dumps(ACCEPTED_FILE_TYPES),
        'affiliation_choices': Accession.AFFILIATION_CHOICES,
        'accession_form': accession_form,
        'file_form': file_form
    }

    return render(request, 'keeper/index.html', context)


@require_POST
def submit(request):
    accession_form = AccessionForm(request.POST, prefix='accession')

    # Django only validates the last item in request.FILES, so we must
    # iterate over them to validate

    # Will be set to false if a file fails validation
    file_is_valid = True
    # Errors list is sent in response if validation fails
    file_form_errors = []

    # Copy of request.FILES to mutate and feed into FileForm for validation
    validate_request_files = request.FILES.copy()

    # request.FILES['file'] has our custom 'file' prefix and must be accessed with getlist()
    for key, value in enumerate(request.FILES.getlist('file-file')):
        validate_request_files['file-file'] = value
        bound_form = FileForm(request.POST, validate_request_files, prefix='file')
        if not bound_form.is_valid():
            file_form_errors.append({
                'file_name': value.name,
                'error': bound_form.errors
            })
            file_is_valid = False

    if accession_form.is_valid() and file_is_valid:
        accession = accession_form.save()

        for key, request_file in enumerate(request.FILES.getlist('file-file')):

            file_description = request.POST.getlist('file-file_description')[key]

            uploaded_file = File(file=request_file,
                                 accession=accession,
                                 file_description=file_description,
                                 content_type=request_file.content_type
                                 )
            uploaded_file.save()

        # Attach form data to session for easy filling of subsequent forms
        request.session['accession'] = {
            'first_name': accession.first_name,
            'last_name': accession.last_name,
            'email_address': accession.email_address,
            'phone_number': accession.phone_number,
            'description': accession.description,
            'affiliation': accession.affiliation,
            'accession_id': accession.id
        }

        # Set session cookie expiration to browser close
        request.session.set_expiry(0)

        template = render_to_string('keeper/_results.html', context=None, request=request)

        payload = {
            'success': True,
            # 'context': request.session.get('accession'),
            'template': template
        }

    else:
        payload = {
            'success': False,
            'context': request.session.get('accession'),
            'errorsForm': accession_form.errors,
            'errorsFile': file_form_errors
        }

    return JsonResponse(payload)


def stats(request):
    accession_count = Accession.objects.count()
    file_count = File.objects.count()

    context = {
        'accession_count': accession_count,
        'file_count': file_count,
    }
    return render(request, 'keeper/stats.html', context)
