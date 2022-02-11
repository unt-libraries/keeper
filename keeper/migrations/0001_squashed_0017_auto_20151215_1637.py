# -*- coding: utf-8 -*-


from django.db import migrations, models
import datetime
import keeper.validators
import keeper.models
from django.utils.timezone import utc


class Migration(migrations.Migration):

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='Accession',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('accession_number', models.CharField(unique=True, max_length=12)),
                ('date_submitted', models.DateTimeField(auto_now_add=True)),
                ('description', models.TextField(help_text=b'A description of the files you are submitting')),
                ('ip_address', models.GenericIPAddressField(null=True, blank=True)),
                ('affiliation', models.CharField(blank=True, max_length=5, choices=[(b'STU', b'Student'), (b'FAC', b'Faculty'), (b'STA', b'Staff'), (b'ALU', b'Alumni')])),
                ('email_address', models.EmailField(max_length=254, blank=True)),
                ('first_name', models.CharField(default='nobody', max_length=100)),
                ('last_name', models.CharField(default='nobody', max_length=100)),
                ('phone_number', models.CharField(help_text=b'Optional', max_length=25, blank=True)),
            ],
            options={
                'ordering': ['accession_number'],
            },
        ),
        migrations.CreateModel(
            name='File',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('file', models.FileField(upload_to=keeper.models.file_upload_location, validators=[keeper.validators.validate_file_type])),
                ('file_description', models.TextField(blank=True)),
                ('date_file_submitted', models.DateTimeField(auto_now_add=True)),
                ('accession', models.ForeignKey(to='keeper.Accession', on_delete=models.CASCADE)),
                ('content_type', models.CharField(max_length=255, blank=True)),
            ],
        ),
        migrations.AlterModelOptions(
            name='accession',
            options={'ordering': ['date_submitted']},
        ),
        migrations.RemoveField(
            model_name='accession',
            name='accession_number',
        ),
        migrations.RemoveField(
            model_name='accession',
            name='ip_address',
        ),
        migrations.AlterField(
            model_name='accession',
            name='description',
            field=models.TextField(help_text=b'A description of the files you are submitting', blank=True),
        ),
        migrations.AddField(
            model_name='accession',
            name='accession_status',
            field=models.CharField(default=b'NEW', max_length=5, blank=True, choices=[(b'NEW', b'New'), (b'REV', b'Under Review'), (b'ACC', b'Accepted'), (b'REJ', b'Rejected')]),
        ),
        migrations.AddField(
            model_name='accession',
            name='admin_notes',
            field=models.TextField(blank=True),
        ),
        migrations.AlterField(
            model_name='accession',
            name='description',
            field=models.TextField(blank=True),
        ),
        migrations.AlterField(
            model_name='accession',
            name='phone_number',
            field=models.CharField(max_length=25, blank=True),
        ),
        migrations.AlterField(
            model_name='accession',
            name='affiliation',
            field=models.CharField(max_length=5, choices=[(b'STU', b'Student'), (b'FAC', b'Faculty'), (b'STA', b'Staff'), (b'ALU', b'Alumni'), (b'OTH', b'Other')]),
        ),
        migrations.AddField(
            model_name='accession',
            name='organization_name',
            field=models.CharField(max_length=255, blank=True),
        ),
        migrations.AddField(
            model_name='accession',
            name='date_last_updated',
            field=models.DateTimeField(default=datetime.datetime(2015, 12, 14, 18, 0, 56, 364369, tzinfo=utc), auto_now=True),
            preserve_default=False,
        ),
        migrations.AlterField(
            model_name='accession',
            name='email_address',
            field=models.EmailField(max_length=254),
        ),
    ]
