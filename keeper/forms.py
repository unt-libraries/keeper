from django.forms import ModelForm, Textarea
from django.conf import settings
from parsley.decorators import parsleyfy

from captcha.fields import ReCaptchaField

from .models import Accession, File


@parsleyfy
class AccessionForm(ModelForm):
    class Meta:
        model = Accession
        fields = ['first_name', 'last_name', 'email_address',
                  'phone_number', 'description', 'affiliation']

        widgets = {
            'description': Textarea(attrs={'rows': 5})
        }

    if not getattr(settings, 'DEBUG', True):
        # Only include the captcha field if not in DEBUG mode
        captcha = ReCaptchaField()


@parsleyfy
class FileForm(ModelForm):
    class Meta:
        model = File
        fields = ['file', 'file_description']
        widgets = {
            'file_description': Textarea(attrs={
                'placeholder': 'File description',
                'rows': 5
            }),
        }
