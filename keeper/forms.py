from django.forms import ModelForm, Textarea
from django.conf import settings
from parsley.decorators import parsleyfy

from captcha.fields import ReCaptchaField

from .models import Accession, File


@parsleyfy
class AccessionForm(ModelForm):
    captcha = ReCaptchaField()

    # No captcha if in DEBUG mode
    if getattr(settings, 'DEBUG', False):
        captcha.clean = lambda x: x[0]

    class Meta:
        model = Accession
        fields = ['first_name', 'last_name', 'email_address',
                  'phone_number', 'description', 'affiliation', 'captcha']

        widgets = {
            'description': Textarea(attrs={'rows': 5})
        }


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
